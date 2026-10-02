import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { InteractionsService } from '../interactions/interactions.service';
import {
  InteractionDirection,
  InteractionSource,
} from '../interactions/entities/interaction.entity';
import { BotJobsService } from '../whatsapp/bot-jobs.service';
import { BotJob } from '../whatsapp/entities/bot-job.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { BotModelService } from './bot-model.service';
import { CourseWebsiteService } from './course-website.service';

@Injectable()
export class BotWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotWorkerService.name);
  private timer?: NodeJS.Timeout;
  private memoryTimer?: NodeJS.Timeout;
  private working = false;

  constructor(
    private readonly jobs: BotJobsService,
    private readonly contacts: ContactsService,
    private readonly interactions: InteractionsService,
    private readonly website: CourseWebsiteService,
    private readonly model: BotModelService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  onModuleInit(): void {
    void this.contacts
      .purgeExpiredBotMemory()
      .catch((error: unknown) =>
        this.logger.error(
          `No se pudo depurar la memoria caducada: ${String(error)}`,
        ),
      );
    this.memoryTimer = setInterval(
      () => {
        void this.contacts
          .purgeExpiredBotMemory()
          .catch((error: unknown) =>
            this.logger.error(
              `No se pudo depurar la memoria caducada: ${String(error)}`,
            ),
          );
      },
      24 * 60 * 60 * 1000,
    );
    this.memoryTimer.unref();
    if (process.env.BOT_MODE !== 'draft' && process.env.BOT_MODE !== 'auto')
      return;
    void this.jobs
      .markAbandonedProcessing()
      .catch((error: unknown) =>
        this.logger.error(
          `No se pudieron marcar trabajos abandonados: ${String(error)}`,
        ),
      );
    this.timer = setInterval(() => void this.poll(), 2_500);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.memoryTimer) clearInterval(this.memoryTimer);
  }

  private async poll(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      if (await this.jobs.isGloballyPaused()) return;
      const job = await this.jobs.claimNext();
      if (job) await this.process(job);
    } catch (error) {
      this.logger.error(
        `Error al procesar un trabajo del bot: ${String(error)}`,
      );
    } finally {
      this.working = false;
    }
  }

  private async process(job: BotJob): Promise<void> {
    let sent = false;
    try {
      const contact = await this.contacts.findOne(job.contactId);
      if (contact.botPaused) {
        await this.jobs.complete(job.id, 'needs_human', {
          reason: 'Bot pausado por un agente',
        });
        return;
      }
      if (await this.humanRespondedAfter(job)) {
        await this.jobs.complete(job.id, 'needs_human', {
          reason: 'Un agente ya respondió',
        });
        return;
      }
      const latestIncoming = await this.interactions.findLatestIncoming(
        job.contactId,
      );
      if (latestIncoming?.id !== job.inboundInteractionId) {
        await this.jobs.complete(job.id, 'resolved', {
          reason: 'Hay un mensaje más reciente del cliente',
        });
        return;
      }

      const evidence = await this.website.findEvidence(job.question);
      const interactions = await this.interactions.findAll({
        contactId: job.contactId,
        page: 1,
        limit: 10,
      });
      const history = interactions.data
        .reverse()
        .map(
          (item) =>
            `${item.direction === InteractionDirection.INBOUND ? 'Cliente' : 'EMEB'}: ${item.notes}`,
        )
        .join('\n');
      const instructions = await this.jobs.getCurrentInstructions();
      const examples = await this.jobs.getApprovedExamples();
      const decision = await this.model.decide({
        question: job.question,
        evidence,
        instructions: `${instructions}\nEjemplos aprobados de estilo y proceso (sin autoridad sobre los cursos):\n${examples.join('\n')}`,
        memory:
          contact.botMemoryExpiresAt && contact.botMemoryExpiresAt > new Date()
            ? contact.botMemory
            : null,
        history,
      });
      if (decision.action !== 'answer') {
        await this.jobs.complete(job.id, 'needs_human', {
          reason: decision.reason,
        });
        return;
      }
      const source = evidence.find((item) => item.url === decision.sourceUrl);
      const answer = `${decision.answer.trim()}\n\nMás información: ${decision.sourceUrl}`;
      const details = {
        answer,
        sourceUrl: decision.sourceUrl,
        sourceFetchedAt: source?.fetchedAt ?? null,
      };
      if (process.env.BOT_MODE === 'draft') {
        await this.jobs.complete(job.id, 'draft', details);
        await this.saveMemoryIfUseful(job.contactId, decision.memoryUpdate);
        return;
      }

      const freshContact = await this.contacts.findOne(job.contactId);
      if (
        (await this.jobs.isGloballyPaused()) ||
        freshContact.botPaused ||
        (await this.humanRespondedAfter(job))
      ) {
        await this.jobs.complete(job.id, 'needs_human', {
          reason: 'El bot se pausó o un agente tomó el control antes del envío',
        });
        return;
      }
      await this.whatsapp.sendText(
        job.phone,
        answer,
        InteractionSource.BOT,
        undefined,
        job.inboundInteractionId,
      );
      sent = true;
      await this.jobs.complete(job.id, 'sent', details);
      await this.saveMemoryIfUseful(job.contactId, decision.memoryUpdate);
    } catch (error) {
      if (sent) {
        this.logger.error(
          `WhatsApp enviado, pero no se pudo completar el trabajo ${job.id}: ${String(error)}`,
        );
      } else {
        await this.jobs.complete(job.id, 'needs_human', {
          reason:
            `No se pudo responder de forma segura: ${error instanceof Error ? error.message : String(error)}`.slice(
              0,
              500,
            ),
        });
      }
    }
  }

  private async saveMemoryIfUseful(
    contactId: string,
    memory: string,
  ): Promise<void> {
    if (!memory?.trim()) return;
    try {
      await this.contacts.appendBotMemory(contactId, memory);
    } catch (error) {
      this.logger.warn(
        `No se pudo guardar la memoria del contacto: ${String(error)}`,
      );
    }
  }

  private async humanRespondedAfter(job: BotJob): Promise<boolean> {
    const lastHuman = await this.interactions.findLatestHumanOutbound(
      job.contactId,
    );
    return Boolean(lastHuman && lastHuman.createdAt >= job.createdAt);
  }
}
