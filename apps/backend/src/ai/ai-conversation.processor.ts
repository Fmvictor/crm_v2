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
    const messages = await this.conversationsService.getRecentMessages(
      conversationId,
      20,
    );
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
    if (humanRequest(lastInbound.body)) {
      await this.handoff(
        conversationId,
        conversation,
        lastInbound.id,
        'Solicita una persona',
        conversationLanguage(lastInbound.body, conversation.language),
      );
      return;
    }
    const [webContext, instructions, examples] = await Promise.all([
      this.webKnowledgeService.getContext(lastInbound.body, {
        previousMessages: messages
          .slice(0, messages.indexOf(lastInbound))
          .map((message) => ({
            direction: message.direction,
            body: message.body,
          })),
        courseInterest: conversation.contact?.courseInterest,
      }),
      this.guidanceService.getLatestInstruction(),
      this.guidanceService.getApprovedExamples(),
    ]);
    let decision: Awaited<ReturnType<OpenAiService['decide']>>;
    try {
      decision = await this.openAiService.decide({
        conversationId,
        currentStage: conversation.pipelineStage,
        webContext,
        instructions,
        examples,
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
        },
      );
    if (decision.followUpDays && decision.optIn) {
      await this.conversationsService.scheduleFollowUp(
        conversationId,
        decision.followUpDays,
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
        handoffNotice(language),
        ConversationMessageActor.AI,
        undefined,
        {
          key: `handoff:${inboundMessageId}`,
          conversationId,
          inboundMessageId,
          policy: 'handoff',
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
