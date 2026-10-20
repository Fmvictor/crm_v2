import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReliableBotDelivery1760000002000 implements MigrationInterface {
  name = 'ReliableBotDelivery1760000002000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE ai_reply_jobs (
      id uuid PRIMARY KEY,
      "conversationId" uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      "inboundMessageId" uuid NOT NULL UNIQUE REFERENCES conversation_messages(id) ON DELETE CASCADE,
      status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
      attempts integer NOT NULL DEFAULT 0,
      "availableAt" timestamptz NOT NULL DEFAULT now(),
      "lockedUntil" timestamptz,
      "leaseToken" uuid,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      `CREATE INDEX ai_reply_jobs_due ON ai_reply_jobs ("availableAt") WHERE status = 'pending'`,
    );
    await runner.query(
      `CREATE UNIQUE INDEX ai_reply_jobs_one_running ON ai_reply_jobs ("conversationId") WHERE status = 'running'`,
    );
    await runner.query(`CREATE TABLE whatsapp_dispatches (
      id uuid PRIMARY KEY,
      "dispatchKey" varchar(200) NOT NULL UNIQUE,
      status varchar(20) NOT NULL CHECK (status IN ('sending','sent','uncertain','failed')),
      "providerMessageId" varchar(160),
      payload jsonb NOT NULL,
      "historyRecorded" boolean NOT NULL DEFAULT false,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Keep dispatch evidence on rollback. The old application ignores these tables.
    const rows = (await runner.query(`SELECT
      (SELECT count(*) FROM ai_reply_jobs) +
      (SELECT count(*) FROM whatsapp_dispatches) AS total`)) as {
      total: string;
    }[];
    if (Number(rows[0].total) !== 0)
      throw new Error(
        'Reversión bloqueada: conservar trabajos y evidencias de envío.',
      );
    await runner.query('DROP TABLE whatsapp_dispatches');
    await runner.query('DROP TABLE ai_reply_jobs');
  }
}
