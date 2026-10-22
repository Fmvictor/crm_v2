import { BotConfigService } from '../bot-config/bot-config.service';
import { topicHandoff, BotSnapshot } from '../bot-config/config-schema';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConversationsService } from '../conversations/conversations.service';
import {
  ConversationAiMode,
  ConversationStatus,
} from '../conversations/entities/conversation.entity';
import {
  ConversationMessageActor,
  ConversationMessageDirection,
} from '../conversations/entities/conversation-message.entity';
import { PipelineEventActor } from '../conversations/entities/pipeline-event.entity';
import { PipelineStage } from '../pipeline/pipeline-stage.enum';
import { AiBudgetBlockedError } from './ai-usage.service';
import { OpenAiService } from './openai.service';
import { WebKnowledgeService } from './web-knowledge.service';
import { DeliveryRejectedError } from '../whatsapp/whatsapp-dispatch.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { AiGuidanceService } from './ai-guidance.service';
import {
  conversationLanguage,
  handoffNotice,
  humanRequest,
  HandoffLanguage,
} from './conversation-language';

const AI_STAGES = new Set<string>([
  PipelineStage.NEW,
  PipelineStage.CONTACTED,
  PipelineStage.QUALIFIED,
  PipelineStage.CALL_SCHEDULED,
  PipelineStage.OFFER_SENT,
  PipelineStage.DEPOSIT_REQUESTED,
  PipelineStage.NURTURE,
  PipelineStage.LOST,
]);

@Injectable()
export class AiConversationProcessor {
  private readonly logger = new Logger(AiConversationProcessor.name);

  constructor(
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    private readonly openAiService: OpenAiService,
    private readonly webKnowledgeService: WebKnowledgeService,
    private readonly guidanceService: AiGuidanceService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsAppService: WhatsAppService,
    private readonly configuration: BotConfigService,
  ) {}

  async process(
    conversationId: string,
    expectedInboundId?: string,
  ): Promise<void> {
    const conversation =
      await this.conversationsService.findOne(conversationId);
    if (
      conversation.aiMode !== ConversationAiMode.AUTO ||
      conversation.status !== ConversationStatus.OPEN ||
      conversation.optOutAt
    )
      return;
    const recentMessages = await this.conversationsService.getRecentMessages(
      conversationId,
      20,
    );
    // Una activación expresa inicia otra etapa de IA. Los avisos y respuestas
    // humanos anteriores se conservan en CRM, pero no describen el control actual.
    const activatedAt = conversation.aiActivatedAt;
    const messages = activatedAt
      ? recentMessages.filter((message) => message.createdAt > activatedAt)
      : recentMessages;
    const lastInbound = [...messages]
      .reverse()
      .find(
        (message) => message.direction === ConversationMessageDirection.INBOUND,
      );
    if (
      !lastInbound ||
      (expectedInboundId && lastInbound.id !== expectedInboundId)
    )
      return;
    if (
      !(await this.conversationsService.canAiReply(
        conversationId,
        lastInbound.id,
      ))
    )
      return;

    if (
      /\b(baja|cancelar|no\s+(?:me\s+)?escribas|no quiero recibir)\b/i.test(
        lastInbound.body,
      )
    ) {
      await this.conversationsService.updateLead(conversationId, {
        optOut: true,
      });
      await this.notifyHumanAttention(
        conversation,
        'El lead ha pedido que se detengan los mensajes.',
      );
      return;
    }

    if (await this.guidanceService.isPaused()) return;
    const snapshot = await this.configuration.active();
    const rules = snapshot.configuration.rules;
    if (
      humanRequest(lastInbound.body) ||
      topicHandoff(lastInbound.body, rules)
    ) {
      await this.handoff(
        conversationId,
        conversation,
        lastInbound.id,
        humanRequest(lastInbound.body)
          ? 'Solicita una persona'
          : 'Requiere atención según las reglas publicadas',
        conversationLanguage(lastInbound.body, conversation.language),
        snapshot,
      );
      return;
    }
    const knowledge = await this.configuration.documentContext(
      snapshot,
      lastInbound.body,
      () =>
        this.webKnowledgeService.getContext(lastInbound.body, {
          previousMessages: messages
            .slice(0, messages.indexOf(lastInbound))
            .map((message) => ({
              direction: message.direction,
              body: message.body,
            })),
          courseInterest: conversation.contact?.courseInterest,
        }),
    );
    let decision: Awaited<ReturnType<OpenAiService['decide']>>;
    try {
      decision = await this.openAiService.decide({
        conversationId,
        currentStage: conversation.pipelineStage,
        webContext: knowledge.context,
        configuration: snapshot,
        sources: knowledge.sources,
        messages: messages.map((message) => ({
          direction: message.direction,
          body: message.body,
        })),
      });
    } catch (error) {
      if (!(error instanceof AiBudgetBlockedError)) throw error;
      await this.conversationsService.setMode(
        conversationId,
        ConversationAiMode.HUMAN,
        error.reason,
        `budget:${lastInbound.id}`,
      );
      return;
    }
    if (!(await this.configuration.isCurrent(snapshot.version))) {
      await this.conversationsService.setMode(
        conversationId,
        ConversationAiMode.HUMAN,
        'La configuración cambió durante la respuesta; revisar sin reenviar.',
        `configuration:${lastInbound.id}`,
      );
      return;
    }
    if (
      (await this.guidanceService.isPaused()) ||
      !(await this.conversationsService.canAiReply(
        conversationId,
        lastInbound.id,
      ))
    )
      return;

    await this.conversationsService.updateLead(conversationId, {
      courseInterest: decision.courseInterest ?? undefined,
      language: decision.language ?? undefined,
      optIn: decision.optIn,
      optOut: decision.optOut,
      summary: decision.summary ?? undefined,
    });

    if (decision.stage && AI_STAGES.has(decision.stage)) {
      await this.conversationsService.moveStage(
        conversationId,
        decision.stage as PipelineStage,
        PipelineEventActor.AI,
        decision.summary ?? 'Clasificación automática por IA',
      );
    } else if (
      conversation.pipelineStage === PipelineStage.NEW &&
      decision.reply
    ) {
      await this.conversationsService.moveStage(
        conversationId,
        PipelineStage.CONTACTED,
        PipelineEventActor.AI,
        'Primera respuesta automática',
      );
    }

    if (decision.optOut) {
      await this.notifyHumanAttention(
        conversation,
        'El lead ha solicitado la baja.',
      );
      return;
    }
    if (decision.handoff) {
      await this.handoff(
        conversationId,
        conversation,
        lastInbound.id,
        decision.handoffReason ?? 'Derivación solicitada por IA',
        conversationLanguage(
          lastInbound.body,
          decision.language ?? conversation.language,
        ),
        snapshot,
      );
      return;
    }
    const reply = decision.reply?.trim();
    if (!reply) {
      await this.handoff(
        conversationId,
        conversation,
        lastInbound.id,
        'La IA no devolvió una respuesta útil.',
        conversationLanguage(
          lastInbound.body,
          decision.language ?? conversation.language,
        ),
        snapshot,
      );
      return;
    }
    if (reply)
      await this.whatsAppService.sendText(
        conversation.externalContactKey,
        reply,
        ConversationMessageActor.AI,
        undefined,
        {
          key: `reply:${lastInbound.id}`,
          conversationId,
          inboundMessageId: lastInbound.id,
          policy: 'reply',
          configVersion: snapshot.version,
          sources: knowledge.sources,
        },
      );
    if (decision.followUpDays && decision.optIn && rules.followUpsEnabled) {
      await this.conversationsService.scheduleFollowUp(
        conversationId,
        rules.followUpDays[0],
      );
    }
  }

  private async handoff(
    conversationId: string,
    conversation: {
      externalContactKey: string;
      contact?: { name?: string | null };
    },
    inboundMessageId: string,
    reason: string,
    language: HandoffLanguage,
    snapshot: BotSnapshot,
  ): Promise<void> {
    await this.conversationsService.setMode(
      conversationId,
      ConversationAiMode.HUMAN,
      reason,
      `handoff:${inboundMessageId}`,
    );
    try {
      await this.whatsAppService.sendText(
        conversation.externalContactKey,
        handoffNotice(language, snapshot.configuration.rules),
        ConversationMessageActor.AI,
        undefined,
        {
          key: `handoff:${inboundMessageId}`,
          conversationId,
          inboundMessageId,
          policy: 'handoff',
          configVersion: snapshot.version,
          handoffReason: reason,
        },
      );
    } catch {
      this.logger.error(
        'Aviso al lead fallido; se conserva la derivación humana.',
      );
    }
    await this.notifyHumanAttention(conversation, reason);
  }

  private async notifyHumanAttention(
    conversation: {
      contact?: { name?: string | null };
      externalContactKey: string;
    },
    reason: string,
  ): Promise<void> {
    const phone = this.getHumanAttentionPhone();
    if (!phone) return;
    const leadName =
      conversation.contact?.name
        ?.replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, 100) || 'Lead sin nombre';
    const lastFourDigits =
      conversation.externalContactKey.replace(/\D/g, '').slice(-4) || '----';
    const safeReason = reason
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 160);
    const alertTemplate = process.env.HUMAN_ATTENTION_WHATSAPP_TEMPLATE?.trim();

    try {
      if (alertTemplate) {
        try {
          await this.whatsAppService.sendTemplate(
            {
              to: phone.slice(1),
              templateName: alertTemplate,
              params: [leadName, lastFourDigits, safeReason],
            },
            ConversationMessageActor.SYSTEM,
          );
          return;
        } catch (error) {
          if (!(error instanceof DeliveryRejectedError)) throw error;
          this.logger.warn('Plantilla de aviso rechazada; se intenta texto.');
        }
      }
      await this.whatsAppService.sendText(
        phone.slice(1),
        `⚠️ Un lead requiere atención humana.\nLead: ${leadName} (…${lastFourDigits})\nMotivo: ${safeReason}\nAbre el Pipeline de WhatsApp en el CRM.`,
        ConversationMessageActor.SYSTEM,
      );
    } catch {
      this.logger.error(
        'No se pudo confirmar el aviso al equipo; revisar la derivación en el CRM.',
      );
    }
  }

  private getHumanAttentionPhone(): string | null {
    const phone = process.env.HUMAN_ATTENTION_WHATSAPP_PHONE?.trim();
    if (!phone) {
      this.logger.warn(
        'Aviso humano omitido: HUMAN_ATTENTION_WHATSAPP_PHONE no está configurado.',
      );
      return null;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      this.logger.warn(
        'Aviso humano omitido: HUMAN_ATTENTION_WHATSAPP_PHONE no tiene formato E.164.',
      );
      return null;
    }
    return phone;
  }
}
