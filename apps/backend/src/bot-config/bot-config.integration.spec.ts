import { PGlite } from '@electric-sql/pglite';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { BotConfigService } from './bot-config.service';
import { BotConfigController } from './bot-config.controller';
import { BotPreviewController } from '../ai/bot-preview.controller';
import { OpenAiService } from '../ai/openai.service';
import { WebKnowledgeService } from '../ai/web-knowledge.service';
import { User, UserRole } from '../users/entities/user.entity';
import { AssistantConfiguration1760000005000 } from '../database/migrations/1760000005000-AssistantConfiguration';
import {
  BotConfiguration,
  configHash,
  defaultConfiguration,
  topicHandoff,
  validateConfiguration,
} from './config-schema';
import { buildInstructions } from './prompt-builder';
import { handoffNotice } from '../ai/conversation-language';
import { AiUsageService } from '../ai/ai-usage.service';

describe('Publicación y conocimiento del asistente en SQL aislado', () => {
  let pg: PGlite;
  let service: BotConfigService;
  let database: DataSource;
  const userId = randomUUID();
  const admin = { user: { role: UserRole.ADMIN, id: userId } } as Request & {
    user: User;
  };
  const document = {
    id: randomUUID(),
    name: 'oferta.md',
    content: '# Curso sintético\nPrecio publicado: 123 EUR.',
    enabled: true,
    validUntil: null,
  };
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE conversations(id uuid PRIMARY KEY,"nextFollowUpAt" timestamptz);
      CREATE TABLE bot_instructions(version integer,text text); INSERT INTO bot_instructions VALUES (1,'Tono adicional heredado.');
      CREATE TABLE bot_learnings(status text,"approvedText" text,"updatedAt" timestamptz); INSERT INTO bot_learnings VALUES ('approved','Ejemplo aprobado.',now()),('pending','No aprobado.',now());
      CREATE TABLE ai_usage_calls(id uuid PRIMARY KEY);`);
    await pg.query('INSERT INTO users(id) VALUES ($1)', [userId]);
    // PGlite no implementa los bloqueos de sesión de PostgreSQL. La concurrencia se verifica con PostgreSQL 16 real.
    const query = async (sql: string, params?: unknown[]) =>
      /pg_advisory_xact_lock/.test(sql)
        ? []
        : (await pg.query(sql, params)).rows;
    database = {
      manager: { query },
      query,
      transaction: (
        first: string | ((manager: EntityManager) => Promise<unknown>),
        second?: (manager: EntityManager) => Promise<unknown>,
      ) =>
        pg.transaction((tx) =>
          (typeof first === 'string' ? second! : first)({
            query: async (sql: string, params?: unknown[]) =>
              /pg_advisory_xact_lock/.test(sql)
                ? []
                : (await tx.query(sql, params)).rows,
          } as unknown as EntityManager),
        ),
    } as unknown as DataSource;
    await new AssistantConfiguration1760000005000().up({
      query,
    } as unknown as QueryRunner);
    service = new BotConfigService(database);
  }, 30_000);
  afterAll(async () => {
    await pg.close();
  });

  it('migra instrucciones y ejemplos aprobados sin incorporar pendientes', async () => {
    const initial = await service.overview();
    expect(initial.active.version).toBe(1);
    expect(initial.active.configuration.assistant).toContain(
      'Tono adicional heredado.',
    );
    expect(initial.active.configuration.examples).toEqual([
      'Ejemplo aprobado.',
    ]);
    expect(initial.activeInstructions).toContain('CONTRATO TÉCNICO PROTEGIDO');
    expect(initial.state.draft).toEqual(initial.active.configuration);
  });
  it('guardar y validar no alteran la versión activa; sólo publicar la cambia', async () => {
    const before = await service.overview();
    const draft = {
      ...before.state.draft,
      assistant: '# Nuevo asistente\nResponde con precisión.',
      documents: [document],
    };
    const saved = await service.save(draft, before.state.draftRevision, userId);
    expect(saved.active.version).toBe(1);
    expect(saved.active.configuration.assistant).not.toBe(draft.assistant);
    await expect(
      service.publish(saved.state.draftRevision, 1, userId),
    ).rejects.toThrow('Valida');
    await service.validate(saved.state.draftRevision);
    expect((await service.active()).version).toBe(1);
    await service.publish(saved.state.draftRevision, 1, userId);
    const published = await service.active();
    expect(published.version).toBe(2);
    expect(published.configuration).toEqual(draft);
    expect(published.hash).toBe(configHash(published.configuration));
  });
  it('rechaza revisiones y versiones antiguas para evitar sobrescrituras', async () => {
    const current = await service.overview();
    await expect(
      service.save(
        current.state.draft,
        current.state.draftRevision - 1,
        userId,
      ),
    ).rejects.toThrow('ha cambiado');
    await expect(
      service.validate(current.state.draftRevision - 1),
    ).rejects.toThrow('ha cambiado');
    await service.validate(current.state.draftRevision);
    await expect(
      service.publish(current.state.draftRevision, 1, userId),
    ).rejects.toThrow('ha cambiado');
    const saved = await service.save(
      current.state.draft,
      current.state.draftRevision,
      userId,
    );
    expect(saved.state.validatedHash).toBeNull();
  });
  it('recupera una versión como borrador sin cambiar el bot ni borrar historial', async () => {
    const before = await service.overview();
    const restored = await service.restore(
      1,
      before.state.draftRevision,
      userId,
    );
    expect(restored.active.version).toBe(2);
    expect(restored.state.draft).toEqual(
      restored.history.find((v) => v.version === 1)!.configuration,
    );
    expect(restored.history).toHaveLength(2);
    expect(restored.state.validatedHash).toBeNull();
  });
  it('impide publicar sin fuentes vigentes cuando la web está desactivada', async () => {
    const before = await service.overview();
    const configuration = {
      ...before.state.draft,
      documents: [{ ...document, validUntil: '2001-01-01' }],
      rules: { ...before.state.draft.rules, webEnabled: false },
    };
    const saved = await service.save(
      configuration,
      before.state.draftRevision,
      userId,
    );
    await expect(service.validate(saved.state.draftRevision)).rejects.toThrow(
      'documento vigente',
    );
    expect((await service.overview()).state.validatedHash).toBeNull();
  });
  it('cancelar seguimientos no reactiva conversaciones ni altera el historial de mensajes', async () => {
    await pg.query(
      'INSERT INTO conversations(id,"nextFollowUpAt") VALUES ($1,now())',
      [randomUUID()],
    );
    const before = await service.overview();
    const saved = await service.save(
      {
        ...before.state.draft,
        documents: [document],
        rules: { ...before.state.draft.rules, followUpsEnabled: false },
      },
      before.state.draftRevision,
      userId,
    );
    await service.validate(saved.state.draftRevision);
    await service.publish(
      saved.state.draftRevision,
      before.active.version,
      userId,
    );
    expect(
      (await pg.query('SELECT "nextFollowUpAt" FROM conversations')).rows[0]
        .nextFollowUpAt,
    ).toBeNull();
  });
  it('no consulta la web al desactivarla e identifica el contenido exacto utilizado', async () => {
    const snapshot = await service.active();
    const web = jest.fn();
    const context = await service.documentContext(snapshot, 'Precio', web);
    expect(web).not.toHaveBeenCalled();
    expect(context.sources[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(context.context).toContain('123 EUR');
    expect(context.sources).toEqual([
      {
        id: document.id,
        name: 'oferta.md',
        hash: context.sources[0].hash,
      },
    ]);
  });
  it('excluye documentos vencidos y desactivados sin devolver conocimiento inventado', async () => {
    const snapshot = await service.active();
    snapshot.configuration.documents = [
      { ...document, validUntil: '2001-01-01' },
      { ...document, id: randomUUID(), name: 'oculto.md', enabled: false },
    ];
    const result = await service.documentContext(snapshot, 'Precio', jest.fn());
    expect(result.context).toContain('No hay conocimiento autorizado');
    expect(result.sources).toHaveLength(0);
  });
  it('mantiene los documentos como fuente principal aunque falle la actualización web', async () => {
    const snapshot = await service.active();
    snapshot.configuration.rules.webEnabled = true;
    const result = await service.documentContext(snapshot, 'Precio', () =>
      Promise.resolve('No se ha podido verificar la web'),
    );
    expect(result.context).toContain('FUENTE PRINCIPAL');
    expect(result.context).not.toContain('No se ha podido verificar');
    expect(result.sources).toHaveLength(1);
    const withWeb = await service.documentContext(snapshot, 'Precio', () =>
      Promise.resolve('Dato secundario sintético.'),
    );
    expect(withWeb.context.indexOf('FUENTE PRINCIPAL')).toBeLessThan(
      withWeb.context.indexOf('FUENTE SECUNDARIA'),
    );
    expect(snapshot.configuration.documents[0].content).toBe(document.content);
  });
  it('registra versión publicada o revisión de prueba y hashes sin duplicar el contenido', async () => {
    const usage = new AiUsageService(database);
    const call = randomUUID();
    await pg.query('INSERT INTO ai_usage_calls(id) VALUES ($1)', [call]);
    await usage.annotateConfiguration(call, 2, [
      { id: document.id, name: document.name, hash: 'a'.repeat(64) },
    ]);
    const ref = (
      await pg.query('SELECT * FROM bot_config_usage_refs WHERE "callId"=$1', [
        call,
      ])
    ).rows[0];
    expect(ref.configVersion).toBe(2);
    expect(JSON.stringify(ref)).not.toContain(document.content);
    const preview = randomUUID();
    await pg.query('INSERT INTO ai_usage_calls(id) VALUES ($1)', [preview]);
    await usage.annotateConfiguration(preview, 2, [], {
      revision: 5,
      hash: 'b'.repeat(64),
    });
    expect(
      (
        await pg.query(
          'SELECT * FROM bot_config_usage_refs WHERE "callId"=$1',
          [preview],
        )
      ).rows[0],
    ).toMatchObject({
      configVersion: null,
      draftRevision: 5,
      draftHash: 'b'.repeat(64),
    });
  });
  it('sólo los administradores pueden consultar, editar, publicar o probar', async () => {
    const controller = new BotConfigController(service);
    const viewer = {
      user: { role: UserRole.VIEWER, id: userId },
    } as Request & { user: User };
    for (const operation of [
      () => controller.overview(viewer),
      () => controller.save(viewer, null),
      () => controller.validate(viewer, null),
      () => controller.publish(viewer, null),
      () => controller.restore(viewer, '1', null),
    ])
      expect(operation).toThrow('administrador');
    const model = { decide: jest.fn() };
    const preview = new BotPreviewController(
      service,
      model as unknown as OpenAiService,
      {} as WebKnowledgeService,
    );
    await expect(
      preview.preview(viewer, { question: 'Prueba', useAi: false }),
    ).rejects.toThrow('administrador');
    const current = await service.overview();
    const prepared = await preview.preview(admin, {
      revision: current.state.draftRevision,
      question: 'Curso sintético',
      useAi: false,
    });
    expect(prepared).toHaveProperty('aiUsed', false);
    expect(model.decide).not.toHaveBeenCalled();
    const handoff = await preview.preview(admin, {
      revision: current.state.draftRevision,
      question: 'I want to speak to a human',
      useAi: true,
    });
    expect(handoff).toHaveProperty('handoff', true);
    expect(model.decide).not.toHaveBeenCalled();
  });
});

describe('Límites y reglas de configuración', () => {
  it('rechaza claves ocultas, rutas, duplicados, fechas imposibles y cargas grandes', () => {
    const config = defaultConfiguration();
    const document = {
      id: randomUUID(),
      name: 'datos.md',
      content: 'Datos.',
      enabled: true,
      validUntil: null,
    };
    for (const invalid of [
      { ...config, secret: 'no' },
      { ...config, documents: [{ ...document, name: '../datos.md' }] },
      { ...config, documents: [document, document] },
      { ...config, documents: [{ ...document, validUntil: '2026-02-31' }] },
      { ...config, documents: [{ ...document, content: '\0' }] },
      {
        ...config,
        rules: { ...config.rules, supportStart: '20:00', supportEnd: '08:00' },
      },
      { ...config, rules: { ...config.rules, supportTimezone: 'UTC' } },
      { ...config, rules: { ...config.rules, followUpDays: [2] } },
      { ...config, rules: { ...config.rules, bypassOptOut: true } },
      {
        ...config,
        documents: Array.from({ length: 7 }, (_, i) => ({
          ...document,
          id: randomUUID(),
          name: `datos${i}.md`,
          content: 'a'.repeat(15000),
        })),
      },
    ])
      expect(() => validateConfiguration(invalid)).toThrow();
  });
  it('calcula la misma huella con el orden JSONB de PostgreSQL', () => {
    const config = defaultConfiguration();
    const reordered = Object.fromEntries(
      Object.entries(config).reverse(),
    ) as unknown as BotConfiguration;
    expect(configHash(config)).toBe(configHash(reordered));
  });
  it('aplica las derivaciones editables y el horario publicado', () => {
    const rules = defaultConfiguration().rules;
    expect(topicHandoff('Quiero pagar', rules)).toBe(true);
    rules.humanTopics = [];
    expect(topicHandoff('Quiero pagar', rules)).toBe(false);
    rules.extraHandoffTerms = ['Necesito financiación'];
    expect(topicHandoff('NECESITO FINANCIACION', rules)).toBe(true);
    rules.supportName = 'Equipo';
    rules.supportStart = '10:00';
    rules.supportEnd = '18:00';
    rules.supportDays = [6];
    expect(handoffNotice('es', rules)).toContain(
      'Equipo atiende sábado, de 10:00 a 18:00',
    );
    expect(
      buildInstructions({ ...defaultConfiguration(), rules }, 'new'),
    ).toContain('10:00');
    expect(buildInstructions(defaultConfiguration(), 'new')).toContain(
      'no tienes herramientas',
    );
  });
});
