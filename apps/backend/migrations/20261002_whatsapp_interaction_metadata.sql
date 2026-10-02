-- Apply once, before deploying the bot. Existing interactions remain valid.
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS "externalMessageId" varchar(255),
  ADD COLUMN IF NOT EXISTS source varchar(16) NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS "messageTimestamp" timestamptz,
  ADD COLUMN IF NOT EXISTS "deliveryStatus" varchar(20);

CREATE UNIQUE INDEX IF NOT EXISTS interactions_external_message_id_unique
  ON interactions ("externalMessageId")
  WHERE "externalMessageId" IS NOT NULL;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS "botPaused" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "botMemory" text,
  ADD COLUMN IF NOT EXISTS "botMemoryExpiresAt" timestamptz;

CREATE TABLE IF NOT EXISTS bot_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "inboundInteractionId" uuid NOT NULL UNIQUE,
  "contactId" uuid NOT NULL,
  phone varchar(30) NOT NULL,
  question text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  answer text,
  reason text,
  "sourceUrl" text,
  "sourceFetchedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_jobs_pending_idx
  ON bot_jobs ("createdAt") WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS bot_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  text text NOT NULL,
  "createdById" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interactionId" uuid NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'pending',
  category varchar(20) NOT NULL DEFAULT 'style',
  "approvedText" text,
  "reviewerId" uuid,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_control (
  id integer PRIMARY KEY CHECK (id = 1),
  paused boolean NOT NULL DEFAULT true,
  "updatedById" uuid,
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO bot_control (id, paused) VALUES (1, true)
ON CONFLICT (id) DO NOTHING;
