import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';

// El llamante mantiene el bloqueo de la conversación. La clave impide reabrir
// una atención ya resuelta al repetir un trabajo o un webhook antiguo.
export async function openAttention(
  manager: EntityManager,
  conversationId: string,
  key: string,
  reason: string,
): Promise<void> {
  const inserted = await manager.query<{ id: string }[]>(
    `INSERT INTO conversation_attention_events
    (id, "conversationId", "eventKey", reason) VALUES ($1,$2,$3,$4)
    ON CONFLICT ("conversationId", "eventKey") DO NOTHING RETURNING id`,
    [randomUUID(), conversationId, key.slice(0, 240), reason.slice(0, 255)],
  );
  if (!inserted.length) return;
  await manager.query(
    `UPDATE conversations SET "attentionPending"=true,
    "attentionVersion"="attentionVersion"+1, "lifecycleVersion"="lifecycleVersion"+1, "attentionReason"=$2,
    "attentionRequestedAt"=now(), "attentionAcknowledgedAt"=NULL,
    "attentionAcknowledgedBy"=NULL, "aiMode"='human', "handoffReason"=$2,
    "nextFollowUpAt"=NULL, "updatedAt"=now() WHERE id=$1`,
    [conversationId, reason.slice(0, 255)],
  );
}
