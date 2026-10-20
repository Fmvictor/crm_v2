import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BotControl } from './entities/bot-control.entity';
import { randomUUID } from 'node:crypto';
import { AI_PRICING, parseUsage, reserveCost, usageCost } from './ai-pricing';

export class AiBudgetBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}
interface BudgetRow {
  limitMicros: string;
  version: number;
  blockedPeriod: string | null;
  blockedReason: string | null;
  createdAt: Date;
  period: string;
  today: string;
}
interface UsageTotals {
  charged: string;
  calls: string;
  completed: string;
  uncertain: string;
  reserved: string;
  rejected: string;
  pendingMicros: string;
  input: string;
  cached: string;
  cacheWrites: string;
  output: string;
  reasoning: string;
}
const periodSql = `to_char(now() AT TIME ZONE 'Europe/Madrid','YYYY-MM')`;
const dateSql = `to_char(now() AT TIME ZONE 'Europe/Madrid','YYYY-MM-DD')`;

@Injectable()
export class AiUsageService {
  constructor(private readonly database: DataSource) {}

  private async budget(
    manager: EntityManager,
    lock = false,
  ): Promise<BudgetRow> {
    const rows = await manager.query<BudgetRow[]>(
      `SELECT *,${periodSql} AS period,${dateSql} AS today FROM ai_budget_control WHERE id=1${lock ? ' FOR UPDATE' : ''}`,
    );
    if (!rows[0])
      throw new AiBudgetBlockedError('Control de consumo sin configurar.');
    return rows[0];
  }
  private async totals(
    manager: EntityManager,
    period: string,
  ): Promise<UsageTotals> {
    return (
      await manager.query<UsageTotals[]>(
        `SELECT COALESCE(sum("chargedMicros"),0) AS charged,count(*) AS calls,
      count(*) FILTER (WHERE status='completed') AS completed,count(*) FILTER (WHERE status='uncertain') AS uncertain,
      count(*) FILTER (WHERE status='reserved') AS reserved,count(*) FILTER (WHERE status='rejected') AS rejected,
      COALESCE(sum("chargedMicros") FILTER (WHERE status IN ('reserved','uncertain')),0) AS "pendingMicros",
      COALESCE(sum("inputTokens"),0) AS input,COALESCE(sum("cachedTokens"),0) AS cached,
      COALESCE(sum("cacheWriteTokens"),0) AS "cacheWrites",COALESCE(sum("outputTokens"),0) AS output,
      COALESCE(sum("reasoningTokens"),0) AS reasoning FROM ai_usage_calls WHERE period=$1`,
        [period],
      )
    )[0];
  }
  private reason(budget: BudgetRow, charged: number): string | null {
    if ((process.env.OPENAI_MODEL || AI_PRICING.model) !== AI_PRICING.model)
      return 'Modelo sin tarifa verificada: revisar antes de activar.';
    if (budget.today > AI_PRICING.validUntil)
      return 'Tarifas o cambio pendientes de revisión.';
    if (Number(budget.limitMicros) <= 0)
      return 'Configura un límite mensual de IA antes de activar.';
    if (budget.blockedPeriod === budget.period)
      return (
        budget.blockedReason ||
        'Presupuesto de IA bloqueado: revisar el consumo.'
      );
    if (charged >= Number(budget.limitMicros))
      return 'Límite mensual de IA alcanzado.';
    return null;
  }
  private async pause(
    manager: EntityManager,
    period: string,
    reason: string,
  ): Promise<void> {
    await manager.query(
      'UPDATE ai_budget_control SET "blockedPeriod"=$1,"blockedReason"=$2,"updatedAt"=now() WHERE id=1',
      [period, reason],
    );
    await manager.query(
      'INSERT INTO bot_control(id,paused,"updatedAt") VALUES (1,true,now()) ON CONFLICT (id) DO UPDATE SET paused=true,"updatedAt"=now()',
    );
  }

  async assertAvailable(): Promise<void> {
    const blocked = await this.database.transaction(async (manager) => {
      const budget = await this.budget(manager, true);
      const totals = await this.totals(manager, budget.period);
      const reason = this.reason(budget, Number(totals.charged));
      if (reason) await this.pause(manager, budget.period, reason);
      if (
        !reason &&
        (
          await manager.query<{ paused: boolean }[]>(
            'SELECT paused FROM bot_control WHERE id=1',
          )
        )[0]?.paused !== false
      )
        return 'El bot está pausado; no se iniciará una llamada.';
      return reason;
    });
    if (blocked) throw new AiBudgetBlockedError(blocked);
  }

  async resume(userId: string): Promise<BotControl> {
    const result = await this.database.transaction(async (manager) => {
      const budget = await this.budget(manager, true);
      const totals = await this.totals(manager, budget.period);
      const reason = this.reason(budget, Number(totals.charged));
      if (reason) {
        await this.pause(manager, budget.period, reason);
        return { reason };
      }
      await manager.query(
        'INSERT INTO bot_control(id,paused,"updatedById","updatedAt") VALUES (1,false,$1,now()) ON CONFLICT (id) DO UPDATE SET paused=false,"updatedById"=$1,"updatedAt"=now()',
        [userId],
      );
      return {
        control: await manager.findOneOrFail(BotControl, { where: { id: 1 } }),
      };
    });
    if (!result.control) throw new ConflictException(result.reason);
    return result.control;
  }

  async reserve(
    model: string,
    countedInput: number,
    conversationId?: string,
  ): Promise<string> {
    if (
      model !== AI_PRICING.model ||
      !Number.isSafeInteger(countedInput) ||
      countedInput < 1 ||
      countedInput > 922_000
    )
      throw new AiBudgetBlockedError('Conteo o modelo sin verificar.');
    const result = await this.database.transaction(async (manager) => {
      const budget = await this.budget(manager, true);
      const totals = await this.totals(manager, budget.period);
      const amount = reserveCost(countedInput);
      const reason =
        this.reason(budget, Number(totals.charged)) ||
        (Number(totals.charged) + amount > Number(budget.limitMicros)
          ? 'Saldo insuficiente para reservar la siguiente llamada de IA.'
          : null);
      if (reason) {
        await this.pause(manager, budget.period, reason);
        return { reason };
      }
      if (
        (
          await manager.query<{ paused: boolean }[]>(
            'SELECT paused FROM bot_control WHERE id=1',
          )
        )[0]?.paused !== false
      )
        return { reason: 'El bot está pausado; no se iniciará una llamada.' };
      const id = randomUUID();
      await manager.query(
        `INSERT INTO ai_usage_calls(id,period,model,"conversationId",status,"reservedMicros","chargedMicros","countedInputTokens",pricing)
        VALUES ($1,$2,$3,$4,'reserved',$5,$5,$6,$7)`,
        [
          id,
          budget.period,
          model,
          conversationId ?? null,
          amount,
          countedInput,
          JSON.stringify(AI_PRICING),
        ],
      );
      return { id };
    });
    if (!result.id)
      throw new AiBudgetBlockedError(
        result.reason || 'Presupuesto no disponible.',
      );
    return result.id;
  }

  async settle(
    id: string,
    payload: Record<string, unknown>,
    httpStatus: number,
    durationMs: number,
  ): Promise<void> {
    const usage = parseUsage(payload.usage);
    const verified =
      usage &&
      (payload.model === undefined || payload.model === AI_PRICING.model) &&
      (payload.service_tier === undefined ||
        payload.service_tier === 'default');
    if (!verified) {
      await this.uncertain(id, httpStatus, durationMs);
      throw new AiBudgetBlockedError(
        'La llamada no confirmó su consumo o tarifa; revisar sin repetirla.',
      );
    }
    const cost = usageCost(usage);
    const blocked = await this.database.transaction(async (manager) => {
      const budget = await this.budget(manager, true);
      const calls = await manager.query<
        { reservedMicros: string; status: string; period: string }[]
      >(
        'SELECT "reservedMicros",status,period FROM ai_usage_calls WHERE id=$1 FOR UPDATE',
        [id],
      );
      const call = calls[0];
      if (!call || call.status !== 'reserved') return null;
      await manager.query(
        `UPDATE ai_usage_calls SET status='completed',"chargedMicros"=$2,"usdMicros"=$3,"inputTokens"=$4,"cachedTokens"=$5,"cacheWriteTokens"=$6,"outputTokens"=$7,"reasoningTokens"=$8,"providerResponseId"=$9,"httpStatus"=$10,"durationMs"=$11,"finishedAt"=now() WHERE id=$1`,
        [
          id,
          cost.eurMicros,
          cost.usdMicros,
          usage.input,
          usage.cached,
          usage.cacheWrites,
          usage.output,
          usage.reasoning,
          typeof payload.id === 'string' && payload.id.length <= 160
            ? payload.id
            : null,
          httpStatus,
          Math.min(2_147_483_647, Math.max(0, Math.round(durationMs))),
        ],
      );
      const totals = await this.totals(manager, budget.period);
      const reason =
        cost.eurMicros > Number(call.reservedMicros)
          ? 'El consumo superó la reserva: revisar tarifas antes de continuar.'
          : this.reason(budget, Number(totals.charged));
      if (reason) await this.pause(manager, budget.period, reason);
      return reason;
    });
    if (blocked) throw new AiBudgetBlockedError(blocked);
  }

  async uncertain(
    id: string,
    httpStatus?: number,
    durationMs?: number,
  ): Promise<void> {
    await this.database.query(
      `UPDATE ai_usage_calls SET status='uncertain',"httpStatus"=$2,"durationMs"=$3,"finishedAt"=now() WHERE id=$1 AND status='reserved'`,
      [
        id,
        httpStatus ?? null,
        durationMs === undefined
          ? null
          : Math.min(2_147_483_647, Math.max(0, Math.round(durationMs))),
      ],
    );
  }
  async rejected(
    id: string,
    httpStatus: number,
    durationMs: number,
  ): Promise<void> {
    await this.database.query(
      `UPDATE ai_usage_calls SET status='rejected',"chargedMicros"=0,"httpStatus"=$2,"durationMs"=$3,"finishedAt"=now() WHERE id=$1 AND status='reserved'`,
      [
        id,
        httpStatus,
        Math.min(2_147_483_647, Math.max(0, Math.round(durationMs))),
      ],
    );
  }

  async configure(limit: unknown, version: unknown, userId: string) {
    if (
      typeof limit !== 'number' ||
      !Number.isFinite(limit) ||
      limit < 0 ||
      limit > 100_000 ||
      Math.abs(limit * 100 - Math.round(limit * 100)) > 0.000001 ||
      typeof version !== 'number' ||
      !Number.isSafeInteger(version) ||
      version < 0
    )
      throw new BadRequestException(
        'Introduce un límite válido en euros, con un máximo de dos decimales.',
      );
    await this.database.transaction(async (manager) => {
      const budget = await this.budget(manager, true);
      if (budget.version !== version)
        throw new ConflictException(
          'El presupuesto ha cambiado. Actualiza antes de guardar.',
        );
      await manager.query(
        'UPDATE ai_budget_control SET "limitMicros"=$1,version=version+1,"updatedBy"=$2,"updatedAt"=now(),"blockedPeriod"=NULL,"blockedReason"=NULL WHERE id=1',
        [Math.round(limit * 1_000_000), userId],
      );
      const current = await this.budget(manager);
      const totals = await this.totals(manager, current.period);
      const reason = this.reason(current, Number(totals.charged));
      if (reason) await this.pause(manager, current.period, reason);
      // Cambiar el límite nunca reactiva una pausa ni una conversación humana.
    });
    return this.summary();
  }

  async summary() {
    return this.database.transaction('REPEATABLE READ', async (manager) => {
      const budget = await this.budget(manager);
      const totals = await this.totals(manager, budget.period);
      const reason = this.reason(budget, Number(totals.charged));
      return {
        period: budget.period,
        timezone: 'Europe/Madrid',
        currency: 'EUR',
        monthlyLimitEur: Number(budget.limitMicros) / 1_000_000,
        accountedEur: Number(totals.charged) / 1_000_000,
        pendingEur: Number(totals.pendingMicros) / 1_000_000,
        remainingEur:
          Math.max(0, Number(budget.limitMicros) - Number(totals.charged)) /
          1_000_000,
        calls: Number(totals.calls),
        completed: Number(totals.completed),
        uncertain: Number(totals.uncertain),
        reserved: Number(totals.reserved),
        rejected: Number(totals.rejected),
        inputTokens: Number(totals.input),
        cachedTokens: Number(totals.cached),
        cacheWriteTokens: Number(totals.cacheWrites),
        outputTokens: Number(totals.output),
        reasoningTokens: Number(totals.reasoning),
        blocked: !!reason,
        blockedReason: reason,
        version: budget.version,
        trackingSince: budget.createdAt,
        pricing: AI_PRICING,
      };
    });
  }
}
