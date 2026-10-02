import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ContactsService } from '../contacts/contacts.service';
import {
  Interaction,
  InteractionDirection,
  InteractionSource,
  InteractionType,
} from '../interactions/entities/interaction.entity';
import { InteractionsService } from '../interactions/interactions.service';
import { SendTemplateDto } from './dto/send-template.dto';
import { BotJobsService } from './bot-jobs.service';

export interface WhatsAppTemplate {
  name: string;
  status: string;
  language: string;
}

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
        }>;
        statuses?: Array<{ id?: string; status?: string }>;
        contacts?: Array<{ profile?: { name?: string } }>;
      };
    }>;
  }>;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly contactsService: ContactsService,
    private readonly interactionsService: InteractionsService,
    private readonly botJobsService: BotJobsService,
  ) {}

  async sendTemplate(options: SendTemplateDto, createdById?: string) {
    const { to, templateName, languageCode = 'es', params = [] } = options;
    const phone = this.normalizePhone(to);
    const contact = await this.contactsService.findOneByPhone(phone);
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(params.length > 0 && {
          components: [
            {
              type: 'body',
              parameters: params.map((text) => ({ type: 'text', text })),
            },
          ],
        }),
      },
    };
    const response = contact
      ? await this.contactsService.withConversationLock(
          contact.id,
          async (locked, manager) => {
            locked.botPaused = true;
            await manager.save(locked);
            return this.sendToMeta(payload);
          },
        )
      : await this.sendToMeta(payload);
    await this.logOutboundMessage(
      phone,
      `WhatsApp enviado (plantilla: ${templateName})`,
      InteractionSource.HUMAN,
      this.getMetaMessageId(response),
      createdById,
    );
    return response;
  }

  async sendText(
    to: string,
    text: string,
    source: InteractionSource = InteractionSource.HUMAN,
    createdById?: string,
    expectedInboundId?: string,
  ) {
    const phone = this.normalizePhone(to);
    const contact = await this.contactsService.findOneByPhone(phone);
    if (source === InteractionSource.BOT && !contact)
      throw new Error('Contacto no encontrado');
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text },
    };
    const response = contact
      ? await this.contactsService.withConversationLock(
          contact.id,
          async (locked, manager) => {
            if (source === InteractionSource.HUMAN) {
              locked.botPaused = true;
              await manager.save(locked);
            } else if (source === InteractionSource.BOT) {
              if (locked.botPaused) throw new Error('Bot pausado');
              const control: unknown = await manager.query(
                'SELECT paused FROM bot_control WHERE id = 1 FOR SHARE',
              );
              if (
                !Array.isArray(control) ||
                control.length !== 1 ||
                (control[0] as { paused?: unknown }).paused !== false
              )
                throw new Error('Pausa general activa');
              const inbound = await manager.getRepository(Interaction).findOne({
                where: {
                  contactId: locked.id,
                  type: InteractionType.WHATSAPP,
                  direction: InteractionDirection.INBOUND,
                },
                order: { createdAt: 'DESC' },
              });
              if (!expectedInboundId || inbound?.id !== expectedInboundId) {
                throw new Error('Hay un mensaje posterior del cliente');
              }
              const lastCustomerMessage =
                inbound?.messageTimestamp ?? inbound?.createdAt;
              if (
                !lastCustomerMessage ||
                Date.now() - lastCustomerMessage.getTime() >=
                  24 * 60 * 60 * 1000
              ) {
                throw new Error('Fuera de la ventana de atención de WhatsApp');
              }
            }
            return this.sendToMeta(payload);
          },
        )
      : await this.sendToMeta(payload);
    await this.logOutboundMessage(
      phone,
      text,
      source,
      this.getMetaMessageId(response),
      createdById,
    );
    return response;
  }

  setBotPaused(contactId: string, paused: boolean) {
    return this.contactsService.setBotPaused(contactId, paused);
  }

  setBotMemory(contactId: string, memory: string | null) {
    return this.contactsService.setBotMemory(contactId, memory);
  }

  async getTemplates(): Promise<WhatsAppTemplate[]> {
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';
    if (!token || !businessAccountId) {
      this.logger.warn(
        'WhatsApp no configurado: no se pueden consultar plantillas',
      );
      return [];
    }

    const apiUrl =
      process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v19.0';
    const response = await fetch(
      `${apiUrl}/${businessAccountId}/message_templates?limit=100&fields=name,status,language`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      throw new Error(
        `WhatsApp templates API error ${response.status}: ${await response.text()}`,
      );
    }

    const json = (await response.json()) as { data?: WhatsAppTemplate[] };
    return json.data ?? [];
  }

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (
      mode === 'subscribe' &&
      Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) &&
      token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ) {
      return challenge;
    }
    throw new UnauthorizedException('Token de webhook inválido');
  }

  verifyWebhookSignature(rawBody?: Buffer, signature?: string): void {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret || !rawBody || !signature?.startsWith('sha256=')) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    const receivedHex = signature.slice('sha256='.length);
    if (!/^[a-f0-9]{64}$/i.test(receivedHex)) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }
    const received = Buffer.from(receivedHex, 'hex');
    if (!timingSafeEqual(expected, received)) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }
  }

  async handleWebhook(body: unknown): Promise<void> {
    const webhook = body as WhatsAppWebhookBody;
    for (const entry of webhook.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          if (status.id && status.status) {
            await this.interactionsService.updateDeliveryStatus(
              status.id,
              status.status,
            );
          }
        }
        for (const message of change.value?.messages ?? []) {
          await this.handleIncomingMessage(
            message,
            change.value?.contacts?.[0]?.profile?.name,
          );
        }
      }
    }
  }

  private async handleIncomingMessage(
    message: {
      id?: string;
      from?: string;
      timestamp?: string;
      type?: string;
      text?: { body?: string };
      button?: { text?: string };
    },
    profileName?: string,
  ) {
    const phone = this.normalizePhone(message.from ?? '');
    if (!phone || !message.id) return;

    const contact = await this.contactsService.findOrCreateWhatsApp(
      phone,
      profileName,
    );

    const text =
      message.text?.body ??
      message.button?.text ??
      `[Mensaje tipo: ${message.type ?? 'desconocido'}]`;
    const timestampSeconds = Number(message.timestamp);
    const interactionId = await this.interactionsService.createIncomingOnce({
      contactId: contact.id,
      notes: text,
      externalMessageId: message.id,
      messageTimestamp:
        Number.isFinite(timestampSeconds) && timestampSeconds > 0
          ? new Date(timestampSeconds * 1000)
          : undefined,
    });
    if (
      interactionId &&
      process.env.BOT_MODE !== 'off' &&
      (process.env.BOT_MODE === 'draft' || process.env.BOT_MODE === 'auto')
    ) {
      await this.botJobsService.enqueue({
        inboundInteractionId: interactionId,
        contactId: contact.id,
        phone,
        question: text,
        status: message.type === 'text' ? 'pending' : 'needs_human',
        reason:
          message.type === 'text'
            ? undefined
            : 'Mensaje no textual: requiere atención humana',
      });
    }
  }

  private async sendToMeta(body: Record<string, unknown>): Promise<unknown> {
    const apiUrl =
      process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v19.0';
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
    if (!token || !phoneNumberId) {
      throw new Error(
        'WhatsApp no está configurado: faltan WHATSAPP_API_TOKEN o WHATSAPP_PHONE_NUMBER_ID',
      );
    }

    const response = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `WhatsApp API error ${response.status}: ${await response.text()}`,
      );
    }
    const result: unknown = await response.json();
    return result;
  }

  private getMetaMessageId(response: unknown): string | undefined {
    const result = response as { messages?: Array<{ id?: string }> };
    return result.messages?.[0]?.id;
  }

  private async logOutboundMessage(
    phone: string,
    notes: string,
    source: InteractionSource,
    externalMessageId?: string,
    createdById?: string,
  ) {
    try {
      const contact = await this.contactsService.findOneByPhone(phone);
      if (!contact) return;
      const interaction =
        await this.interactionsService.createSystemInteraction(
          {
            contactId: contact.id,
            type: InteractionType.WHATSAPP,
            direction: InteractionDirection.OUTBOUND,
            notes,
          },
          { source, externalMessageId, createdById },
        );
      if (source === InteractionSource.HUMAN) {
        await this.botJobsService.resolveForContact(contact.id);
      }
      if (
        source === InteractionSource.HUMAN &&
        !notes.startsWith('WhatsApp enviado (plantilla:')
      ) {
        await this.botJobsService.proposeLearning(interaction.id);
      }
    } catch (error) {
      this.logger.error(
        `WhatsApp enviado pero no se pudo guardar el historial: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private normalizePhone(phone: string) {
    return phone.replace(/\D/g, '');
  }
}
