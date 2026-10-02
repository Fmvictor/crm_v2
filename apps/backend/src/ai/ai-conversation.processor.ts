import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConversationsService } from '../conversations/conversations.service';
import { ConversationAiMode } from '../conversations/entities/conversation.entity';
import {
  ConversationMessageActor,
  ConversationMessageDirection,
} from '../conversations/entities/conversation-message.entity';
import { PipelineEventActor } from '../conversations/entities/pipeline-event.entity';
import { PipelineStage } from '../pipeline/pipeline-stage.enum';
import { OpenAiService } from './openai.service';
import { WebKnowledgeService } from './web-knowledge.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { AiGuidanceService } from './ai-guidance.service';

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

  async process(conversationId: string): Promise<void> {
    const conversation =
      await this.conversationsService.findOne(conversationId);
    if (
      conversation.aiMode !== ConversationAiMode.AUTO ||
      conversation.status !== 'open' ||
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
    if (!lastInbound) return;

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
    const [webContext, instructions, examples] = await Promise.all([
      this.webKnowledgeService.getContext(lastInbound.body),
      this.guidanceService.getLatestInstruction(),
      this.guidanceService.getApprovedExamples(),
    ]);
    const decision = await this.openAiService.decide({
      currentStage: conversation.pipelineStage,
      webContext,
      instructions,
      examples,
      messages: messages.map((message) => ({
        direction: message.direction,
        body: message.body,
      })),
    });
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

    // Una derivación cierra el turno de la IA. No enviamos el texto del modelo
    // porque puede terminar con una pregunta y dejar al lead esperando una
    // respuesta automática cuando la conversación ya está en manos humanas.
    const reply = decision.handoff
      ? 'Te paso con alguien del equipo para que te ayude lo antes posible.'
      : decision.reply?.trim() || '';
    if (reply && conversation.aiMode === ConversationAiMode.AUTO) {
      await this.whatsAppService.sendText(
        conversation.externalContactKey,
        reply,
        ConversationMessageActor.AI,
      );
    }
    if (decision.handoff) {
      const handoffReason =
        decision.handoffReason ?? 'Derivación solicitada por IA';
      await this.conversationsService.setMode(
        conversationId,
        ConversationAiMode.HUMAN,
        handoffReason,
      );
      await this.notifyHumanAttention(conversation, handoffReason);
    }
    if (decision.followUpDays && decision.optIn) {
      await this.conversationsService.scheduleFollowUp(
        conversationId,
        decision.followUpDays,
      );
    }
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

    try {
      await this.whatsAppService.sendText(
        phone.slice(1),
        `⚠️ Un lead requiere atención humana.\nLead: ${leadName} (…${lastFourDigits})\nMotivo: ${safeReason}\nAbre el Pipeline de WhatsApp en el CRM.`,
        ConversationMessageActor.SYSTEM,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudo avisar al equipo: ${detail}`);
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
