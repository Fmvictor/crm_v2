import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AiConversationProcessor } from './ai-conversation.processor';
import { ConversationsService } from '../conversations/conversations.service';
import { ConversationAiMode } from '../conversations/entities/conversation.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { AiGuidanceService } from './ai-guidance.service';
import { BotConfigService } from '../bot-config/bot-config.service';
import { AiJobStore } from './ai-job.store';
import {
  DeliveryBlockedError,
  DeliveryHistoryError,
  DeliveryRejectedError,
  DeliveryUncertainError,
} from '../whatsapp/whatsapp-dispatch.service';

@Injectable()
export class AiQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiQueueService.name);
  private timer?: NodeJS.Timeout;
  private followUpTimer?: NodeJS.Timeout;
  private processing = false;
  private processingFollowUps = false;
  private stopped = false;

  constructor(
    private readonly processor: AiConversationProcessor,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsAppService: WhatsAppService,
    private readonly guidance: AiGuidanceService,
    private readonly jobs: AiJobStore,
    private readonly configuration: BotConfigService,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) return;
    this.timer = setInterval(() => void this.consume(), 1000);
    this.followUpTimer = setInterval(
      () => void this.processFollowUps(),
      60_000,
    );
  }

  isEnabled(): boolean {
    return (
      process.env.AI_WHATSAPP_ENABLED === 'true' &&
      process.env.AI_RELIABLE_DELIVERY_ENABLED === 'true'
    );
  }

  acceptsPhone(phone: string | null | undefined): boolean {
    if (!this.isEnabled()) return false;
    const normalize = (value: string) => value.replace(/\D/g, '');
    const allowed = (process.env.AI_WHATSAPP_TEST_PHONES ?? '')
      .split(',')
      .map(normalize)
      .filter(Boolean);
    // Activation requires an explicit audience. A wildcard is a deliberate rollout decision.
    return (
      process.env.AI_WHATSAPP_TEST_PHONES?.trim() === '*' ||
      allowed.includes(normalize(phone ?? ''))
    );
  }

  private async consume(): Promise<void> {
    if (this.processing || this.stopped) return;
    this.processing = true;
    let heartbeat: NodeJS.Timeout | undefined;
    try {
      if (await this.guidance.isPaused()) return;
      const job = await this.jobs.claim();
      if (!job) return;
      heartbeat = setInterval(() => {
        void this.jobs
          .renew(job)
          .catch(() => this.logger.error('No se pudo renovar el trabajo IA.'));
      }, 20_000);
      try {
        const current = await this.conversationsService.findOne(
          job.conversationId,
        );
        if (!this.acceptsPhone(current.externalContactKey)) {
          await this.jobs.finish(job);
          return;
        }
        if (await this.jobs.needsDeliveryReview(job))
          throw new DeliveryUncertainError();
        if (job.attempts > 3) throw new Error('Intentos agotados');
        await this.processor.process(job.conversationId, job.inboundMessageId);
        await this.jobs.finish(job);
      } catch (error) {
        if (error instanceof DeliveryBlockedError) {
          await this.jobs.finish(job);
          return;
        }
        const terminal =
          job.attempts >= 3 ||
          error instanceof DeliveryRejectedError ||
          error instanceof DeliveryUncertainError ||
          error instanceof DeliveryHistoryError;
        if (terminal) {
          // Persist the handoff before closing the failed job. A DB failure leaves it recoverable.
          await this.conversationsService.setMode(
            job.conversationId,
            ConversationAiMode.HUMAN,
            error instanceof DeliveryUncertainError
              ? 'Envío incierto: revisar antes de reenviar.'
              : 'Fallo de atención automática: requiere revisión.',
            `job:${job.id}`,
          );
        }
        await this.jobs.fail(job, terminal);
        this.logger.error(
          terminal
            ? 'Trabajo IA derivado a revisión humana.'
            : 'Trabajo IA pendiente de reintento limitado.',
        );
      }
    } catch {
      this.logger.error('No se pudo procesar la cola persistente IA.');
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.processing = false;
    }
  }

  private async processFollowUps(): Promise<void> {
    if (this.processingFollowUps || this.stopped) return;
    this.processingFollowUps = true;
    try {
      if (await this.guidance.isPaused()) return;
      const snapshot = await this.configuration.active();
      if (!snapshot.configuration.rules.followUpsEnabled) return;
      for (const conversation of await this.conversationsService.findDueFollowUps()) {
        if (
          conversation.aiMode !== ConversationAiMode.AUTO ||
          !conversation.optInAt ||
          conversation.optOutAt
        )
          continue;
        if (!this.acceptsPhone(conversation.externalContactKey)) continue;
        if (await this.guidance.isPaused()) break;
        try {
          const sent = await this.whatsAppService.sendConfiguredFollowUp(
            conversation,
            snapshot,
          );
          if (!sent) throw new DeliveryRejectedError(0);
          await this.conversationsService.markFollowUpSent(
            conversation.id,
            conversation.followUpStep,
            conversation.nextFollowUpAt,
            snapshot.configuration.rules.followUpDays,
          );
        } catch (error) {
          if (error instanceof DeliveryBlockedError) continue;
          // Follow-ups are discretionary: never retry an ambiguous delivery or a missing template every minute.
          await this.conversationsService.setMode(
            conversation.id,
            ConversationAiMode.HUMAN,
            error instanceof DeliveryUncertainError
              ? 'Seguimiento con envío incierto: revisar sin reenviar.'
              : 'Seguimiento fallido: revisar plantilla y configuración.',
            `followup:${conversation.id}:${conversation.followUpStep}:${conversation.nextFollowUpAt?.toISOString()}`,
          );
          this.logger.error(
            'Seguimiento detenido y derivado a revisión humana.',
          );
        }
      }
    } catch {
      this.logger.error('No se pudo revisar los seguimientos automáticos.');
    } finally {
      this.processingFollowUps = false;
    }
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.followUpTimer) clearInterval(this.followUpTimer);
  }
}
