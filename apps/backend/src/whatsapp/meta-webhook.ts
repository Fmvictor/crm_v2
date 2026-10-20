import { BadRequestException } from '@nestjs/common';

interface MetaMessage {
  id: string;
  from: string;
  to?: string;
  type: string;
  timestamp?: string;
  text?: { body?: string };
  button?: { text?: string };
}

export interface MetaStatus {
  id: string;
  recipient_id: string;
  status: string;
  timestamp: string;
  errors?: { code: number }[];
}

interface MetaWebhook {
  entry: Array<{
    changes: Array<{
      value?: {
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        messages?: MetaMessage[];
        statuses?: MetaStatus[];
      };
    }>;
  }>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseMetaWebhook(input: unknown): MetaWebhook {
  const invalid = () => {
    throw new BadRequestException('Estructura del webhook de Meta inválida.');
  };
  if (
    !record(input) ||
    input.object !== 'whatsapp_business_account' ||
    !Array.isArray(input.entry)
  )
    return invalid();
  for (const entry of input.entry) {
    if (!record(entry) || !Array.isArray(entry.changes)) return invalid();
    for (const change of entry.changes) {
      if (!record(change)) return invalid();
      if (change.value === undefined) continue;
      if (!record(change.value)) return invalid();
      const value = change.value;
      if (value.metadata !== undefined) {
        if (!record(value.metadata)) return invalid();
        for (const field of ['display_phone_number', 'phone_number_id'])
          if (
            value.metadata[field] !== undefined &&
            typeof value.metadata[field] !== 'string'
          )
            return invalid();
        if (
          process.env.WHATSAPP_PHONE_NUMBER_ID &&
          value.metadata.phone_number_id &&
          value.metadata.phone_number_id !==
            process.env.WHATSAPP_PHONE_NUMBER_ID
        )
          return invalid();
      }
      if (value.statuses !== undefined) {
        if (!Array.isArray(value.statuses)) return invalid();
        if (
          process.env.WHATSAPP_PHONE_NUMBER_ID &&
          (!record(value.metadata) ||
            value.metadata.phone_number_id !==
              process.env.WHATSAPP_PHONE_NUMBER_ID)
        )
          return invalid();
        for (const status of value.statuses) {
          if (
            !record(status) ||
            typeof status.id !== 'string' ||
            !status.id ||
            status.id.length > 160 ||
            typeof status.recipient_id !== 'string' ||
            !/^\d{7,15}$/.test(status.recipient_id) ||
            typeof status.status !== 'string' ||
            !status.status ||
            status.status.length > 40 ||
            typeof status.timestamp !== 'string' ||
            !/^\d{1,12}$/.test(status.timestamp) ||
            !Number.isFinite(
              new Date(Number(status.timestamp) * 1000).getTime(),
            )
          )
            return invalid();
          if (
            status.errors !== undefined &&
            (!Array.isArray(status.errors) ||
              status.errors.some(
                (error: unknown) =>
                  !record(error) ||
                  !Number.isSafeInteger(error.code) ||
                  Number(error.code) < 0 ||
                  Number(error.code) > 2147483647,
              ))
          )
            return invalid();
        }
      }
      if (value.messages !== undefined && !Array.isArray(value.messages))
        return invalid();
      for (const message of value.messages ?? []) {
        if (
          !record(message) ||
          typeof message.id !== 'string' ||
          !message.id ||
          message.id.length > 160 ||
          typeof message.from !== 'string' ||
          !/^\d{7,15}$/.test(message.from) ||
          typeof message.type !== 'string'
        )
          return invalid();
        if (
          message.to !== undefined &&
          (typeof message.to !== 'string' || !/^\d{7,15}$/.test(message.to))
        )
          return invalid();
        if (
          message.timestamp !== undefined &&
          (typeof message.timestamp !== 'string' ||
            !/^\d{1,12}$/.test(message.timestamp) ||
            !Number.isFinite(
              new Date(Number(message.timestamp) * 1000).getTime(),
            ))
        )
          return invalid();
        for (const [field, textField] of [
          ['text', 'body'],
          ['button', 'text'],
        ]) {
          const content = message[field];
          if (
            content !== undefined &&
            (!record(content) ||
              (content[textField] !== undefined &&
                typeof content[textField] !== 'string'))
          )
            return invalid();
        }
      }
    }
  }
  return input as unknown as MetaWebhook;
}
