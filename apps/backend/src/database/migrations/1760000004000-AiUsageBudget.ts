import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiUsageBudget1760000004000 implements MigrationInterface {
  name = 'AiUsageBudget1760000004000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE ai_budget_control (
      id integer PRIMARY KEY CHECK (id=1),
      "limitMicros" bigint NOT NULL DEFAULT 0 CHECK ("limitMicros">=0),
      version integer NOT NULL DEFAULT 0,
      "blockedPeriod" varchar(7),
      "blockedReason" varchar(255),
      "updatedBy" uuid REFERENCES users(id) ON DELETE SET NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query('INSERT INTO ai_budget_control(id) VALUES (1)');
    await runner.query(`CREATE TABLE ai_usage_calls (
      id uuid PRIMARY KEY,
      period varchar(7) NOT NULL,
      model varchar(120) NOT NULL,
      "conversationId" uuid REFERENCES conversations(id) ON DELETE SET NULL,
      status varchar(16) NOT NULL CHECK (status IN ('reserved','completed','uncertain','rejected')),
      "reservedMicros" bigint NOT NULL CHECK ("reservedMicros">=0),
      "chargedMicros" bigint NOT NULL CHECK ("chargedMicros">=0),
      "usdMicros" bigint,
      "inputTokens" integer,
      "cachedTokens" integer,
      "cacheWriteTokens" integer,
      "outputTokens" integer,
      "reasoningTokens" integer,
      "countedInputTokens" integer NOT NULL,
      "providerResponseId" varchar(160) UNIQUE,
      "httpStatus" integer,
      "durationMs" integer,
      pricing jsonb NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "finishedAt" timestamptz
    )`);
    await runner.query(
      'CREATE INDEX ai_usage_calls_period ON ai_usage_calls(period)',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    const rows = (await runner.query(
      'SELECT count(*) AS n FROM ai_usage_calls',
    )) as { n: string }[];
    if (Number(rows[0].n))
      throw new Error(
        'Conservar el registro de consumo; revertir sólo el código.',
      );
    await runner.query('DROP TABLE ai_usage_calls');
    await runner.query('DROP TABLE ai_budget_control');
  }
}
