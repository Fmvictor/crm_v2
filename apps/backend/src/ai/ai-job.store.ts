import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';

export interface AiJob {
  id: string;
  conversationId: string;
  inboundMessageId: string;
  attempts: number;
  leaseToken: string;
}

// The message and its job must commit together. Redis is no longer the ledger.
export async function insertAiJob(
  manager: EntityManager,
  conversationId: string,
  inboundMessageId: string,
): Promise<void> {
  await manager.query(
    `INSERT INTO ai_reply_jobs (id, "conversationId", "inboundMessageId")
     VALUES ($1, $2, $3) ON CONFLICT ("inboundMessageId") DO NOTHING`,
    [randomUUID(), conversationId, inboundMessageId],
  );
}

@Injectable()
export class AiJobStore {
  constructor(private readonly database: DataSource) {}

  async claim(): Promise<AiJob | undefined> {
    return this.database.transaction(async (manager) => {
      await manager.query(
        `UPDATE ai_reply_jobs SET status = 'pending', "leaseToken" = NULL,
         "lockedUntil" = NULL WHERE status = 'running' AND "lockedUntil" < now()`,
      );
      // The final SELECT avoids the PostgreSQL driver UPDATE result tuple [rows, count].
      const rows: AiJob[] = await manager.query(
        `WITH candidate AS (
           SELECT j.id FROM ai_reply_jobs j
           JOIN conversations c ON c.id = j."conversationId"
           WHERE j.status = 'pending' AND j."availableAt" <= now()
           AND NOT EXISTS (SELECT 1 FROM ai_reply_jobs busy
             WHERE busy."conversationId" = j."conversationId" AND busy.status = 'running')
           ORDER BY j."availableAt", j.id
           FOR UPDATE OF j, c SKIP LOCKED LIMIT 1
         ), claimed AS (
         UPDATE ai_reply_jobs j SET status = 'running', attempts = attempts + 1,
           "leaseToken" = $1, "lockedUntil" = now() + interval '2 minutes'
         FROM candidate WHERE j.id = candidate.id RETURNING j.*
         ) SELECT * FROM claimed`,
        [randomUUID()],
      );
      return rows[0];
    });
  }

  async needsDeliveryReview(job: AiJob): Promise<boolean> {
    const rows: unknown[] = await this.database.query(
      `SELECT id FROM whatsapp_dispatches WHERE "dispatchKey" IN ($1, $2)
       AND (status <> 'sent' OR NOT "historyRecorded") LIMIT 1`,
      [`reply:${job.inboundMessageId}`, `handoff:${job.inboundMessageId}`],
    );
    return rows.length > 0;
  }

  async renew(job: AiJob): Promise<void> {
    await this.database.query(
      `UPDATE ai_reply_jobs SET "lockedUntil" = now() + interval '2 minutes'
       WHERE id = $1 AND "leaseToken" = $2 AND status = 'running'`,
      [job.id, job.leaseToken],
    );
  }

  async finish(job: AiJob): Promise<void> {
    await this.database.query(
      `UPDATE ai_reply_jobs SET status = 'completed', "leaseToken" = NULL,
       "lockedUntil" = NULL WHERE id = $1 AND "leaseToken" = $2`,
      [job.id, job.leaseToken],
    );
  }

  async fail(job: AiJob, terminal: boolean): Promise<void> {
    const delaySeconds = [30, 120, 600][Math.min(job.attempts - 1, 2)];
    await this.database.query(
      `UPDATE ai_reply_jobs SET status = $3, "leaseToken" = NULL,
       "lockedUntil" = NULL, "availableAt" = now() + $4 * interval '1 second'
       WHERE id = $1 AND "leaseToken" = $2`,
      [job.id, job.leaseToken, terminal ? 'failed' : 'pending', delaySeconds],
    );
  }
}
