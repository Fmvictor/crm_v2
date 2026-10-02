import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ContactsService } from '../contacts/contacts.service';
import { InteractionsService } from '../interactions/interactions.service';
import {
  InteractionDirection,
  InteractionType,
} from '../interactions/entities/interaction.entity';
import { ConversationsService } from '../conversations/conversations.service';
import { Conversation } from '../conversations/entities/conversation.entity';
import {
  ConversationMessageActor,
  ConversationMessageDirection,
} from '../conversations/entities/conversation-message.entity';
import { AiQueueService } from '../ai/ai-queue.service';

export interface SendTemplateOptions {
  to: string;
  templateName: string;
  languageCode?: string;
  params?: string[];
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @Inject(forwardRef(() => ContactsService))
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => InteractionsService))
    private readonly interactionsService: InteractionsService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    @Inject(forwardRef(() => AiQueueService))
    private readonly aiQueueService: AiQueueService,
  ) {}

  async sendTemplate(
    options: SendTemplateOptions,
    actor: ConversationMessageActor = ConversationMessageActor.SYSTEM,
  ): Promise<void> {
    const { to, templateName, languageCode = 'es', params = [] } = options;

    const apiUrl =
      process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v19.0';
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

    if (!token || !phoneNumberId) {
      this.logger.warn('WhatsApp no configurado, omitiendo envío');
      return;
    }

    // Normalizar teléfono: quitar espacios, guiones y asegurar prefijo internacional
    const phone = to.replace(/[\s\-\(\)]/g, '');

    const body = {
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

    const url = `${apiUrl}/${phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`WhatsApp API error ${res.status}: ${error}`);
    }

    const responsePayload = (await res
      .clone()
      .json()
      .catch(() => ({}))) as { messages?: Array<{ id?: string }> };
    this.logger.log(
      `WhatsApp enviado a ${phone} con plantilla "${templateName}"`,
    );

    // Log internally as interaction
    try {
      const contact = await this.contactsService.findOneByPhone(phone);
      if (contact) {
        const conversation = await this.conversationsService.findOrCreate(
          contact,
          phone,
        );
        await this.conversationsService.recordMessage(conversation, {
          externalMessageId: responsePayload.messages?.[0]?.id ?? null,
          direction: ConversationMessageDirection.OUTBOUND,
          actor,
          body: `[Plantilla WhatsApp: ${templateName}]`,
          messageType: 'template',
        });
        await this.interactionsService.createSystemInteraction({
          contactId: contact.id,
          type: InteractionType.WHATSAPP,
          direction: InteractionDirection.OUTBOUND,
          notes: `WhatsApp enviado (plantilla: ${templateName})`,
        });
      }
    } catch (err) {
      this.logger.error(
        `Error registrando interacción de WhatsApp saliente: ${err.message}`,
      );
    }
  }

  async sendText(
    to: string,
    text: string,
    actor: ConversationMessageActor = ConversationMessageActor.SYSTEM,
  ): Promise<void> {
    const apiUrl =
      process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v19.0';
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

    if (!token || !phoneNumberId) {
      this.logger.warn('WhatsApp no configurado, omitiendo envío');
      return;
    }

    const phone = to.replace(/[\s\-\(\)]/g, '');

    const body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text },
    };

    const url = `${apiUrl}/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`WhatsApp API error ${res.status}: ${error}`);
    }

    const responsePayload = (await res
      .clone()
      .json()
      .catch(() => ({}))) as { messages?: Array<{ id?: string }> };
    this.logger.log(`WhatsApp texto enviado a ${phone}`);

    try {
      const contact = await this.contactsService.findOneByPhone(phone);
      if (contact) {
        const conversation = await this.conversationsService.findOrCreate(
          contact,
          phone,
        );
        await this.conversationsService.recordMessage(conversation, {
          externalMessageId: responsePayload.messages?.[0]?.id ?? null,
          direction: ConversationMessageDirection.OUTBOUND,
          actor,
          body: text,
          messageType: 'text',
        });
        await this.interactionsService.createSystemInteraction({
          contactId: contact.id,
          type: InteractionType.WHATSAPP,
          direction: InteractionDirection.OUTBOUND,
          notes: text,
        });
      }
    } catch (err) {
      this.logger.error(
        `Error registrando interacción de WhatsApp saliente: ${err.message}`,
      );
    }
  }

  async getTemplates(): Promise<
    { name: string; status: string; language: string }[]
  > {
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';

    if (!token || !businessAccountId) {
      this.logger.warn('WhatsApp no configurado');
      return [];
    }

    const url = `https://graph.facebook.com/v19.0/${businessAccountId}/message_templates?limit=100&fields=name,status,language`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`WhatsApp templates API error ${res.status}: ${error}`);
    }

    const json = (await res.json()) as {
      data: { name: string; status: string; language: string }[];
    };
    return json.data ?? [];
  }

  async verifyWebhook(
    mode: string,
    token: string,
    challenge: string,
  ): Promise<string> {
    const MY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && token === MY_TOKEN) {
      return challenge;
    }
    throw new Error('Forbidden');
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

  async handleWebhook(body: any): Promise<void> {
    this.logger.log('Webhook de WhatsApp recibido');

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        const messages = value.messages || [];
        const metadata = value.metadata;

        if (messages.length === 0) {
          this.logger.debug(
            'Webhook recibido sin mensajes (posiblemente actualización de estado)',
          );
          continue;
        }

        for (const msg of messages) {
          try {
            const from = msg.from;
            const displayPhone = metadata?.display_phone_number?.replace(
              /\D/g,
              '',
            );
            const msgFromClean = from.replace(/\D/g, '');

            // Determinar dirección: si el 'from' es nuestro número, es saliente sync (echo)
            const isOutbound = !!(
              displayPhone && msgFromClean === displayPhone
            );
            const targetPhone = isOutbound ? (msg as any).to : from;
            const direction = isOutbound
              ? ConversationMessageDirection.OUTBOUND
              : ConversationMessageDirection.INBOUND;
            const interactionDirection = isOutbound
              ? InteractionDirection.OUTBOUND
              : InteractionDirection.INBOUND;

            const text =
              msg.text?.body ||
              msg.button?.text ||
              `[Mensaje tipo: ${msg.type}]`;

            this.logger.log(
              `Procesando mensaje WA ${direction} - De/A: ${targetPhone}`,
            );

            if (!targetPhone) {
              this.logger.warn(
                'No se pudo determinar el teléfono del contacto',
              );
              continue;
            }

            let contact =
              await this.contactsService.findOneByPhone(targetPhone);

            if (
              !contact &&
              direction === ConversationMessageDirection.INBOUND
            ) {
              this.logger.log(
                `Contacto no encontrado para ${targetPhone}, creando automáticamente...`,
              );
              contact = await this.contactsService.create({
                name: `Nuevo Contacto (WA ${targetPhone.slice(-4)})`,
                phone: targetPhone,
                source: 'whatsapp' as any,
                status: 'new' as any,
              });
            }

            if (contact) {
              const conversation = await this.conversationsService.findOrCreate(
                contact,
                targetPhone,
              );
              await this.conversationsService.recordMessage(conversation, {
                externalMessageId: msg.id ?? null,
                direction,
                actor: isOutbound
                  ? ConversationMessageActor.SYSTEM
                  : ConversationMessageActor.LEAD,
                body: text,
                messageType: msg.type ?? 'text',
                metadata: { provider: 'meta', messageType: msg.type ?? 'text' },
                providerTimestamp: msg.timestamp
                  ? new Date(Number(msg.timestamp) * 1000)
                  : null,
              });
              this.logger.log(
                `Guardando interacción WA para contacto: ${contact.name} (${contact.id})`,
              );
              await this.interactionsService.createSystemInteraction({
                contactId: contact.id,
                type: InteractionType.WHATSAPP,
                direction: interactionDirection,
                notes: text,
              });
              if (!isOutbound && process.env.AI_WHATSAPP_ENABLED === 'true') {
                await this.aiQueueService.enqueue(conversation.id);
              }
              this.logger.log('Interacción WA guardada correctamente');
            } else {
              this.logger.warn(
                `Mensaje WA de ${targetPhone} ignorado (sin contacto y no es entrante)`,
              );
            }
          } catch (err) {
            this.logger.error(
              `Error procesando mensaje individual de WA: ${err.message}`,
              err.stack,
            );
          }
        }
      }
    }
  }

  async sendConfiguredFollowUp(conversation: Conversation): Promise<boolean> {
    const step = conversation.followUpStep + 1;
    const templateName =
      process.env[`WHATSAPP_FOLLOWUP_TEMPLATE_D${[1, 3, 7, 14][step - 1]}`];
    if (!templateName || !conversation.contact?.phone) return false;
    await this.sendTemplate(
      {
        to: conversation.contact.phone,
        templateName,
        languageCode: conversation.language || 'es',
        params: [conversation.contact.name],
      },
      ConversationMessageActor.SYSTEM,
    );
    return true;
  }
}
