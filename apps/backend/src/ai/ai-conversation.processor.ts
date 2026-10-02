import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConversationsService } from '../conversations/conversations.service';
import { ConversationAiMode } from '../conversations/entities/conversation.entity';
import { ConversationMessageActor, ConversationMessageDirection } from '../conversations/entities/conversation-message.entity';
import { PipelineEventActor } from '../conversations/entities/pipeline-event.entity';
import { PipelineStage } from '../pipeline/pipeline-stage.enum';
import { OpenAiService } from './openai.service';
import { WebKnowledgeService } from './web-knowledge.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

const AI_STAGES = new Set<string>([
  PipelineStage.NEW, PipelineStage.CONTACTED, PipelineStage.QUALIFIED,
  PipelineStage.CALL_SCHEDULED, PipelineStage.OFFER_SENT,
  PipelineStage.DEPOSIT_REQUESTED, PipelineStage.NURTURE, PipelineStage.LOST,
]);

@Injectable()
export class AiConversationProcessor {
  private readonly logger = new Logger(AiConversationProcessor.name);

  constructor(
    @Inject(forwardRef(() => ConversationsService)) private readonly conversationsService: ConversationsService,
    private readonly openAiService: OpenAiService,
    private readonly webKnowledgeService: WebKnowledgeService,
    @Inject(forwardRef(() => WhatsAppService)) private readonly whatsAppService: WhatsAppService,
  ) {}

  async process(conversationId: string): Promise<void> {
    const conversation = await this.conversationsService.findOne(conversationId);
    if (conversation.aiMode !== ConversationAiMode.AUTO || conversation.status !== 'open' || conversation.optOutAt) return;
    const messages = await this.conversationsService.getRecentMessages(conversationId, 20);
    const lastInbound = [...messages].reverse().find((message) => message.direction === ConversationMessageDirection.INBOUND);
    if (!lastInbound) return;

    if (/\b(baja|cancelar|no\s+(?:me\s+)?escribas|no quiero recibir)\b/i.test(lastInbound.body)) {
      await this.conversationsService.updateLead(conversationId, { optOut: true });
      return;
    }

    const webContext = await this.webKnowledgeService.getContext(lastInbound.body);
    const decision = await this.openAiService.decide({
      currentStage: conversation.pipelineStage,
      webContext,
      messages: messages.map((message) => ({ direction: message.direction, body: message.body })),
    });

    await this.conversationsService.updateLead(conversationId, {
      courseInterest: decision.courseInterest ?? undefined,
      language: decision.language ?? undefined,
      optIn: decision.optIn,
      summary: decision.summary ?? undefined,
    });

    if (decision.stage && AI_STAGES.has(decision.stage)) {
      await this.conversationsService.moveStage(conversationId, decision.stage as PipelineStage, PipelineEventActor.AI, decision.summary ?? 'Clasificación automática por IA');
    } else if (conversation.pipelineStage === PipelineStage.NEW && decision.reply) {
      await this.conversationsService.moveStage(conversationId, PipelineStage.CONTACTED, PipelineEventActor.AI, 'Primera respuesta automática');
    }

    // Una derivación cierra el turno de la IA. No enviamos el texto del modelo
    // porque puede terminar con una pregunta y dejar al lead esperando una
    // respuesta automática cuando la conversación ya está en manos humanas.
    const reply = decision.handoff
      ? 'Te paso con alguien del equipo para que te ayude lo antes posible.'
      : decision.reply?.trim() || '';
    if (reply && conversation.aiMode === ConversationAiMode.AUTO) {
      await this.whatsAppService.sendText(conversation.externalContactKey, reply, ConversationMessageActor.AI);
    }
    if (decision.handoff) {
      await this.conversationsService.setMode(conversationId, ConversationAiMode.HUMAN, decision.handoffReason ?? 'Derivación solicitada por IA');
    }
    if (decision.followUpDays && decision.optIn) {
      await this.conversationsService.scheduleFollowUp(conversationId, decision.followUpDays);
    }
  }
}
