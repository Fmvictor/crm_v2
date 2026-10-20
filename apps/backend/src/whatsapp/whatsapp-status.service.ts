import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { openAttention } from '../conversations/attention-store';
import type { MetaStatus } from './meta-webhook';

interface PendingStatus {
  providerMessageId: string;
  recipientId: string;
  conversationId: string;
}
interface ReceiptSnapshot {
  id: string;
  status: string;
  providerTimestamp: Date;
  errorCode: number | null;
}

const supported = new Set(['sent', 'delivered', 'read', 'failed']);

@Injectable()
export class WhatsAppStatusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppStatusService.name);
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(private readonly database: DataSource) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.reconcilePending(), 15_000);
    this.timer.unref?.();
    void this.reconcilePending();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async record(statuses: MetaStatus[]): Promise<void> {
    // Persistir primero y confirmar el webhook sin esperar bloqueos de un envío.
    // Los estados desconocidos no provocan reintentos perpetuos del proveedor.
    await this.database.transaction(async (manager) => {
      for (const status of statuses) {
        if (!supported.has(status.status)) continue;
        await manager.query(
          `INSERT INTO whatsapp_status_events
          (id,"providerMessageId","recipientId",status,"providerTimestamp","errorCode")
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT ("providerMessageId","recipientId",status,"providerTimestamp") DO NOTHING`,
          [
            randomUUID(),
            status.id,
            status.recipient_id,
            status.status,
            new Date(Number(status.timestamp) * 1000),
            status.status === 'failed'
              ? (status.errors?.[0]?.code ?? null)
              : null,
          ],
        );
      }
    });
  }

  async reconcilePending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const pending = await this.database.query<
        PendingStatus[]
      >(`SELECT DISTINCT e."providerMessageId", e."recipientId", m."conversationId"
        FROM whatsapp_status_events e JOIN conversation_messages m ON m."externalMessageId"=e."providerMessageId" AND m.direction='outbound'
        JOIN conversations c ON c.id=m."conversationId" AND regexp_replace(c."externalContactKey",'[^0-9]','','g')=e."recipientId"
        WHERE e."processedAt" IS NULL LIMIT 25`);
      for (const item of pending) {
        try {
          await this.database.transaction(async (manager) => {
            await manager.query(`SET LOCAL lock_timeout='1s'`);
            await manager.query(
              'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
              [item.conversationId],
            );
            const messages = await manager.query<{ id: string }[]>(
              `SELECT m.id FROM conversation_messages m JOIN conversations c ON c.id=m."conversationId"
            WHERE m."externalMessageId"=$1 AND m.direction='outbound' AND c.id=$2
            AND regexp_replace(c."externalContactKey",'[^0-9]','','g')=$3 FOR UPDATE OF c,m`,
              [item.providerMessageId, item.conversationId, item.recipientId],
            );
            if (!messages.length) return;
            const events = await manager.query<ReceiptSnapshot[]>(
              `SELECT id,status,"providerTimestamp","errorCode" FROM whatsapp_status_events
            WHERE "providerMessageId"=$1 AND "recipientId"=$2
            ORDER BY CASE status WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 2 ELSE 1 END DESC,
            "providerTimestamp" DESC`,
              [item.providerMessageId, item.recipientId],
            );
            const latest = events[0];
            if (!latest) return;
            await manager.query(
              `UPDATE conversation_messages SET "deliveryStatus"=$2,"deliveryUpdatedAt"=$3,"deliveryErrorCode"=$4 WHERE id=$1`,
              [
                messages[0].id,
                latest.status,
                latest.providerTimestamp,
                latest.status === 'failed' ? latest.errorCode : null,
              ],
            );
            if (latest.status === 'failed') {
              await openAttention(
                manager,
                item.conversationId,
                `delivery:${messages[0].id}`,
                `Entrega de WhatsApp fallida${latest.errorCode !== null ? ` (código ${latest.errorCode})` : ''}; revisar sin reenviar automáticamente.`,
              );
            }
            await manager.query(
              // Marcar sólo la instantánea leída: un callback concurrente debe
              // quedar pendiente para el siguiente ciclo de conciliación.
              `UPDATE whatsapp_status_events SET "processedAt"=now() WHERE id=ANY($1::uuid[]) AND "processedAt" IS NULL`,
              [events.map((event) => event.id)],
            );
          });
        } catch {
          this.logger.warn(
            'Confirmación pendiente de conciliación; se reintentará sin reenviar mensajes.',
          );
        }
      }
    } catch {
      this.logger.error(
        'No se pudieron conciliar confirmaciones de WhatsApp; se conservan para reintento.',
      );
    } finally {
      this.processing = false;
    }
  }
}
