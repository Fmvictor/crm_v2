import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Contact, ContactStatus } from '../contacts/entities/contact.entity';
import {
  Conversation,
  ConversationAiMode,
  ConversationChannel,
  ConversationStatus,
} from './entities/conversation.entity';
import {
  ConversationMessage,
  ConversationMessageActor,
  ConversationMessageDirection,
} from './entities/conversation-message.entity';
import {
  PipelineEvent,
  PipelineEventActor,
} from './entities/pipeline-event.entity';
import {
  KnowledgeDocument,
  KnowledgeDocumentStatus,
} from '../knowledge/entities/knowledge-document.entity';
import {
  mapLegacyStatus,
  PipelineStage,
} from '../pipeline/pipeline-stage.enum';

export interface ConversationMessageInput {
  externalMessageId?: string | null;
  direction: ConversationMessageDirection;
  actor: ConversationMessageActor;
  body: string;
  messageType?: string;
  metadata?: Record<string, unknown> | null;
  providerTimestamp?: Date | null;
}

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationsRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly messagesRepo: Repository<ConversationMessage>,
    @InjectRepository(PipelineEvent)
    private readonly eventsRepo: Repository<PipelineEvent>,
    @InjectRepository(KnowledgeDocument)
    private readonly knowledgeRepo: Repository<KnowledgeDocument>,
  ) {}

  async findOrCreate(
    contact: Contact,
    externalContactKey: string,
  ): Promise<Conversation> {
    let conversation = await this.conversationsRepo.findOne({
      where: { channel: ConversationChannel.WHATSAPP, externalContactKey },
    });
    if (conversation) return conversation;

    const stage = contact.pipelineStage ?? mapLegacyStatus(contact.status);
    conversation = this.conversationsRepo.create({
      channel: ConversationChannel.WHATSAPP,
      externalContactKey,
      contactId: contact.id,
      pipelineStage: stage,
      aiMode: ConversationAiMode.PAUSED,
      status: ConversationStatus.OPEN,
      language: null,
      optInAt: null,
      optOutAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      nextFollowUpAt: null,
      followUpStep: 0,
      handoffReason: null,
      aiSummary: null,
    });
    conversation = await this.conversationsRepo.save(conversation);
    await this.eventsRepo.save(
      this.eventsRepo.create({
        conversationId: conversation.id,
        fromStage: null,
        toStage: stage,
        actor: PipelineEventActor.SYSTEM,
        reason: 'Conversación creada desde CRM',
        metadata: null,
      }),
    );
    return conversation;
  }

  async recordMessage(
    conversation: Conversation,
    input: ConversationMessageInput,
  ): Promise<ConversationMessage> {
    if (input.externalMessageId) {
      const existing = await this.messagesRepo.findOne({
        where: { externalMessageId: input.externalMessageId },
      });
      if (existing) return existing;
    }

    const message = await this.messagesRepo.save(
      this.messagesRepo.create({
        conversationId: conversation.id,
        externalMessageId: input.externalMessageId ?? null,
        direction: input.direction,
        actor: input.actor,
        body: input.body,
        messageType: input.messageType ?? 'text',
        metadata: input.metadata ?? null,
        providerTimestamp: input.providerTimestamp ?? null,
      }),
    );

    const now = input.providerTimestamp ?? new Date();
    if (input.direction === ConversationMessageDirection.INBOUND) {
      conversation.lastInboundAt = now;
      conversation.followUpStep = 0;
      conversation.nextFollowUpAt = new Date(
        now.getTime() + 24 * 60 * 60 * 1000,
      );
    } else {
      conversation.lastOutboundAt = now;
    }
    await this.conversationsRepo.save(conversation);
    return message;
  }

  async findAll(options: {
    stage?: PipelineStage;
    aiMode?: ConversationAiMode;
    course?: string;
    language?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const qb = this.conversationsRepo
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.contact', 'contact')
      .where('conversation.status = :status', {
        status: ConversationStatus.OPEN,
      });
    if (options.stage)
      qb.andWhere('conversation.pipelineStage = :stage', {
        stage: options.stage,
      });
    if (options.aiMode)
      qb.andWhere('conversation.aiMode = :aiMode', { aiMode: options.aiMode });
    if (options.course)
      qb.andWhere('contact.courseInterest ILIKE :course', {
        course: `%${options.course}%`,
      });
    if (options.language)
      qb.andWhere('conversation.language = :language', {
        language: options.language,
      });
    if (options.search) {
      qb.andWhere(
        '(contact.name ILIKE :search OR contact.phone ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }
    qb.orderBy('conversation.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      lastPage: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string): Promise<Conversation> {
    const conversation = await this.conversationsRepo.findOne({
      where: { id },
      relations: ['contact', 'messages', 'pipelineEvents'],
    });
    if (!conversation)
      throw new NotFoundException(`Conversación ${id} no encontrada`);
    conversation.messages = [...(conversation.messages ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    conversation.pipelineEvents = [...(conversation.pipelineEvents ?? [])].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return conversation;
  }

  async getRecentMessages(
    id: string,
    limit = 20,
  ): Promise<ConversationMessage[]> {
    return this.messagesRepo
      .find({
        where: { conversationId: id },
        order: { createdAt: 'DESC' },
        take: limit,
      })
      .then((messages) => messages.reverse());
  }

  async moveStage(
    id: string,
    toStage: PipelineStage,
    actor: PipelineEventActor,
    reason: string,
    metadata?: Record<string, unknown>,
  ) {
    const conversation = await this.findOne(id);
    if (conversation.pipelineStage === toStage) return conversation;
    if (
      actor === PipelineEventActor.AI &&
      [
        PipelineStage.CALL_DONE,
        PipelineStage.DEPOSIT_PAID,
        PipelineStage.ENROLLED,
      ].includes(toStage)
    ) {
      throw new Error(`La IA no puede mover una conversación a ${toStage}`);
    }
    const fromStage = conversation.pipelineStage;
    conversation.pipelineStage = toStage;
    conversation.contact.pipelineStage = toStage;
    if (toStage === PipelineStage.ENROLLED)
      conversation.contact.status = ContactStatus.ENROLLED;
    else if (toStage === PipelineStage.LOST)
      conversation.contact.status = ContactStatus.LOST;
    else if (toStage === PipelineStage.QUALIFIED)
      conversation.contact.status = ContactStatus.QUALIFIED;
    else if (toStage !== PipelineStage.NEW)
      conversation.contact.status = ContactStatus.CONTACTED;
    await this.conversationsRepo.manager.save(conversation.contact);
    await this.conversationsRepo.save(conversation);
    await this.eventsRepo.save(
      this.eventsRepo.create({
        conversationId: id,
        fromStage,
        toStage,
        actor,
        reason,
        metadata: metadata ?? null,
      }),
    );
    return conversation;
  }

  async setMode(id: string, aiMode: ConversationAiMode, reason?: string) {
    const conversation = await this.findOne(id);
    conversation.aiMode = aiMode;
    conversation.handoffReason = reason ?? null;
    if (
      aiMode === ConversationAiMode.PAUSED ||
      aiMode === ConversationAiMode.HUMAN
    )
      conversation.nextFollowUpAt = null;
    return this.conversationsRepo.save(conversation);
  }

  async updateLead(
    id: string,
    fields: {
      courseInterest?: string;
      language?: string;
      optIn?: boolean;
      optOut?: boolean;
      summary?: string;
    },
  ) {
    const conversation = await this.findOne(id);
    if (fields.courseInterest)
      conversation.contact.courseInterest = fields.courseInterest.slice(0, 200);
    if (fields.language) conversation.language = fields.language.slice(0, 10);
    if (fields.optIn) conversation.optInAt = new Date();
    if (fields.optOut) {
      conversation.optOutAt = new Date();
      conversation.aiMode = ConversationAiMode.PAUSED;
      conversation.nextFollowUpAt = null;
    }
    if (fields.summary) conversation.aiSummary = fields.summary.slice(0, 5000);
    await this.conversationsRepo.manager.save(conversation.contact);
    return this.conversationsRepo.save(conversation);
  }

  async scheduleFollowUp(id: string, days: number) {
    const conversation = await this.findOne(id);
    if (!conversation.optInAt || conversation.optOutAt) return conversation;
    conversation.nextFollowUpAt = new Date(
      Date.now() + days * 24 * 60 * 60 * 1000,
    );
    return this.conversationsRepo.save(conversation);
  }

  async findDueFollowUps(): Promise<Conversation[]> {
    return this.conversationsRepo.find({
      where: {
        status: ConversationStatus.OPEN,
        aiMode: ConversationAiMode.AUTO,
        optInAt: LessThanOrEqual(new Date()),
        nextFollowUpAt: LessThanOrEqual(new Date()),
      },
      relations: ['contact'],
      take: 50,
      order: { nextFollowUpAt: 'ASC' },
    });
  }

  async markFollowUpSent(id: string) {
    const conversation = await this.findOne(id);
    const nextDays = [1, 3, 7, 14];
    const nextStep = conversation.followUpStep + 1;
    conversation.followUpStep = nextStep;
    conversation.nextFollowUpAt = nextDays[nextStep]
      ? new Date(
          Date.now() +
            (nextDays[nextStep] - (nextDays[nextStep - 1] ?? 0)) *
              24 *
              60 *
              60 *
              1000,
        )
      : null;
    return this.conversationsRepo.save(conversation);
  }

  async listKnowledge(): Promise<KnowledgeDocument[]> {
    return this.knowledgeRepo.find({ order: { slug: 'ASC', version: 'DESC' } });
  }

  async approveKnowledge(id: string): Promise<KnowledgeDocument> {
    const document = await this.knowledgeRepo.findOne({ where: { id } });
    if (!document) throw new NotFoundException(`Documento ${id} no encontrado`);
    document.status = KnowledgeDocumentStatus.APPROVED;
    document.approvedAt = new Date();
    return this.knowledgeRepo.save(document);
  }
}
