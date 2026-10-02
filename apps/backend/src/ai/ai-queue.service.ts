import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import Redis from 'ioredis';
import { AiConversationProcessor } from './ai-conversation.processor';
import { ConversationsService } from '../conversations/conversations.service';
import { ConversationAiMode } from '../conversations/entities/conversation.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class AiQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiQueueService.name);
  private redis: Redis | null = null;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly processor: AiConversationProcessor,
    @Inject(forwardRef(() => ConversationsService)) private readonly conversationsService: ConversationsService,
    @Inject(forwardRef(() => WhatsAppService)) private readonly whatsAppService: WhatsAppService,
  ) {}

  onModuleInit() {
    if (process.env.AI_WHATSAPP_ENABLED !== 'true') return;
    if (!this.allowedPhones().length) {
      this.logger.warn('IA WhatsApp habilitada sin AI_WHATSAPP_TEST_PHONES; el procesamiento queda bloqueado por seguridad');
    }
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
      this.redis.on('error', (error) => this.logger.warn(`Redis IA: ${error.message}`));
      this.running = true;
      void this.consume();
      this.timer = setInterval(() => void this.processFollowUps(), 60_000);
    }
  }

  async enqueue(conversationId: string) {
    if (process.env.AI_WHATSAPP_ENABLED !== 'true') return;
    const conversation = await this.conversationsService.findOne(conversationId);
    if (!this.allowedPhones().includes(this.normalizePhone(conversation.contact.phone))) return;
    if (!this.redis) return this.processor.process(conversationId);
    await this.redis.lpush('emeb:whatsapp:ai', JSON.stringify({ conversationId }));
  }

  private async consume() {
    while (this.running && this.redis) {
      try {
        const item = await this.redis.brpop('emeb:whatsapp:ai', 5);
        if (!item) continue;
        const payload = JSON.parse(item[1]) as { conversationId: string };
        await this.processor.process(payload.conversationId);
      } catch (error) {
        this.logger.error(`Error procesando cola IA: ${error instanceof Error ? error.message : 'error desconocido'}`);
      }
    }
  }

  private async processFollowUps() {
    const due = await this.conversationsService.findDueFollowUps();
    for (const conversation of due) {
      if (conversation.aiMode !== ConversationAiMode.AUTO || !conversation.optInAt) continue;
      if (!this.allowedPhones().includes(this.normalizePhone(conversation.contact.phone))) continue;
      const sent = await this.whatsAppService.sendConfiguredFollowUp(conversation);
      if (sent) await this.conversationsService.markFollowUpSent(conversation.id);
    }
  }

  private allowedPhones(): string[] {
    return (process.env.AI_WHATSAPP_TEST_PHONES ?? '')
      .split(',')
      .map((phone) => this.normalizePhone(phone))
      .filter(Boolean);
  }

  private normalizePhone(phone: string | null | undefined): string {
    return (phone ?? '').replace(/\D/g, '');
  }

  async onModuleDestroy() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (this.redis) await this.redis.quit();
  }
}
