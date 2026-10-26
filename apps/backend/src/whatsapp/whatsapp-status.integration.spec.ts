import { PGlite } from '@electric-sql/pglite';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { WhatsAppStatusService } from './whatsapp-status.service';
import { DeliveryAttention1760000003000 } from '../database/migrations/1760000003000-DeliveryAttention';
import { openAttention } from '../conversations/attention-store';

describe('Confirmaciones y atenciones persistentes en SQL aislado', () => {
  let pg: PGlite;
  let database: DataSource;
  let service: WhatsAppStatusService;
  const conversation = randomUUID(),
    message = randomUUID();
  const recipient = '000000001',
    provider = 'synthetic-provider';
  const event = (
    status: string,
    timestamp = '1700000000',
    recipient_id = recipient,
  ) => ({
    id: provider,
    recipient_id,
    status,
    timestamp,
    errors: status === 'failed' ? [{ code: 131026 }] : undefined,
  });
  const state = async () =>
    (
      await pg.query<{ deliveryStatus: string }>(
        `SELECT "deliveryStatus" FROM conversation_messages WHERE id=$1`,
        [message],
      )
    ).rows[0]?.deliveryStatus;
  const attention = async () =>
    (
      await pg.query<{
        attentionPending: boolean;
        attentionVersion: number;
        aiMode: string;
        nextFollowUpAt: Date | null;
      }>(`SELECT * FROM conversations WHERE id=$1`, [conversation])
    ).rows[0];
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE contacts(id uuid PRIMARY KEY, "pipelineStage" varchar(30) DEFAULT 'new', status varchar(30));
      CREATE TABLE pipeline_events(id uuid DEFAULT gen_random_uuid(), "conversationId" uuid, "fromStage" varchar(30), "toStage" varchar(30), actor varchar(30), reason text);
      CREATE TABLE conversations("contactId" uuid, "pipelineStage" varchar(30) DEFAULT 'new', status varchar(16) DEFAULT 'open', "optOutAt" timestamptz, id uuid PRIMARY KEY,"lifecycleVersion" integer NOT NULL DEFAULT 0,"externalContactKey" varchar(80),"aiMode" varchar(16) DEFAULT 'auto',"nextFollowUpAt" timestamptz,"handoffReason" varchar(255),"updatedAt" timestamptz DEFAULT now());
      CREATE TABLE conversation_messages(id uuid PRIMARY KEY,"externalMessageId" varchar(160),direction varchar(16),"conversationId" uuid REFERENCES conversations(id));`);
    const query = async (sql: string, params?: unknown[]) =>
      (await pg.query(sql, params)).rows;
    database = {
      query,
      transaction: async (
        action: (manager: EntityManager) => Promise<unknown>,
      ) =>
        pg.transaction((tx) =>
          action({
            query: async (sql: string, params?: unknown[]) =>
              (await tx.query(sql, params)).rows,
          } as unknown as EntityManager),
        ),
    } as unknown as DataSource;
    await new DeliveryAttention1760000003000().up({
      query,
    } as unknown as QueryRunner);
    service = new WhatsAppStatusService(database);
  }, 30_000);
  afterAll(async () => {
    await pg?.close();
  });
  beforeEach(async () => {
    await pg.exec(
      'DELETE FROM pipeline_events; DELETE FROM whatsapp_status_events; DELETE FROM conversation_attention_events; DELETE FROM conversation_messages; DELETE FROM conversations;',
    );
    await pg.query(
      `INSERT INTO conversations(id,"externalContactKey","nextFollowUpAt") VALUES ($1,$2,now())`,
      [conversation, recipient],
    );
    await pg.query(
      `INSERT INTO conversation_messages(id,"externalMessageId",direction,"conversationId") VALUES ($1,$2,'outbound',$3)`,
      [message, provider, conversation],
    );
  });

  it('guarda una sola copia del evento y separa aceptación de confirmación', async () => {
    await service.record([event('delivered'), event('delivered')]);
    expect(
      (await pg.query('SELECT * FROM whatsapp_status_events')).rows,
    ).toHaveLength(1);
    expect(await state()).toBeNull();
    await service.reconcilePending();
    expect(await state()).toBe('delivered');
  });
  it('avanza sólo al entregar y conserva una única transición ante callbacks repetidos', async () => {
    await service.record([event('sent')]);
    await service.reconcilePending();
    const stage = async () =>
      (
        await pg.query<{ pipelineStage: string }>(
          `SELECT "pipelineStage" FROM conversations WHERE id=$1`,
          [conversation],
        )
      ).rows[0].pipelineStage;
    expect(await stage()).toBe('new');
    await service.record([event('delivered')]);
    await service.reconcilePending();
    expect(await stage()).toBe('contacted');
    await service.record([event('read')]);
    await service.reconcilePending();
    expect(
      (
        await pg.query(
          `SELECT * FROM pipeline_events WHERE "conversationId"=$1`,
          [conversation],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it('no retrocede de leído con eventos repetidos o desordenados', async () => {
    await service.record([event('read')]);
    await service.reconcilePending();
    await service.record([
      event('sent', '1700000002'),
      event('failed', '1700000003'),
      event('delivered', '1699999999'),
    ]);
    await service.reconcilePending();
    expect(await state()).toBe('read');
    expect((await attention()).attentionPending).toBe(false);
  });
  it('no asocia un estado por un teléfono parecido o equivocado', async () => {
    await service.record([event('failed', '1700000000', '999000000001')]);
    await service.reconcilePending();
    expect(await state()).toBeNull();
    expect((await attention()).attentionPending).toBe(false);
  });
  it('conserva un evento que llegó antes de registrar el mensaje', async () => {
    await pg.query('DELETE FROM conversation_messages');
    await service.record([event('delivered')]);
    await service.reconcilePending();
    expect(
      (
        await pg.query(
          `SELECT * FROM whatsapp_status_events WHERE "processedAt" IS NULL`,
        )
      ).rows,
    ).toHaveLength(1);
    await pg.query(
      `INSERT INTO conversation_messages(id,"externalMessageId",direction,"conversationId") VALUES ($1,$2,'outbound',$3)`,
      [message, provider, conversation],
    );
    await service.reconcilePending();
    expect(await state()).toBe('delivered');
  });
  it('un fallo deja una atención durable, modo humano y sin seguimiento', async () => {
    await service.record([event('failed')]);
    await service.reconcilePending();
    expect(await state()).toBe('failed');
    expect(await attention()).toMatchObject({
      attentionPending: true,
      attentionVersion: 1,
      aiMode: 'human',
      nextFollowUpAt: null,
    });
    expect(
      (await pg.query('SELECT * FROM conversation_attention_events')).rows,
    ).toHaveLength(1);
    await service.record([event('failed')]);
    await service.reconcilePending();
    expect((await attention()).attentionVersion).toBe(1);
  });
  it('no reabre una atención ya resuelta al repetir un fallo antiguo', async () => {
    await service.record([event('failed')]);
    await service.reconcilePending();
    await pg.query(
      `UPDATE conversations SET "attentionPending"=false WHERE id=$1`,
      [conversation],
    );
    await pg.query(
      `UPDATE conversation_attention_events SET "resolvedAt"=now()`,
    );
    await service.record([event('failed', '1700000005')]);
    await service.reconcilePending();
    expect((await attention()).attentionPending).toBe(false);
    expect((await attention()).attentionVersion).toBe(1);
  });
  it('una entrega posterior no reactiva la IA ni cierra la atención por su cuenta', async () => {
    await service.record([event('failed')]);
    await service.reconcilePending();
    await service.record([event('delivered', '1700000001')]);
    await service.reconcilePending();
    expect(await state()).toBe('delivered');
    expect(await attention()).toMatchObject({
      aiMode: 'human',
      attentionPending: true,
    });
  });
  it('no confirma estados de mensajes entrantes', async () => {
    await pg.query(`UPDATE conversation_messages SET direction='inbound'`);
    await service.record([event('read')]);
    await service.reconcilePending();
    expect(await state()).toBeNull();
  });
  it('ignora estados nuevos no soportados sin provocar reintentos externos', async () => {
    await service.record([event('deleted')]);
    expect(
      (await pg.query('SELECT * FROM whatsapp_status_events')).rows,
    ).toHaveLength(0);
  });
  it('revierte la atención si falla la transacción del llamante', async () => {
    await expect(
      database.transaction(async (manager) => {
        await openAttention(manager, conversation, 'test', 'Prueba');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await attention()).attentionPending).toBe(false);
    expect(
      (await pg.query('SELECT * FROM conversation_attention_events')).rows,
    ).toHaveLength(0);
  });
  it('bloquea una reversión destructiva cuando ya hay evidencia', async () => {
    await service.record([event('read')]);
    await expect(
      new DeliveryAttention1760000003000().down({
        query: (sql: string, params?: unknown[]) =>
          database.query<unknown[]>(sql, params),
      } as unknown as QueryRunner),
    ).rejects.toThrow('Conservar');
  });

  it('conserva pendiente un callback llegado después de leer la instantánea', async () => {
    await service.record([event('sent')]);
    let inserted = false;
    const interleaved = new WhatsAppStatusService({
      query: (sql: string, params?: unknown[]) =>
        database.query<unknown[]>(sql, params),
      transaction: (action: (manager: EntityManager) => Promise<unknown>) =>
        database.transaction((manager) =>
          action({
            query: async (sql: string, params?: unknown[]) => {
              const result = await manager.query<unknown[]>(sql, params);
              if (sql.startsWith('SELECT id,status') && !inserted) {
                inserted = true;
                await manager.query(
                  `INSERT INTO whatsapp_status_events (id,"providerMessageId","recipientId",status,"providerTimestamp") VALUES ($1,$2,$3,'delivered',now())`,
                  [randomUUID(), provider, recipient],
                );
              }
              return result;
            },
          } as unknown as EntityManager),
        ),
    } as unknown as DataSource);
    await interleaved.reconcilePending();
    expect(await state()).toBe('sent');
    expect(
      (
        await pg.query(
          `SELECT id FROM whatsapp_status_events WHERE "processedAt" IS NULL`,
        )
      ).rows,
    ).toHaveLength(1);
    await service.reconcilePending();
    expect(await state()).toBe('delivered');
  });

  it('un bloqueo transitorio no impide conciliar otras conversaciones y se recupera después', async () => {
    const secondMessage = randomUUID(),
      secondConversation = randomUUID();
    await pg.query(
      `INSERT INTO conversations(id,"externalContactKey") VALUES ($1,$2)`,
      [secondConversation, recipient],
    );
    await pg.query(
      `INSERT INTO conversation_messages(id,"externalMessageId",direction,"conversationId") VALUES ($1,'second-provider','outbound',$2)`,
      [secondMessage, secondConversation],
    );
    await service.record([
      event('delivered'),
      { ...event('read'), id: 'second-provider' },
    ]);
    let first = true;
    const flaky = new WhatsAppStatusService({
      query: (sql: string, params?: unknown[]) =>
        database.query<unknown[]>(sql, params),
      transaction: (action: (manager: EntityManager) => Promise<unknown>) => {
        if (first) {
          first = false;
          throw new Error('lock timeout');
        }
        return database.transaction(action);
      },
    } as unknown as DataSource);
    await flaky.reconcilePending();
    expect(
      (
        await pg.query(
          `SELECT id FROM conversation_messages WHERE "deliveryStatus" IS NOT NULL`,
        )
      ).rows,
    ).toHaveLength(1);
    await service.reconcilePending();
    expect(
      (
        await pg.query(
          `SELECT id FROM conversation_messages WHERE "deliveryStatus" IS NOT NULL`,
        )
      ).rows,
    ).toHaveLength(2);
  });
});
