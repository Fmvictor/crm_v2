import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

export class DeliveryUncertainError extends Error {
  constructor() {
    super('Envío incierto; requiere revisión humana sin reenvío automático.');
  }
}

export class DeliveryRejectedError extends Error {
  constructor(readonly statusCode: number) {
    super(`Meta rechazó el envío (HTTP ${statusCode}).`);
  }
}

export class DeliveryHistoryError extends Error {
  constructor() {
    super('Meta aceptó el envío; registro pendiente de revisión sin reenvío.');
  }
}

export class DeliveryBlockedError extends Error {
  constructor() {
    super('Envío bloqueado por el estado actual de la conversación.');
  }
}

@Injectable()
export class WhatsAppDispatchService {
  constructor(private readonly database: DataSource) {}

  async deliver(
    key: string,
    payload: unknown,
    send: () => Promise<string>,
  ): Promise<string> {
    const inserted: { id: string }[] = await this.database.query(
      `INSERT INTO whatsapp_dispatches (id, "dispatchKey", status, payload)
       VALUES ($1, $2, 'sending', $3::jsonb) ON CONFLICT ("dispatchKey") DO NOTHING RETURNING id`,
      [randomUUID(), key, JSON.stringify(payload)],
    );
    if (!inserted.length) {
      const rows: {
        status: string;
        providerMessageId: string | null;
        matching: boolean;
      }[] = await this.database.query(
        'SELECT status, "providerMessageId", (payload = $2::jsonb) AS matching FROM whatsapp_dispatches WHERE "dispatchKey" = $1',
        [key, JSON.stringify(payload)],
      );
      const existing = rows[0];
      if (
        existing?.status === 'sent' &&
        existing.providerMessageId &&
        existing.matching
      )
        return existing.providerMessageId;
      if (existing?.status === 'failed') throw new DeliveryRejectedError(0);
      // A previous process may have sent successfully before losing its DB connection.
      throw new DeliveryUncertainError();
    }
    try {
      const providerId = await send();
      if (!providerId) throw new DeliveryUncertainError();
      await this.database.query(
        `UPDATE whatsapp_dispatches SET status = 'sent', "providerMessageId" = $2,
         "updatedAt" = now() WHERE "dispatchKey" = $1`,
        [key, providerId],
      );
      return providerId;
    } catch (error) {
      const rejected = error instanceof DeliveryRejectedError;
      // Do not replace the original safety classification if the database is down.
      await this.database
        .query(
          `UPDATE whatsapp_dispatches SET status = $2, "updatedAt" = now()
         WHERE "dispatchKey" = $1`,
          [key, rejected ? 'failed' : 'uncertain'],
        )
        .catch(() => undefined);
      throw rejected ? error : new DeliveryUncertainError();
    }
  }

  async recorded(key: string): Promise<void> {
    await this.database.query(
      `UPDATE whatsapp_dispatches SET "historyRecorded" = true, "updatedAt" = now()
       WHERE "dispatchKey" = $1 AND status = 'sent'`,
      [key],
    );
  }
}
