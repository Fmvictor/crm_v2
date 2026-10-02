import { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsAppPipeline1760000000000 implements MigrationInterface {
  name = 'WhatsAppPipeline1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "pipeline_stage_enum" AS ENUM ('new','contacted','qualified','call_scheduled','call_done','offer_sent','deposit_requested','deposit_paid','enrolled','nurture','lost'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "conversation_channel_enum" AS ENUM ('whatsapp'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "conversation_status_enum" AS ENUM ('open','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "conversation_ai_mode_enum" AS ENUM ('auto','paused','human'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "conversation_message_direction_enum" AS ENUM ('inbound','outbound'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "conversation_message_actor_enum" AS ENUM ('lead','ai','agent','system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "pipeline_event_actor_enum" AS ENUM ('ai','agent','system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "knowledge_document_status_enum" AS ENUM ('draft','approved','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );

    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "pipelineStage" "pipeline_stage_enum" NOT NULL DEFAULT 'new'`,
    );
    await queryRunner.query(
      `UPDATE "contacts" SET "pipelineStage" = CASE "status"::text WHEN 'contacted' THEN 'contacted'::pipeline_stage_enum WHEN 'qualified' THEN 'qualified'::pipeline_stage_enum WHEN 'enrolled' THEN 'enrolled'::pipeline_stage_enum WHEN 'lost' THEN 'lost'::pipeline_stage_enum ELSE 'new'::pipeline_stage_enum END WHERE "pipelineStage" = 'new'`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel" "conversation_channel_enum" NOT NULL DEFAULT 'whatsapp', "externalContactKey" character varying(80) NOT NULL, "status" "conversation_status_enum" NOT NULL DEFAULT 'open', "aiMode" "conversation_ai_mode_enum" NOT NULL DEFAULT 'auto', "pipelineStage" "pipeline_stage_enum" NOT NULL DEFAULT 'new', "language" character varying(10), "optInAt" TIMESTAMP WITH TIME ZONE, "optOutAt" TIMESTAMP WITH TIME ZONE, "lastInboundAt" TIMESTAMP WITH TIME ZONE, "lastOutboundAt" TIMESTAMP WITH TIME ZONE, "nextFollowUpAt" TIMESTAMP WITH TIME ZONE, "followUpStep" integer NOT NULL DEFAULT 0, "handoffReason" character varying(255), "aiSummary" text, "contactId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_conversations_id" PRIMARY KEY ("id"), CONSTRAINT "FK_conversations_contact" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_conversations_channel_contact_key" ON "conversations" ("channel", "externalContactKey")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "conversation_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "externalMessageId" character varying(160), "direction" "conversation_message_direction_enum" NOT NULL, "actor" "conversation_message_actor_enum" NOT NULL, "messageType" character varying(40) NOT NULL DEFAULT 'text', "body" text NOT NULL, "metadata" jsonb, "providerTimestamp" TIMESTAMP WITH TIME ZONE, "conversationId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_conversation_messages_id" PRIMARY KEY ("id"), CONSTRAINT "FK_conversation_messages_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_conversation_messages_external_id" ON "conversation_messages" ("externalMessageId") WHERE "externalMessageId" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "pipeline_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fromStage" "pipeline_stage_enum", "toStage" "pipeline_stage_enum" NOT NULL, "actor" "pipeline_event_actor_enum" NOT NULL, "reason" character varying(500), "metadata" jsonb, "conversationId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pipeline_events_id" PRIMARY KEY ("id"), CONSTRAINT "FK_pipeline_events_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pipeline_events_conversation_created" ON "pipeline_events" ("conversationId", "createdAt")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "knowledge_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(160) NOT NULL, "title" character varying(500) NOT NULL, "sourceUrl" character varying(500) NOT NULL, "content" text NOT NULL, "version" integer NOT NULL DEFAULT 1, "status" "knowledge_document_status_enum" NOT NULL DEFAULT 'draft', "fetchedAt" TIMESTAMP WITH TIME ZONE, "approvedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_knowledge_documents_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_knowledge_documents_slug_version" ON "knowledge_documents" ("slug", "version")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pipeline_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations"`);
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN IF EXISTS "pipelineStage"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "knowledge_document_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "pipeline_event_actor_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "conversation_message_actor_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "conversation_message_direction_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "conversation_ai_mode_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "conversation_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "conversation_channel_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pipeline_stage_enum"`);
  }
}
