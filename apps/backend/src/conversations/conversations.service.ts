import { insertAiJob } from '../ai/ai-job.store';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { openAttention } from './attention-store';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm';
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
  queueAi?: boolean;
  followUpDays?: number | null;
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
      aiMode: ConversationAiMode.AUTO,
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
    try {
      conversation = await this.conversationsRepo.save(conversation);
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') throw error;
      const concurrentConversation = await this.conversationsRepo.findOne({
        where: { channel: ConversationChannel.WHATSAPP, externalContactKey },
      });
      if (!concurrentConversation) throw error;
      return concurrentConversation;
    }
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
    existingManager?: EntityManager,
  ): Promise<ConversationMessage> {
    const write = async (manager: EntityManager) => {
      const current = await manager.findOneOrFail(Conversation, {
        where: { id: conversation.id },
        lock: { mode: 'pessimistic_write' },
      });
      const wasClosed = current.status === ConversationStatus.CLOSED;
      const existing = input.externalMessageId
        ? await manager.findOne(ConversationMessage, {
            where: { externalMessageId: input.externalMessageId },
          })
        : null;
      const message =
        existing ??
        (await manager.save(
          ConversationMessage,
          manager.create(ConversationMessage, {
            conversationId: current.id,
            externalMessageId: input.externalMessageId ?? null,
            direction: input.direction,
            actor: input.actor,
            body: input.body,
            messageType: input.messageType ?? 'text',
            metadata: input.metadata ?? null,
            providerTimestamp: input.providerTimestamp ?? null,
          }),
        ));
      if (!existing) {
        const at = input.providerTimestamp ?? new Date();
        if (input.direction === ConversationMessageDirection.INBOUND) {
          if (!current.lastInboundAt || at > current.lastInboundAt)
            current.lastInboundAt = at;
          if (current.status === ConversationStatus.CLOSED) {
            current.status = ConversationStatus.OPEN;
            current.aiMode = ConversationAiMode.HUMAN;
            current.nextFollowUpAt = null;
            await manager.save(
              PipelineEvent,
              manager.create(PipelineEvent, {
                conversationId: current.id,
                fromStage: current.pipelineStage,
                toStage: current.pipelineStage,
                actor: PipelineEventActor.SYSTEM,
                reason:
                  'Conversación reabierta por un nuevo mensaje; requiere atención humana',
                metadata: {
                  action: 'conversation_reopened',
                  trigger: 'inbound',
                },
              }),
            );
          }
          current.followUpStep = 0;
          if (current.aiMode === ConversationAiMode.AUTO && !current.optOutAt)
            current.nextFollowUpAt =
              input.followUpDays === null
                ? null
                : new Date(
                    current.lastInboundAt.getTime() +
                      (input.followUpDays ?? 1) * 24 * 60 * 60 * 1000,
                  );
        } else if (!current.lastOutboundAt || at > current.lastOutboundAt)
          current.lastOutboundAt = at;
        current.lifecycleVersion = (current.lifecycleVersion ?? 0) + 1;
        await manager.save(current);
        if (
          input.direction === ConversationMessageDirection.INBOUND &&
          wasClosed
        ) {
          await openAttention(
            manager,
            current.id,
            `reopen:${message.id}`,
            'Nuevo mensaje en una conversación cerrada',
          );
        }
      }
      if (
        input.queueAi &&
        current.status === ConversationStatus.OPEN &&
        current.aiMode === ConversationAiMode.AUTO &&
        !current.optOutAt &&
        input.direction === ConversationMessageDirection.INBOUND
      )
        await insertAiJob(manager, current.id, message.id);
      return message;
    };
    return existingManager
      ? write(existingManager)
      : this.conversationsRepo.manager.transaction(write);
  }

  async canAiReply(
    conversationId: string,
    inboundMessageId: string,
  ): Promise<boolean> {
    const conversation = await this.conversationsRepo.findOne({
      where: { id: conversationId },
    });
    if (
      !conversation ||
      conversation.aiMode !== ConversationAiMode.AUTO ||
      conversation.status !== ConversationStatus.OPEN ||
      conversation.optOutAt ||
      !conversation.lastInboundAt ||
      Date.now() - conversation.lastInboundAt.getTime() > 24 * 60 * 60 * 1000
    )
      return false;
    const [latestMessage] = await this.messagesRepo.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return (
      latestMessage?.id === inboundMessageId &&
      (!conversation.aiActivatedAt ||
        latestMessage.createdAt > conversation.aiActivatedAt) &&
      latestMessage.direction === ConversationMessageDirection.INBOUND
    );
  }

  async findAll(options: {
    stage?: PipelineStage;
    aiMode?: ConversationAiMode;
    course?: string;
    language?: string;
    search?: string;
    page?: number;
    limit?: number;
    attention?: boolean;
    status?: ConversationStatus;
  }) {
    if (
      options.status &&
      !Object.values(ConversationStatus).includes(options.status)
    )
      throw new BadRequestException('Estado de conversación inválido.');
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const qb = this.conversationsRepo
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.contact', 'contact')
      .where(
        options.status === ConversationStatus.CLOSED
          ? 'conversation.status = :status'
          : '(conversation.status = :status OR conversation.attentionPending = true)',
        {
          status: options.status ?? ConversationStatus.OPEN,
        },
      );
    if (options.attention) qb.andWhere('conversation.attentionPending = true');
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
    qb.orderBy('conversation.attentionPending', 'DESC')
      .addOrderBy('conversation.updatedAt', 'DESC')
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
    return this.withConversationLock(id, async (manager) => {
      const conversation = await manager.findOneOrFail(Conversation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (conversation.pipelineStage === toStage) return conversation;
      if (actor === PipelineEventActor.AI) {
        if (
          conversation.aiMode !== ConversationAiMode.AUTO ||
          conversation.optOutAt
        )
          return conversation;
        if (
          [
            PipelineStage.CALL_DONE,
            PipelineStage.DEPOSIT_PAID,
            PipelineStage.ENROLLED,
          ].includes(toStage)
        )
          throw new Error(`La IA no puede mover una conversación a ${toStage}`);
      }
      const contact = await manager.findOneOrFail(Contact, {
        where: { id: conversation.contactId },
      });
      const fromStage = conversation.pipelineStage;
      conversation.pipelineStage = toStage;
      contact.pipelineStage = toStage;
      if (toStage === PipelineStage.ENROLLED)
        contact.status = ContactStatus.ENROLLED;
      else if (toStage === PipelineStage.LOST)
        contact.status = ContactStatus.LOST;
      else if (toStage === PipelineStage.QUALIFIED)
        contact.status = ContactStatus.QUALIFIED;
      else if (toStage !== PipelineStage.NEW)
        contact.status = ContactStatus.CONTACTED;
      await manager.save(contact);
      await manager.save(conversation);
      await manager.save(
        PipelineEvent,
        manager.create(PipelineEvent, {
          conversationId: id,
          fromStage,
          toStage,
          actor,
          reason: reason.slice(0, 500),
          metadata: metadata ?? null,
        }),
      );
      return conversation;
    });
  }

  async setMode(
    id: string,
    aiMode: ConversationAiMode,
    reason?: string,
    attentionKey?: string,
    actorUserId?: string,
  ) {
    if (!Object.values(ConversationAiMode).includes(aiMode))
      throw new BadRequestException('Modo de IA inválido.');
    return this.withConversationLock(id, async (manager) => {
      const conversation = await manager.findOneOrFail(Conversation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (conversation.status === ConversationStatus.CLOSED)
        throw new ConflictException(
          'Reabre la conversación antes de cambiar el modo de IA.',
        );
      if (aiMode === ConversationAiMode.AUTO && conversation.optOutAt)
        throw new ConflictException(
          'La baja del contacto impide reactivar la IA.',
        );
      if (aiMode === ConversationAiMode.AUTO && conversation.attentionPending)
        throw new ConflictException(
          'Marca la atención pendiente como atendida antes de reactivar la IA.',
        );
      if (aiMode === ConversationAiMode.HUMAN && attentionKey) {
        await openAttention(
          manager,
          id,
          attentionKey,
          reason ?? 'Requiere atención humana',
        );
        return manager.findOneOrFail(Conversation, { where: { id } });
      }
      const previousMode = conversation.aiMode;
      conversation.aiMode = aiMode;
      if (aiMode === ConversationAiMode.AUTO)
        conversation.aiActivatedAt = new Date();
      conversation.lifecycleVersion = (conversation.lifecycleVersion ?? 0) + 1;
      conversation.handoffReason = reason?.slice(0, 255) ?? null;
      if (aiMode !== ConversationAiMode.AUTO)
        conversation.nextFollowUpAt = null;
      await manager.save(conversation);
      if (actorUserId)
        await manager.save(
          PipelineEvent,
          manager.create(PipelineEvent, {
            conversationId: id,
            fromStage: conversation.pipelineStage,
            toStage: conversation.pipelineStage,
            actor: PipelineEventActor.AGENT,
            reason:
              aiMode === ConversationAiMode.AUTO
                ? 'IA activada expresamente desde el CRM'
                : 'Modo de atención cambiado desde el CRM',
            metadata: {
              action: 'ai_mode_changed',
              previousMode,
              aiMode,
              actorUserId,
            },
          }),
        );
      return conversation;
    });
  }

  async setStatus(
    id: string,
    status: ConversationStatus,
    version: unknown,
    userId: string,
  ) {
    if (
      !Object.values(ConversationStatus).includes(status) ||
      typeof version !== 'number' ||
      !Number.isSafeInteger(version) ||
      version < 0
    )
      throw new BadRequestException(
        'Estado o versión de conversación inválidos.',
      );
    return this.withConversationLock(id, async (manager) => {
      const conversation = await manager.findOneOrFail(Conversation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (conversation.lifecycleVersion !== version)
        throw new ConflictException(
          'La conversación ha cambiado. Actualízala antes de cerrar o reabrir.',
        );
      if (conversation.status === status) return conversation;
      if (status === ConversationStatus.CLOSED && conversation.attentionPending)
        throw new ConflictException(
          'Marca la atención pendiente como atendida antes de cerrar.',
        );
      conversation.status = status;
      conversation.aiMode = ConversationAiMode.HUMAN;
      conversation.nextFollowUpAt = null;
      conversation.lifecycleVersion++;
      await manager.save(conversation);
      await manager.save(
        PipelineEvent,
        manager.create(PipelineEvent, {
          conversationId: id,
          fromStage: conversation.pipelineStage,
          toStage: conversation.pipelineStage,
          actor: PipelineEventActor.AGENT,
          reason:
            status === ConversationStatus.CLOSED
              ? 'Conversación cerrada desde el CRM'
              : 'Conversación reabierta en atención humana desde el CRM',
          metadata: {
            action:
              status === ConversationStatus.CLOSED
                ? 'conversation_closed'
                : 'conversation_reopened',
            actorUserId: userId,
            lifecycleVersion: conversation.lifecycleVersion,
          },
        }),
      );
      return conversation;
    });
  }

  async acknowledgeAttention(id: string, version: unknown, userId: string) {
    if (
      typeof version !== 'number' ||
      !Number.isSafeInteger(version) ||
      version < 0
    )
      throw new BadRequestException('Versión de atención inválida.');
    return this.withConversationLock(id, async (manager) => {
      const conversation = await manager.findOneOrFail(Conversation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (conversation.attentionVersion !== version)
        throw new ConflictException(
          'Hay una atención más reciente. Actualiza la conversación antes de marcarla atendida.',
        );
      if (!conversation.attentionPending) return conversation;
      const now = new Date();
      await manager.query(
        `UPDATE conversation_attention_events SET "resolvedAt"=$2,"resolvedBy"=$3 WHERE "conversationId"=$1 AND "resolvedAt" IS NULL`,
        [id, now, userId],
      );
      conversation.lifecycleVersion = (conversation.lifecycleVersion ?? 0) + 1;
      conversation.attentionPending = false;
      conversation.attentionAcknowledgedAt = now;
      conversation.attentionAcknowledgedBy = userId;
      // Atender no concede permiso al bot ni programa mensajes.
      return manager.save(conversation);
    });
  }

  async withConversationLock<T>(
    id: string,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.conversationsRepo.manager.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [id],
      );
      return action(manager);
    });
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
    return this.withConversationLock(id, async (manager) => {
      const conversation = await manager.findOneOrFail(Conversation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (conversation.aiMode !== ConversationAiMode.AUTO && !fields.optOut)
        return conversation;
      if (fields.courseInterest)
        await manager.update(Contact, conversation.contactId, {
          courseInterest: fields.courseInterest.slice(0, 200),
        });
      if (fields.language) conversation.language = fields.language.slice(0, 10);
      if (fields.optIn) conversation.optInAt = new Date();
      if (fields.optOut) {
        conversation.optOutAt = new Date();
        conversation.aiMode = ConversationAiMode.PAUSED;
        conversation.nextFollowUpAt = null;
      }
      if (fields.summary)
        conversation.aiSummary = fields.summary.slice(0, 5000);
      return manager.save(conversation);
    });
  }

  async scheduleFollowUp(id: string, days: number) {
    return this.withConversationLock(id, async (manager) => {
      const conversation = await manager.findOneOrFail(Conversation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        conversation.status !== ConversationStatus.OPEN ||
        !conversation.optInAt ||
        conversation.optOutAt ||
        conversation.aiMode !== ConversationAiMode.AUTO
      )
        return conversation;
      conversation.nextFollowUpAt = new Date(
        Date.now() + days * 24 * 60 * 60 * 1000,
      );
      return manager.save(conversation);
    });
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

  async markFollowUpSent(
    id: string,
    expectedStep: number,
    expectedAt: Date | null,
    schedule: number[] = [1, 3, 7, 14],
  ) {
    return this.withConversationLock(id, async (manager) => {
      const conversation = await manager.findOneOrFail(Conversation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        conversation.followUpStep !== expectedStep ||
        conversation.nextFollowUpAt?.getTime() !== expectedAt?.getTime() ||
        conversation.aiMode !== ConversationAiMode.AUTO ||
        conversation.optOutAt
      )
        return conversation;
      const nextDays = schedule;
      const nextStep = conversation.followUpStep + 1;
      conversation.followUpStep = nextStep;
      conversation.nextFollowUpAt = nextDays[nextStep]
        ? new Date(
            Date.now() +
              (nextDays[nextStep] - nextDays[nextStep - 1]) *
                24 *
                60 *
                60 *
                1000,
          )
        : null;
      return manager.save(conversation);
    });
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
