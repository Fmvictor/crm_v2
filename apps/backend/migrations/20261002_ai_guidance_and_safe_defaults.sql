-- Aplicar después de 20261002_whatsapp_interaction_metadata.sql.
-- Deja el bot detenido hasta que un administrador active el control global.
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

INSERT INTO bot_control (id, paused)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE conversations
  ALTER COLUMN "aiMode" SET DEFAULT 'auto';

-- El despliegue no activa conversaciones existentes sin revisión explícita.
UPDATE conversations
SET "aiMode" = 'paused'
WHERE "aiMode" = 'auto';
