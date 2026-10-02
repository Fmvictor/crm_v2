-- Apply after 20261002_whatsapp_interaction_metadata.sql.
-- The schema is additive and preserves the existing CRM interaction history.
DO $$ BEGIN
  CREATE TYPE pipeline_stage_enum AS ENUM (
    'new', 'contacted', 'qualified', 'call_scheduled', 'call_done',
    'offer_sent', 'deposit_requested', 'deposit_paid', 'enrolled', 'nurture', 'lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conversation_channel_enum AS ENUM ('whatsapp'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conversation_status_enum AS ENUM ('open', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conversation_ai_mode_enum AS ENUM ('auto', 'paused', 'human'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conversation_message_direction_enum AS ENUM ('inbound', 'outbound'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conversation_message_actor_enum AS ENUM ('lead', 'ai', 'agent', 'system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE pipeline_event_actor_enum AS ENUM ('ai', 'agent', 'system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE knowledge_document_status_enum AS ENUM ('draft', 'approved', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS "pipelineStage" pipeline_stage_enum NOT NULL DEFAULT 'new';

UPDATE contacts
SET "pipelineStage" = CASE status::text
  WHEN 'contacted' THEN 'contacted'::pipeline_stage_enum
  WHEN 'qualified' THEN 'qualified'::pipeline_stage_enum
  WHEN 'enrolled' THEN 'enrolled'::pipeline_stage_enum
  WHEN 'lost' THEN 'lost'::pipeline_stage_enum
  ELSE 'new'::pipeline_stage_enum
END
WHERE "pipelineStage" = 'new';

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel conversation_channel_enum NOT NULL DEFAULT 'whatsapp',
  "externalContactKey" varchar(80) NOT NULL,
  status conversation_status_enum NOT NULL DEFAULT 'open',
  "aiMode" conversation_ai_mode_enum NOT NULL DEFAULT 'paused',
  "pipelineStage" pipeline_stage_enum NOT NULL DEFAULT 'new',
  language varchar(10),
  "optInAt" timestamptz,
  "optOutAt" timestamptz,
  "lastInboundAt" timestamptz,
  "lastOutboundAt" timestamptz,
  "nextFollowUpAt" timestamptz,
  "followUpStep" integer NOT NULL DEFAULT 0,
  "handoffReason" varchar(255),
  "aiSummary" text,
  "contactId" uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_contact_key_unique
  ON conversations (channel, "externalContactKey");

CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "externalMessageId" varchar(160),
  direction conversation_message_direction_enum NOT NULL,
  actor conversation_message_actor_enum NOT NULL,
  "messageType" varchar(40) NOT NULL DEFAULT 'text',
  body text NOT NULL,
  metadata jsonb,
  "providerTimestamp" timestamptz,
  "conversationId" uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_external_id_unique
  ON conversation_messages ("externalMessageId") WHERE "externalMessageId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS pipeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fromStage" pipeline_stage_enum,
  "toStage" pipeline_stage_enum NOT NULL,
  actor pipeline_event_actor_enum NOT NULL,
  reason varchar(500),
  metadata jsonb,
  "conversationId" uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pipeline_events_conversation_created_idx
  ON pipeline_events ("conversationId", "createdAt");

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(160) NOT NULL,
  title varchar(500) NOT NULL,
  "sourceUrl" varchar(500) NOT NULL,
  content text NOT NULL,
  "contentHash" varchar(64),
  version integer NOT NULL DEFAULT 1,
  status knowledge_document_status_enum NOT NULL DEFAULT 'draft',
  "fetchedAt" timestamptz,
  "lastCheckedAt" timestamptz,
  "approvedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_slug_version_unique
  ON knowledge_documents (slug, version);
