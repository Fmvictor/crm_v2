import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BotJob, BotJobStatus } from './entities/bot-job.entity';
import { BotInstruction } from './entities/bot-instruction.entity';
import {
  BotLearning,
  BotLearningCategory,
  BotLearningStatus,
} from './entities/bot-learning.entity';

@Injectable()
export class BotJobsService {
  constructor(
    @InjectRepository(BotJob)
    private readonly repo: Repository<BotJob>,
    @InjectRepository(BotInstruction)
    private readonly instructionsRepo: Repository<BotInstruction>,
    @InjectRepository(BotLearning)
    private readonly learningRepo: Repository<BotLearning>,
  ) {}

  async enqueue(input: {
    inboundInteractionId: string;
    contactId: string;
    phone: string;
    question: string;
    status?: 'pending' | 'needs_human';
    reason?: string;
  }): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .values({ ...input, status: input.status ?? 'pending' })
      .orIgnore()
      .execute();
  }

  async claimNext(): Promise<BotJob | null> {
    const result: unknown = await this.repo.query(`
      UPDATE bot_jobs SET status = 'processing', "updatedAt" = NOW()
      WHERE id = (
        SELECT id FROM bot_jobs WHERE status = 'pending'
        ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING *
    `);
    if (!Array.isArray(result) || result.length === 0) return null;
    const row: unknown = result[0];
    if (!row || typeof row !== 'object' || !('id' in row)) return null;
    return row as BotJob;
  }

  async markAbandonedProcessing(): Promise<void> {
    await this.repo.query(`
      UPDATE bot_jobs
      SET status = 'needs_human', reason = 'Proceso interrumpido antes de confirmar el envío', "updatedAt" = NOW()
      WHERE status = 'processing' AND "updatedAt" < NOW() - INTERVAL '5 minutes'
    `);
  }

  async getCurrentInstructions(): Promise<string> {
    return (await this.getLatestInstruction())?.text ?? '';
  }

  async getApprovedExamples(): Promise<string[]> {
    const examples = await this.learningRepo.find({
      where: { status: 'approved' },
      order: { updatedAt: 'DESC' },
      take: 8,
    });
    return examples.map(
      (item) => `${item.category}: ${item.approvedText ?? ''}`,
    );
  }

  async getLatestInstruction(): Promise<BotInstruction | null> {
    const [latest] = await this.instructionsRepo.find({
      order: { version: 'DESC' },
      take: 1,
    });
    return latest ?? null;
  }

  async replaceInstructions(
    text: string,
    createdById: string,
  ): Promise<BotInstruction> {
    const clean = text.trim();
    if (!clean || clean.length > 5_000)
      throw new BadRequestException('Instrucciones inválidas');
    const latest = await this.getLatestInstruction();
    return this.instructionsRepo.save(
      this.instructionsRepo.create({
        version: (latest?.version ?? 0) + 1,
        text: clean,
        createdById,
      }),
    );
  }

  async proposeLearning(interactionId: string): Promise<void> {
    await this.learningRepo
      .createQueryBuilder()
      .insert()
      .values({ interactionId })
      .orIgnore()
      .execute();
  }

  async listLearnings(): Promise<BotLearning[]> {
    return this.learningRepo.find({
      relations: ['interaction'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async reviewLearning(
    id: string,
    status: Exclude<BotLearningStatus, 'pending'>,
    category: BotLearningCategory,
    approvedText: string | undefined,
    reviewerId: string,
  ): Promise<BotLearning> {
    const item = await this.learningRepo.findOneBy({ id });
    if (!item) throw new NotFoundException('Propuesta no encontrada');
    const clean = approvedText?.trim() ?? '';
    if (status === 'approved' && (!clean || clean.length > 1_000)) {
      throw new BadRequestException('Revisa el texto antes de aprobarlo');
    }
    item.status = status;
    item.category = category;
    item.approvedText = status === 'approved' ? clean : null;
    item.reviewerId = reviewerId;
    return this.learningRepo.save(item);
  }

  async complete(
    id: string,
    status: Exclude<BotJobStatus, 'pending' | 'processing'>,
    details: Partial<
      Pick<BotJob, 'answer' | 'reason' | 'sourceUrl' | 'sourceFetchedAt'>
    >,
  ): Promise<void> {
    await this.repo.update(
      { id, status: 'processing' },
      { status, ...details },
    );
  }

  async resolveForContact(contactId: string): Promise<void> {
    await this.repo.update(
      {
        contactId,
        status: In(['pending', 'processing', 'draft', 'needs_human']),
      },
      { status: 'resolved', reason: 'Atendido por una persona' },
    );
  }

  async listForContact(contactId: string): Promise<BotJob[]> {
    return this.repo.find({
      where: { contactId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async listAttention(): Promise<BotJob[]> {
    return this.repo.find({
      where: [{ status: 'needs_human' }, { status: 'draft' }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async isGloballyPaused(): Promise<boolean> {
    const result: unknown = await this.repo.query(
      'SELECT paused FROM bot_control WHERE id = 1',
    );
    if (!Array.isArray(result) || result.length !== 1) return true;
    const row: unknown = result[0];
    return row !== null && typeof row === 'object' && 'paused' in row
      ? row.paused !== false
      : true;
  }

  async setGlobalPaused(paused: boolean, userId: string): Promise<void> {
    await this.repo.query(
      `INSERT INTO bot_control (id, paused, "updatedById", "updatedAt")
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET paused = EXCLUDED.paused,
         "updatedById" = EXCLUDED."updatedById", "updatedAt" = NOW()`,
      [paused, userId],
    );
  }
}
