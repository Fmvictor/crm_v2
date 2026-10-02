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
ALTER TABLE conversations
  ALTER COLUMN "aiMode" SET DEFAULT 'paused';

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

-- Bring existing WhatsApp history into the conversation timeline once.
WITH contacts_with_phone AS (
  SELECT DISTINCT ON (regexp_replace(phone, '[^0-9]', '', 'g'))
    id,
    regexp_replace(phone, '[^0-9]', '', 'g') AS phone,
    "pipelineStage"
  FROM contacts
  WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
  ORDER BY regexp_replace(phone, '[^0-9]', '', 'g'), "createdAt"
)
INSERT INTO conversations (
  channel, "externalContactKey", status, "aiMode", "pipelineStage", "contactId"
)
SELECT 'whatsapp', phone, 'open', 'paused', "pipelineStage", id
FROM contacts_with_phone
ON CONFLICT (channel, "externalContactKey") DO NOTHING;

UPDATE contacts AS contact
SET "botPaused" = TRUE
FROM conversations
WHERE conversations."contactId" = contact.id
  AND conversations."aiMode" <> 'auto';

INSERT INTO conversation_messages (
  "externalMessageId", direction, actor, "messageType", body,
  "providerTimestamp", "conversationId", "createdAt"
)
SELECT
  COALESCE(interaction."externalMessageId", 'legacy-interaction:' || interaction.id::text),
  CASE WHEN interaction.direction = 'inbound' THEN 'inbound'::conversation_message_direction_enum
       ELSE 'outbound'::conversation_message_direction_enum END,
  CASE WHEN interaction.direction = 'inbound' THEN 'lead'::conversation_message_actor_enum
       WHEN interaction.source = 'bot' THEN 'ai'::conversation_message_actor_enum
       WHEN interaction.source = 'human' THEN 'agent'::conversation_message_actor_enum
       ELSE 'system'::conversation_message_actor_enum END,
  'text', interaction.notes,
  COALESCE(interaction."messageTimestamp", interaction."createdAt"),
  conversation.id, interaction."createdAt"
FROM interactions AS interaction
JOIN contacts AS contact ON contact.id = interaction."contactId"
JOIN conversations AS conversation
  ON conversation.channel = 'whatsapp'
  AND conversation."externalContactKey" = regexp_replace(contact.phone, '[^0-9]', '', 'g')
WHERE interaction.type = 'whatsapp'
  AND contact.phone IS NOT NULL
ON CONFLICT DO NOTHING;

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
