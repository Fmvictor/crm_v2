import { PGlite } from '@electric-sql/pglite';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AiJobStore, insertAiJob } from './ai-job.store';
import { ReliableBotDelivery1760000002000 } from '../database/migrations/1760000002000-ReliableBotDelivery';
import {
  DeliveryRejectedError,
  DeliveryUncertainError,
  WhatsAppDispatchService,
} from '../whatsapp/whatsapp-dispatch.service';

describe('Delivery SQL against isolated PostgreSQL (PGlite)', () => {
  let pg: PGlite;
  let database: DataSource;
  let jobs: AiJobStore;
  let dispatches: WhatsAppDispatchService;
  const conversation = randomUUID();
  const inbound = randomUUID();
  const payload = { to: '000000001', text: { body: 'Prueba sintética' } };

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(
      'CREATE TABLE conversations (id uuid PRIMARY KEY); CREATE TABLE conversation_messages (id uuid PRIMARY KEY);',
    );
    const query = async (sql: string, params?: unknown[]) =>
      (await pg.query(sql, params)).rows;
    database = {
      query,
      transaction: async (action: (m: EntityManager) => Promise<unknown>) =>
        pg.transaction(async (tx) =>
          action({
            query: async (sql: string, params?: unknown[]) =>
              (await tx.query(sql, params)).rows,
          } as unknown as EntityManager),
        ),
    } as unknown as DataSource;
    await new ReliableBotDelivery1760000002000().up({
      query,
    } as unknown as QueryRunner);
    await pg.query('INSERT INTO conversations VALUES ($1)', [conversation]);
    await pg.query('INSERT INTO conversation_messages VALUES ($1)', [inbound]);
    jobs = new AiJobStore(database);
    dispatches = new WhatsAppDispatchService(database);
  }, 30_000);
  afterAll(async () => {
    await pg?.close();
  });
  beforeEach(async () => {
    await pg.exec(
      'DELETE FROM ai_reply_jobs; DELETE FROM whatsapp_dispatches;',
    );
  });

  it('creates exactly one job for duplicate webhook deliveries', async () => {
    await insertAiJob(
      database as unknown as EntityManager,
      conversation,
      inbound,
    );
    await insertAiJob(
      database as unknown as EntityManager,
      conversation,
      inbound,
    );
    expect((await pg.query('SELECT * FROM ai_reply_jobs')).rows).toHaveLength(
      1,
    );
  });
  it('rolls back a job with its enclosing message transaction', async () => {
    await expect(
      database.transaction(async (manager) => {
        await insertAiJob(manager, conversation, inbound);
        throw new Error('synthetic persistence failure');
      }),
    ).rejects.toThrow('synthetic');
    expect((await pg.query('SELECT * FROM ai_reply_jobs')).rows).toHaveLength(
      0,
    );
  });
  it('recovers an expired lease and refuses an acknowledgement from the old worker', async () => {
    await insertAiJob(
      database as unknown as EntityManager,
      conversation,
      inbound,
    );
    const first = (await jobs.claim())!;
    expect(await jobs.claim()).toBeUndefined();
    await pg.exec(
      `UPDATE ai_reply_jobs SET "lockedUntil" = now() - interval '1 second'`,
    );
    const recovered = (await jobs.claim())!;
    expect(recovered.attempts).toBe(2);
    expect(recovered.leaseToken).not.toBe(first.leaseToken);
    await jobs.finish(first);
    expect(
      (await pg.query<{ status: string }>('SELECT status FROM ai_reply_jobs'))
        .rows[0].status,
    ).toBe('running');
    await jobs.finish(recovered);
    expect(
      (await pg.query<{ status: string }>('SELECT status FROM ai_reply_jobs'))
        .rows[0].status,
    ).toBe('completed');
  });
  it('reserves at most one job per conversation', async () => {
    const secondInbound = randomUUID();
    await pg.query('INSERT INTO conversation_messages VALUES ($1)', [
      secondInbound,
    ]);
    await insertAiJob(
      database as unknown as EntityManager,
      conversation,
      inbound,
    );
    await insertAiJob(
      database as unknown as EntityManager,
      conversation,
      secondInbound,
    );
    const first = (await jobs.claim())!;
    expect(await jobs.claim()).toBeUndefined();
    await jobs.finish(first);
    expect(await jobs.claim()).toBeDefined();
  });
  it('persists the retry delay and terminal failure', async () => {
    await insertAiJob(
      database as unknown as EntityManager,
      conversation,
      inbound,
    );
    const job = (await jobs.claim())!;
    await jobs.fail(job, false);
    expect(await jobs.claim()).toBeUndefined();
    await pg.exec(
      `UPDATE ai_reply_jobs SET "availableAt" = now() - interval '1 second'`,
    );
    const retry = (await jobs.claim())!;
    await jobs.fail(retry, true);
    expect(await jobs.claim()).toBeUndefined();
  });
  it('does not resend a successful dispatch and retains its provider identifier', async () => {
    const send = jest.fn().mockResolvedValue('provider-test-id');
    expect(await dispatches.deliver('reply:test', payload, send)).toBe(
      'provider-test-id',
    );
    expect(await dispatches.deliver('reply:test', payload, send)).toBe(
      'provider-test-id',
    );
    expect(send).toHaveBeenCalledTimes(1);
    await dispatches.recorded('reply:test');
    expect(
      (
        await pg.query<{ historyRecorded: boolean }>(
          'SELECT "historyRecorded" FROM whatsapp_dispatches',
        )
      ).rows[0].historyRecorded,
    ).toBe(true);
  });
  it('blocks replay after an ambiguous network failure', async () => {
    const send = jest
      .fn()
      .mockRejectedValue(new Error('connection lost after write'));
    await expect(
      dispatches.deliver('reply:test', payload, send),
    ).rejects.toBeInstanceOf(DeliveryUncertainError);
    await expect(
      dispatches.deliver('reply:test', payload, send),
    ).rejects.toBeInstanceOf(DeliveryUncertainError);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not resend if saving the accepted provider result fails', async () => {
    const failingDatabase = {
      query: (sql: string, params?: unknown[]) => {
        if (sql.includes("SET status = 'sent'"))
          return Promise.reject(
            new Error('write failed after provider acceptance'),
          );
        return database.query(sql, params);
      },
    } as unknown as DataSource;
    const dispatcher = new WhatsAppDispatchService(failingDatabase);
    const send = jest.fn().mockResolvedValue('provider-test-id');
    await expect(
      dispatcher.deliver('reply:test', payload, send),
    ).rejects.toBeInstanceOf(DeliveryUncertainError);
    await expect(
      dispatcher.deliver('reply:test', payload, send),
    ).rejects.toBeInstanceOf(DeliveryUncertainError);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('blocks a recovered sending record without calling Meta', async () => {
    await pg.query(
      `INSERT INTO whatsapp_dispatches (id,"dispatchKey",status,payload) VALUES ($1,'reply:test','sending',$2)`,
      [randomUUID(), JSON.stringify(payload)],
    );
    const send = jest.fn();
    await expect(
      dispatches.deliver('reply:test', payload, send),
    ).rejects.toBeInstanceOf(DeliveryUncertainError);
    expect(send).not.toHaveBeenCalled();
  });
  it('preserves a definitive rejection without storing the provider response', async () => {
    const send = jest.fn().mockRejectedValue(new DeliveryRejectedError(400));
    await expect(
      dispatches.deliver('reply:test', payload, send),
    ).rejects.toBeInstanceOf(DeliveryRejectedError);
    const rows = (
      await pg.query<{ status: string }>(
        'SELECT status FROM whatsapp_dispatches',
      )
    ).rows;
    expect(rows[0].status).toBe('failed');
  });
  it('refuses to record a different response under an already used dispatch key', async () => {
    await dispatches.deliver('reply:test', payload, () =>
      Promise.resolve('provider-test-id'),
    );
    const send = jest.fn();
    await expect(
      dispatches.deliver(
        'reply:test',
        { ...payload, text: { body: 'Changed' } },
        send,
      ),
    ).rejects.toBeInstanceOf(DeliveryUncertainError);
    expect(send).not.toHaveBeenCalled();
  });
  it('keeps dispatch evidence when reverting a nonempty migration', async () => {
    await dispatches.deliver('reply:test', payload, () =>
      Promise.resolve('provider-test-id'),
    );
    await expect(
      new ReliableBotDelivery1760000002000().down({
        query: (sql: string, params?: unknown[]) => database.query(sql, params),
      } as unknown as QueryRunner),
    ).rejects.toThrow('conservar');
  });
});
