import { PGlite } from '@electric-sql/pglite';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AiUsageService, AiBudgetBlockedError } from './ai-usage.service';
import { AI_PRICING, parseUsage, reserveCost, usageCost } from './ai-pricing';
import { AiUsageBudget1760000004000 } from '../database/migrations/1760000004000-AiUsageBudget';
import { AiUsageController } from './ai-usage.controller';
import type { Request } from 'express';
import { User, UserRole } from '../users/entities/user.entity';

describe('Presupuesto y consumo en SQL aislado', () => {
  let pg: PGlite;
  let database: DataSource;
  let usage: AiUsageService;
  const user = randomUUID();
  const originalModel = process.env.OPENAI_MODEL;
  const payload = {
    model: AI_PRICING.model,
    service_tier: 'default',
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
      input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
      output_tokens_details: { reasoning_tokens: 50 },
    },
  };
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE conversations(id uuid PRIMARY KEY);
      CREATE TABLE bot_control(id integer PRIMARY KEY,paused boolean NOT NULL,"updatedById" uuid,"updatedAt" timestamptz DEFAULT now());INSERT INTO bot_control(id,paused) VALUES (1,false);`);
    await pg.query('INSERT INTO users(id) VALUES ($1)', [user]);
    const query = async (sql: string, params?: unknown[]) =>
      (await pg.query(sql, params)).rows;
    database = {
      query,
      transaction: (
        first: string | ((manager: EntityManager) => Promise<unknown>),
        second?: (manager: EntityManager) => Promise<unknown>,
      ) => {
        const action = typeof first === 'string' ? second! : first;
        return pg.transaction((tx) =>
          action({
            query: async (sql: string, params?: unknown[]) =>
              (await tx.query(sql, params)).rows,
            findOneOrFail: async () =>
              (await tx.query('SELECT * FROM bot_control WHERE id=1')).rows[0],
          } as unknown as EntityManager),
        );
      },
    } as unknown as DataSource;
    await new AiUsageBudget1760000004000().up({
      query,
    } as unknown as QueryRunner);
    usage = new AiUsageService(database);
  }, 30_000);
  afterAll(async () => {
    await pg.close();
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  });
  beforeEach(async () => {
    process.env.OPENAI_MODEL = AI_PRICING.model;
    await pg.exec(
      `DELETE FROM ai_usage_calls; UPDATE ai_budget_control SET "limitMicros"=100000000,version=0,"blockedPeriod"=NULL,"blockedReason"=NULL; UPDATE bot_control SET paused=false;`,
    );
  });
  it('crea el control de pausa en una instalación aún sin registro', async () => {
    await pg.exec('DELETE FROM bot_control');
    await usage.resume(user);
    expect(
      (await pg.query<{ paused: boolean }>('SELECT paused FROM bot_control'))
        .rows[0].paused,
    ).toBe(false);
    await pg.exec('DELETE FROM bot_control');
    await usage.configure(0, 0, user);
    expect(
      (await pg.query<{ paused: boolean }>('SELECT paused FROM bot_control'))
        .rows[0].paused,
    ).toBe(true);
  });
  it('ajusta una reserva al consumo real y no cuenta dos veces el razonamiento', async () => {
    const id = await usage.reserve(AI_PRICING.model, 1000);
    const reserved = await usage.summary();
    expect(reserved.reserved).toBe(1);
    expect(reserved.accountedEur).toBe(reserveCost(1000) / 1e6);
    await usage.settle(id, payload, 200, 1250);
    const summary = await usage.summary();
    expect(summary).toMatchObject({
      calls: 1,
      completed: 1,
      reserved: 0,
      inputTokens: 1000,
      cachedTokens: 200,
      cacheWriteTokens: 100,
      outputTokens: 100,
      reasoningTokens: 50,
    });
    const cost = usageCost({
      input: 1000,
      cached: 200,
      cacheWrites: 100,
      output: 100,
      reasoning: 50,
    });
    expect(cost.usdMicros).toBe(2670);
    expect(summary.accountedEur).toBe(cost.eurMicros / 1e6);
    await usage.settle(id, payload, 200, 1500);
    expect((await usage.summary()).calls).toBe(1);
  });
  it('conserva el coste y modelo históricos al contabilizar llamadas del modelo nuevo', async () => {
    const old = await usage.reserve(AI_PRICING.model, 500);
    await usage.settle(old, payload, 200, 1);
    await pg.query(
      `UPDATE ai_usage_calls SET model='gpt-6-astra',"chargedMicros"=1000000,pricing=$2 WHERE id=$1`,
      [old, JSON.stringify({ model: 'gpt-6-astra', checkedAt: '2026-10-20' })],
    );
    const next = await usage.reserve(AI_PRICING.model, 500);
    await usage.settle(next, payload, 200, 1);
    expect((await usage.summary()).accountedEur).toBe(
      1 +
        usageCost({
          input: 1000,
          cached: 200,
          cacheWrites: 100,
          output: 100,
          reasoning: 50,
        }).eurMicros /
          1e6,
    );
    expect(
      (
        await pg.query<{ model: string }>(
          'SELECT model FROM ai_usage_calls WHERE id=$1',
          [old],
        )
      ).rows[0].model,
    ).toBe('gpt-6-astra');
  });
  it('reserva antes de gastar e impide sobrepasar el saldo con peticiones concurrentes', async () => {
    await usage.configure(0.1, 0, user);
    const result = await Promise.allSettled(
      Array.from({ length: 8 }, () => usage.reserve(AI_PRICING.model, 1000)),
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const summary = await usage.summary();
    expect(summary.accountedEur).toBeLessThanOrEqual(0.5);
    expect(summary.blocked).toBe(true);
    expect(
      (await pg.query<{ paused: boolean }>('SELECT paused FROM bot_control'))
        .rows[0].paused,
    ).toBe(true);
    await expect(usage.resume(user)).rejects.toThrow();
  });
  it('conserva una reserva incierta y no permite liberar una llamada a ciegas', async () => {
    const id = await usage.reserve(AI_PRICING.model, 500);
    await usage.uncertain(id, undefined, 30_000);
    await usage.rejected(id, 400, 30_000);
    expect(await usage.summary()).toMatchObject({
      uncertain: 1,
      reserved: 0,
      accountedEur: reserveCost(500) / 1e6,
    });
  });
  it('un rechazo explícito libera su reserva y conserva el intento', async () => {
    const id = await usage.reserve(AI_PRICING.model, 500);
    await usage.rejected(id, 429, 100);
    expect(await usage.summary()).toMatchObject({
      calls: 1,
      rejected: 1,
      accountedEur: 0,
    });
  });
  it('un proceso nuevo encuentra reservas que quedaron antes del reinicio', async () => {
    await usage.reserve(AI_PRICING.model, 500);
    expect(await new AiUsageService(database).summary()).toMatchObject({
      reserved: 1,
      pendingEur: reserveCost(500) / 1e6,
    });
  });
  it('subir o guardar el límite no reactiva la pausa ni borra el consumo', async () => {
    const id = await usage.reserve(AI_PRICING.model, 500);
    await usage.uncertain(id);
    await usage.configure(0, 0, user);
    await usage.configure(100, 1, user);
    expect(
      (await pg.query<{ paused: boolean }>('SELECT paused FROM bot_control'))
        .rows[0].paused,
    ).toBe(true);
    expect((await usage.summary()).accountedEur).toBe(reserveCost(500) / 1e6);
    await usage.resume(user);
    expect(
      (await pg.query<{ paused: boolean }>('SELECT paused FROM bot_control'))
        .rows[0].paused,
    ).toBe(false);
  });
  it('rechaza una versión antigua del límite y entradas inválidas', async () => {
    await usage.configure(100, 0, user);
    await expect(usage.configure(999, 0, user)).rejects.toMatchObject({
      status: 409,
    });
    for (const value of ['100', null, -1, NaN, 0.001, Infinity, 100001])
      await expect(usage.configure(value, 1, user)).rejects.toMatchObject({
        status: 400,
      });
  });
  it('bloquea modelos sin tarifa verificada antes de reservar', async () => {
    process.env.OPENAI_MODEL = 'unknown';
    await expect(usage.assertAvailable()).rejects.toBeInstanceOf(
      AiBudgetBlockedError,
    );
    expect((await usage.summary()).calls).toBe(0);
  });
  it('conserva el saldo ante ausencia de usage o tarifa devuelta distinta', async () => {
    const id = await usage.reserve(AI_PRICING.model, 1000);
    await expect(usage.settle(id, {}, 200, 50)).rejects.toBeInstanceOf(
      AiBudgetBlockedError,
    );
    const second = await usage.reserve(AI_PRICING.model, 1000);
    await expect(
      usage.settle(second, { ...payload, service_tier: 'priority' }, 200, 50),
    ).rejects.toBeInstanceOf(AiBudgetBlockedError);
    expect((await usage.summary()).uncertain).toBe(2);
  });
  it('registra el coste y pausa si la API excede la reserva', async () => {
    const id = await usage.reserve(AI_PRICING.model, 100);
    await expect(
      usage.settle(
        id,
        { usage: { input_tokens: 50000, output_tokens: 20000 } },
        200,
        500,
      ),
    ).rejects.toBeInstanceOf(AiBudgetBlockedError);
    expect((await usage.summary()).completed).toBe(1);
    expect((await usage.summary()).blocked).toBe(true);
  });
  it('el mes nuevo no usa el gasto del anterior ni reactiva una pausa', async () => {
    const id = await usage.reserve(AI_PRICING.model, 1000);
    await usage.uncertain(id);
    await pg.exec(
      `UPDATE ai_usage_calls SET period='2000-01';UPDATE ai_budget_control SET "blockedPeriod"='2000-01',"blockedReason"='Límite antiguo';UPDATE bot_control SET paused=true;`,
    );
    expect(await usage.summary()).toMatchObject({
      accountedEur: 0,
      blocked: false,
      calls: 0,
    });
    expect(
      (await pg.query<{ paused: boolean }>('SELECT paused FROM bot_control'))
        .rows[0].paused,
    ).toBe(true);
  });
  it('el cambio de mes usa Madrid aunque la fecha UTC sea el mes anterior', async () => {
    const rows = await pg.query<{ period: string }>(
      `SELECT to_char('2026-10-31 23:30:00+00'::timestamptz AT TIME ZONE 'Europe/Madrid','YYYY-MM') AS period`,
    );
    expect(rows.rows[0].period).toBe('2026-11');
  });
  it('bloquea la reversión destructiva cuando existe consumo', async () => {
    await usage.reserve(AI_PRICING.model, 500);
    await expect(
      new AiUsageBudget1760000004000().down({
        query: (sql: string, params?: unknown[]) =>
          database.query<unknown[]>(sql, params),
      } as unknown as QueryRunner),
    ).rejects.toThrow('Conservar');
  });
  it.each([UserRole.AGENT, UserRole.VIEWER])(
    'el rol %s no puede leer ni modificar presupuestos',
    (role) => {
      const controller = new AiUsageController(usage);
      const request = { user: { id: user, role } } as Request & { user: User };
      expect(() => controller.summary(request)).toThrow('Sólo');
      expect(() =>
        controller.configure(request, { monthlyLimitEur: 100, version: 0 }),
      ).toThrow('Sólo');
    },
  );
  it('comprueba caché, escrituras, contexto largo y redondeo conservador', () => {
    expect(
      parseUsage({
        input_tokens: 100,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 80, cache_write_tokens: 30 },
      }),
    ).toBeNull();
    expect(
      parseUsage({
        input_tokens: 1,
        output_tokens: 1,
        output_tokens_details: { reasoning_tokens: 2 },
      }),
    ).toBeNull();
    const long = usageCost({
      input: 300000,
      cached: 0,
      cacheWrites: 300000,
      output: 100,
      reasoning: 0,
    });
    expect(long.usdMicros).toBe(1501500);
    expect(reserveCost(300000)).toBeGreaterThan(long.eurMicros);
  });
});
