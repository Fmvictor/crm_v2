import { EntityManager } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { BotConfigService } from '../bot-config/bot-config.service';
import type { BotSnapshot } from '../bot-config/config-schema';
import { parseMetaWebhook } from './meta-webhook';
import { randomUUID } from 'node:crypto';
import {
  WhatsAppDispatchService,
  DeliveryBlockedError,
  DeliveryRejectedError,
  DeliveryUncertainError,
  DeliveryHistoryError,
} from './whatsapp-dispatch.service';
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
import {
  Conversation,
  ConversationAiMode,
  ConversationStatus,
} from '../conversations/entities/conversation.entity';
import {
  ConversationMessageActor,
  ConversationMessageDirection,
} from '../conversations/entities/conversation-message.entity';
import { AiQueueService } from '../ai/ai-queue.service';
import { AiGuidanceService } from '../ai/ai-guidance.service';
import { WhatsAppStatusService } from './whatsapp-status.service';

export interface AutomaticDelivery {
  key: string;
  configVersion?: number;
  sources?: { id: string; name: string; hash: string }[];
  conversationId: string;
  inboundMessageId?: string;
  policy: 'reply' | 'handoff' | 'followup';
  handoffReason?: string;
  followUpStep?: number;
  dueAt?: string;
}

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
    @Inject(forwardRef(() => AiGuidanceService))
    private readonly guidanceService: AiGuidanceService,
    private readonly dispatches: WhatsAppDispatchService,
    private readonly statuses: WhatsAppStatusService,
    private readonly configuration: BotConfigService,
  ) {}

  async sendTemplate(
    options: SendTemplateOptions,
    actor: ConversationMessageActor = ConversationMessageActor.SYSTEM,
    createdById?: string,
    automatic?: AutomaticDelivery,
  ): Promise<void> {
    if (automatic) {
      return this.configuration.withActiveGuard(
        automatic.configVersion,
        async () =>
          this.conversationsService.withConversationLock(
            automatic.conversationId,
            async () => {
              await this.assertAutomaticDelivery(automatic);
              return this.sendTemplateRecorded(
                options,
                actor,
                createdById,
                automatic.key,
                automatic,
              );
            },
          ),
      );
    }
    if (actor === ConversationMessageActor.AGENT) {
      const key = randomUUID();
      return this.withManualDelivery(options.to, false, key, (manager) =>
        this.sendTemplateRecorded(
          options,
          actor,
          createdById,
          key,
          undefined,
          manager,
        ),
      );
    }
    return this.sendTemplateRecorded(options, actor, createdById, randomUUID());
  }

  private async sendTemplateRecorded(
    options: SendTemplateOptions,
    actor: ConversationMessageActor,
    createdById: string | undefined,
    dispatchKey: string,
    trace?: AutomaticDelivery,
    manager?: EntityManager,
  ): Promise<void> {
    const { to, templateName, languageCode = 'es', params = [] } = options;

    const apiUrl =
      process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v25.0';
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

    if (!token || !phoneNumberId) {
      throw new DeliveryRejectedError(0);
    }

    // Normalizar teléfono: quitar espacios, guiones y asegurar prefijo internacional
    const phone = to.replace(/[\s()-]/g, '');

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

    const providerId = await this.dispatches.deliver(dispatchKey, body, () =>
      this.sendToMeta(url, token, body),
    );

    // Log internally as interaction
    try {
      const contact = await this.contactsService.findOneByPhone(phone);
      if (contact) {
        const conversation = await this.conversationsService.findOrCreate(
          contact,
          phone,
        );
        await this.conversationsService.recordMessage(
          conversation,
          {
            externalMessageId: providerId,
            direction: ConversationMessageDirection.OUTBOUND,
            actor,
            body: `[Plantilla WhatsApp: ${templateName}]`,
            messageType: 'template',
            metadata: trace?.configVersion
              ? {
                  configurationVersion: trace.configVersion,
                  sources: trace.sources ?? [],
                }
              : undefined,
          },
          manager,
        );
        await this.interactionsService.createSystemInteraction({
          contactId: contact.id,
          type: InteractionType.WHATSAPP,
          direction: InteractionDirection.OUTBOUND,
          notes: `WhatsApp enviado (plantilla: ${templateName})`,
          createdById,
          externalMessageId: providerId,
        });
      }
      if (!manager) await this.dispatches.recorded(dispatchKey);
    } catch {
      this.logger.error(
        'Meta aceptó el envío, pero falta completar su registro.',
      );
      throw new DeliveryHistoryError();
    }
  }

  async sendText(
    to: string,
    text: string,
    actor: ConversationMessageActor = ConversationMessageActor.SYSTEM,
    createdById?: string,
    automatic?: AutomaticDelivery,
  ): Promise<void> {
    if (automatic) {
      return this.configuration.withActiveGuard(
        automatic.configVersion,
        async () =>
          this.conversationsService.withConversationLock(
            automatic.conversationId,
            async () => {
              await this.assertAutomaticDelivery(automatic);
              return this.sendTextRecorded(
                to,
                text,
                actor,
                createdById,
                automatic.key,
                automatic,
              );
            },
          ),
      );
    }
    if (actor === ConversationMessageActor.AGENT) {
      const key = randomUUID();
      return this.withManualDelivery(to, true, key, (manager) =>
        this.sendTextRecorded(
          to,
          text,
          actor,
          createdById,
          key,
          undefined,
          manager,
        ),
      );
    }
    return this.sendTextRecorded(to, text, actor, createdById, randomUUID());
  }

  private async sendTextRecorded(
    to: string,
    text: string,
    actor: ConversationMessageActor,
    createdById: string | undefined,
    dispatchKey: string,
    trace?: AutomaticDelivery,
    manager?: EntityManager,
  ): Promise<void> {
    const apiUrl =
      process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v25.0';
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

    if (!token || !phoneNumberId) {
      throw new DeliveryRejectedError(0);
    }

    const phone = to.replace(/[\s()-]/g, '');

    const body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text },
    };

    const url = `${apiUrl}/${phoneNumberId}/messages`;
    const providerId = await this.dispatches.deliver(dispatchKey, body, () =>
      this.sendToMeta(url, token, body),
    );

    try {
      const contact = await this.contactsService.findOneByPhone(phone);
      if (contact) {
        const conversation = await this.conversationsService.findOrCreate(
          contact,
          phone,
        );
        await this.conversationsService.recordMessage(
          conversation,
          {
            externalMessageId: providerId,
            direction: ConversationMessageDirection.OUTBOUND,
            actor,
            body: text,
            messageType: 'text',
            metadata: trace?.configVersion
              ? {
                  configurationVersion: trace.configVersion,
                  sources: trace.sources ?? [],
                }
              : undefined,
          },
          manager,
        );
        const interaction =
          await this.interactionsService.createSystemInteraction({
            contactId: contact.id,
            type: InteractionType.WHATSAPP,
            direction: InteractionDirection.OUTBOUND,
            notes: text,
            createdById,
            externalMessageId: providerId,
          });
        if (actor === ConversationMessageActor.AGENT) {
          await this.guidanceService.captureManualResponse(interaction.id);
        }
      }
      if (!manager) await this.dispatches.recorded(dispatchKey);
    } catch {
      this.logger.error(
        'Meta aceptó el envío, pero falta completar su registro.',
      );
      throw new DeliveryHistoryError();
    }
  }

  private async withManualDelivery(
    to: string,
    requireWindow: boolean,
    dispatchKey: string,
    send: (manager: EntityManager) => Promise<void>,
  ): Promise<void> {
    const phone = to.replace(/[\s()-]/g, '');
    const contact = await this.contactsService.findOneByPhone(phone);
    if (!contact)
      throw new ConflictException(
        'El contacto no tiene una conversación abierta.',
      );
    const conversation = await this.conversationsService.findOrCreate(
      contact,
      phone,
    );
    // La toma humana queda confirmada incluso si Meta rechaza después el envío.
    await this.conversationsService.setMode(
      conversation.id,
      ConversationAiMode.HUMAN,
      'Respuesta manual del equipo',
    );
    await this.conversationsService.withConversationLock(
      conversation.id,
      async (manager) => {
        const current = await manager.findOneOrFail(Conversation, {
          where: { id: conversation.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (current.status !== ConversationStatus.OPEN)
          throw new ConflictException(
            'Reabre la conversación antes de responder.',
          );
        if (current.optOutAt)
          throw new ConflictException('El contacto ha solicitado la baja.');
        if (
          requireWindow &&
          (!current.lastInboundAt ||
            Date.now() - current.lastInboundAt.getTime() > 24 * 60 * 60 * 1000)
        )
          throw new ConflictException(
            'La ventana de 24 horas ha caducado. Espera un mensaje nuevo o utiliza una plantilla aprobada.',
          );
        current.aiMode = ConversationAiMode.HUMAN;
        current.nextFollowUpAt = null;
        current.handoffReason = 'Respuesta manual del equipo';
        current.lifecycleVersion++;
        await manager.save(current);
        await send(manager);
      },
    );
    // Sólo confirmar el historial después del COMMIT del mensaje manual.
    await this.dispatches.recorded(dispatchKey);
  }

  private async assertAutomaticDelivery(
    delivery: AutomaticDelivery,
  ): Promise<void> {
    if (
      process.env.AI_RELIABLE_DELIVERY_ENABLED !== 'true' ||
      process.env.AI_WHATSAPP_ENABLED !== 'true' ||
      (await this.guidanceService.isPaused())
    )
      throw new DeliveryBlockedError();
    const conversation = await this.conversationsService.findOne(
      delivery.conversationId,
    );
    if (
      conversation.status !== ConversationStatus.OPEN ||
      conversation.optOutAt
    )
      throw new DeliveryBlockedError();
    if (delivery.policy === 'reply') {
      if (
        !delivery.inboundMessageId ||
        !(await this.conversationsService.canAiReply(
          delivery.conversationId,
          delivery.inboundMessageId,
        ))
      )
        throw new DeliveryBlockedError();
    } else if (delivery.policy === 'handoff') {
      if (
        conversation.aiMode !== ConversationAiMode.HUMAN ||
        conversation.handoffReason !== delivery.handoffReason?.slice(0, 255) ||
        conversation.messages?.at(-1)?.id !== delivery.inboundMessageId ||
        !conversation.lastInboundAt ||
        Date.now() - conversation.lastInboundAt.getTime() > 24 * 60 * 60 * 1000
      )
        throw new DeliveryBlockedError();
    } else if (
      conversation.aiMode !== ConversationAiMode.AUTO ||
      !conversation.optInAt ||
      !conversation.nextFollowUpAt ||
      conversation.nextFollowUpAt.getTime() > Date.now() ||
      conversation.followUpStep !== delivery.followUpStep ||
      conversation.nextFollowUpAt.toISOString() !== delivery.dueAt
    )
      throw new DeliveryBlockedError();
  }

  private async sendToMeta(
    url: string,
    token: string,
    body: unknown,
  ): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      if (response.status >= 500 || response.status === 408)
        throw new DeliveryUncertainError();
      throw new DeliveryRejectedError(response.status);
    }
    const payload = (await response.json()) as {
      messages?: Array<{ id?: string }>;
    };
    return payload.messages?.[0]?.id ?? '';
  }

  async getTemplates(): Promise<
    { name: string; status: string; language: string }[]
  > {
    const apiUrl =
      process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v25.0';
    const token = process.env.WHATSAPP_API_TOKEN ?? '';
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';

    if (!token || !businessAccountId) {
      this.logger.warn('WhatsApp no configurado');
      return [];
    }

    const url = `${apiUrl}/${businessAccountId}/message_templates?limit=100&fields=name,status,language`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`WhatsApp templates API error ${res.status}`);
    }

    const json = (await res.json()) as {
      data: { name: string; status: string; language: string }[];
    };
    return json.data ?? [];
  }

  verifyWebhook(mode: string, token: string, challenge: string): string {
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

  async handleWebhook(input: unknown): Promise<void> {
    const body = parseMetaWebhook(input);
    this.logger.log('Webhook de WhatsApp recibido');
    let processingFailed = false;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        const messages = value.messages || [];
        const metadata = value.metadata;

        if (value.statuses?.length) {
          try {
            await this.statuses.record(value.statuses);
          } catch {
            processingFailed = true;
            this.logger.error(
              'No se pudieron guardar confirmaciones de WhatsApp; se requiere reintento.',
            );
          }
        }

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
            const targetPhone = isOutbound ? msg.to : from;
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
              `Procesando mensaje WA ${direction} con id ${msg.id ?? 'sin-id'}`,
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
              contact =
                await this.contactsService.findOrCreateWhatsApp(targetPhone);
            }

            if (contact) {
              const conversation = await this.conversationsService.findOrCreate(
                contact,
                targetPhone,
              );
              const queueAi =
                !isOutbound &&
                this.aiQueueService.acceptsPhone(targetPhone) &&
                !(await this.guidanceService.isPaused());
              await this.configuration.withActiveGuard(
                undefined,
                async (manager) => {
                  const botRules = (await this.configuration.active(manager))
                    .configuration.rules;
                  await this.conversationsService.recordMessage(
                    conversation,
                    {
                      followUpDays: botRules.followUpsEnabled
                        ? botRules.followUpDays[0]
                        : null,
                      externalMessageId: msg.id ?? null,
                      direction,
                      actor: isOutbound
                        ? ConversationMessageActor.SYSTEM
                        : ConversationMessageActor.LEAD,
                      body: text,
                      messageType: msg.type ?? 'text',
                      metadata: {
                        provider: 'meta',
                        messageType: msg.type ?? 'text',
                      },
                      queueAi,
                      providerTimestamp: msg.timestamp
                        ? new Date(Number(msg.timestamp) * 1000)
                        : null,
                    },
                    manager,
                  );
                },
              );
              this.logger.log(`Guardando interacción WA ${msg.id ?? 'sin-id'}`);
              await this.interactionsService.createSystemInteraction({
                contactId: contact.id,
                type: InteractionType.WHATSAPP,
                direction: interactionDirection,
                notes: text,
                externalMessageId: msg.id ?? undefined,
                source: 'meta',
                messageTimestamp: msg.timestamp
                  ? new Date(Number(msg.timestamp) * 1000)
                  : undefined,
              });
              this.logger.log('Interacción WA guardada correctamente');
            } else {
              this.logger.warn(
                `Mensaje WA para …${targetPhone.slice(-4)} ignorado (sin contacto y no es entrante)`,
              );
            }
          } catch {
            processingFailed = true;
            this.logger.error(
              'No se pudo guardar por completo un mensaje de WhatsApp; se requiere reintento.',
            );
          }
        }
      }
    }
    if (processingFailed) {
      throw new Error(
        'No se pudo persistir por completo el webhook de WhatsApp',
      );
    }
  }

  async sendConfiguredFollowUp(
    conversation: Conversation,
    captured?: BotSnapshot,
  ): Promise<boolean> {
    const snapshot = captured ?? (await this.configuration.active());
    if (!snapshot.configuration.rules.followUpsEnabled)
      throw new DeliveryBlockedError();
    const step = conversation.followUpStep + 1;
    const templateName =
      process.env[
        `WHATSAPP_FOLLOWUP_TEMPLATE_D${snapshot.configuration.rules.followUpDays[step - 1]}`
      ];
    if (!templateName || !conversation.externalContactKey) return false;
    const approved = (await this.getTemplates()).filter(
      (template) =>
        template.name === templateName && template.status === 'APPROVED',
    );
    const selected =
      approved.find(
        (template) => template.language === (conversation.language || 'es'),
      ) ?? (approved.length === 1 ? approved[0] : undefined);
    if (!selected) throw new DeliveryRejectedError(0);
    await this.sendTemplate(
      {
        to: conversation.externalContactKey,
        templateName,
        languageCode: selected.language,
        params: [conversation.contact.name],
      },
      ConversationMessageActor.SYSTEM,
      undefined,
      {
        key: `followup:${conversation.id}:${conversation.followUpStep}:${conversation.nextFollowUpAt?.toISOString()}`,
        conversationId: conversation.id,
        policy: 'followup',
        configVersion: snapshot.version,
        followUpStep: conversation.followUpStep,
        dueAt: conversation.nextFollowUpAt?.toISOString(),
      },
    );
    return true;
  }
}
