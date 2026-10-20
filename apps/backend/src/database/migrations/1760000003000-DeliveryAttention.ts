import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeliveryAttention1760000003000 implements MigrationInterface {
  name = 'DeliveryAttention1760000003000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS "attentionPending" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "attentionVersion" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "attentionReason" varchar(255),
      ADD COLUMN IF NOT EXISTS "attentionRequestedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "attentionAcknowledgedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "attentionAcknowledgedBy" uuid`);
    await runner.query(
      `CREATE INDEX conversations_attention_pending ON conversations ("attentionRequestedAt") WHERE "attentionPending"`,
    );
    await runner.query(`CREATE TABLE conversation_attention_events (
      id uuid PRIMARY KEY,
      "conversationId" uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      "eventKey" varchar(240) NOT NULL,
      reason varchar(255) NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "resolvedAt" timestamptz,
      "resolvedBy" uuid REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE ("conversationId", "eventKey")
    )`);
    await runner.query(`ALTER TABLE conversation_messages
      ADD COLUMN IF NOT EXISTS "deliveryStatus" varchar(16),
      ADD COLUMN IF NOT EXISTS "deliveryUpdatedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "deliveryErrorCode" integer`);
    await runner.query(`CREATE TABLE whatsapp_status_events (
      id uuid PRIMARY KEY,
      "providerMessageId" varchar(160) NOT NULL,
      "recipientId" varchar(80) NOT NULL,
      status varchar(16) NOT NULL CHECK (status IN ('sent','delivered','read','failed')),
      "providerTimestamp" timestamptz NOT NULL,
      "errorCode" integer,
      "processedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("providerMessageId", "recipientId", status, "providerTimestamp")
    )`);
    await runner.query(
      `CREATE INDEX whatsapp_status_events_pending ON whatsapp_status_events ("providerMessageId") WHERE "processedAt" IS NULL`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const rows = (await runner.query(
      `SELECT (SELECT count(*) FROM whatsapp_status_events) + (SELECT count(*) FROM conversation_attention_events) AS total`,
    )) as { total: string }[];
    if (Number(rows[0].total))
      throw new Error(
        'Conservar confirmaciones y atenciones; revertir sólo el código.',
      );
    await runner.query('DROP TABLE whatsapp_status_events');
    await runner.query('DROP TABLE conversation_attention_events');
    await runner.query(
      `ALTER TABLE conversation_messages DROP COLUMN "deliveryStatus", DROP COLUMN "deliveryUpdatedAt", DROP COLUMN "deliveryErrorCode"`,
    );
    await runner.query(
      `ALTER TABLE conversations DROP COLUMN "attentionPending", DROP COLUMN "attentionVersion", DROP COLUMN "attentionReason", DROP COLUMN "attentionRequestedAt", DROP COLUMN "attentionAcknowledgedAt", DROP COLUMN "attentionAcknowledgedBy"`,
    );
  }
}
