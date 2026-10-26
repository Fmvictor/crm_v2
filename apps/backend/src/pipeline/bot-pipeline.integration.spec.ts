import { PGlite } from '@electric-sql/pglite';
import { QueryRunner } from 'typeorm';
import { BotPipeline1760000007000 } from '../database/migrations/1760000007000-BotPipeline';

describe('Migración del pipeline comercial', () => {
  it('conserva el historial, las bajas y los cierres; deriva etapas retiradas sin inventar matrícula', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(`
        CREATE TYPE pipeline_stage_enum AS ENUM ('new','contacted','qualified','call_scheduled','call_done','offer_sent','deposit_requested','deposit_paid','enrolled','nurture','lost');
        CREATE TABLE contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "pipelineStage" pipeline_stage_enum);
        CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "pipelineStage" pipeline_stage_enum,
          "attentionPending" boolean DEFAULT false, "attentionVersion" int DEFAULT 0,
          "lifecycleVersion" int DEFAULT 0, "attentionReason" text, "attentionRequestedAt" timestamptz,
          "attentionAcknowledgedAt" timestamptz, "attentionAcknowledgedBy" uuid, "aiMode" text DEFAULT 'auto',
          "handoffReason" text, "nextFollowUpAt" timestamptz DEFAULT now(), "updatedAt" timestamptz,
          status text DEFAULT 'open', "optOutAt" timestamptz);
        CREATE TABLE pipeline_events("conversationId" uuid, "fromStage" pipeline_stage_enum, "toStage" pipeline_stage_enum, actor text, reason text, metadata jsonb);
        CREATE TABLE conversation_attention_events(id uuid, "conversationId" uuid, "eventKey" text, reason text, UNIQUE("conversationId","eventKey"));
        INSERT INTO contacts("pipelineStage") VALUES ('deposit_paid'),('qualified');
        INSERT INTO conversations("pipelineStage",status,"optOutAt") VALUES ('deposit_paid','closed',now()), ('enrolled','open',NULL),('qualified','open',NULL);
      `);
      const query = async (sql: string, params?: unknown[]) =>
        (await pg.query(sql, params)).rows;
      const runner = { query, manager: { query } } as unknown as QueryRunner;
      const migration = new BotPipeline1760000007000();
      await migration.up(runner);
      await migration.up(runner);
      const changed = (
        await pg.query<Record<string, unknown>>(
          `SELECT * FROM conversations WHERE status='closed'`,
        )
      ).rows[0];
      expect(changed.pipelineStage).toBe('contacted');
      expect(changed.attentionPending).toBe(true);
      expect(changed.aiMode).toBe('human');
      expect(changed.nextFollowUpAt).toBeNull();
      expect(changed.optOutAt).not.toBeNull();
      expect(
        (
          await pg.query(
            `SELECT * FROM conversations WHERE "pipelineStage"='enrolled'`,
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await pg.query(
            `SELECT * FROM conversations WHERE "pipelineStage"='qualified'`,
          )
        ).rows,
      ).toHaveLength(1);
      const events = (
        await pg.query<{ fromStage: string }>('SELECT * FROM pipeline_events')
      ).rows;
      expect(events).toHaveLength(1);
      expect(events[0].fromStage).toBe('deposit_paid');
    } finally {
      await pg.close();
    }
  }, 30000);
});
