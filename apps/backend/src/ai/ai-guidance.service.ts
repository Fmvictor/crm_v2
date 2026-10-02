import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interaction } from '../interactions/entities/interaction.entity';
import { BotControl } from './entities/bot-control.entity';
import { BotInstruction } from './entities/bot-instruction.entity';
import { BotLearning, BotLearningStatus } from './entities/bot-learning.entity';

@Injectable()
export class AiGuidanceService {
  constructor(
    @InjectRepository(BotInstruction)
    private readonly instructionsRepo: Repository<BotInstruction>,
    @InjectRepository(BotLearning)
    private readonly learningsRepo: Repository<BotLearning>,
    @InjectRepository(BotControl)
    private readonly controlRepo: Repository<BotControl>,
    @InjectRepository(Interaction)
    private readonly interactionsRepo: Repository<Interaction>,
  ) {}

  async getLatestInstruction(): Promise<string | null> {
    const instruction = await this.instructionsRepo.findOne({
      where: {},
      order: { version: 'DESC' },
    });
    return instruction?.text ?? null;
  }

  async replaceInstruction(
    text: string,
    createdById: string,
  ): Promise<BotInstruction> {
    const normalized = text.trim();
    if (!normalized)
      throw new Error('Las instrucciones no pueden estar vacías');
    const latest = await this.instructionsRepo.findOne({
      where: {},
      order: { version: 'DESC' },
    });
    return this.instructionsRepo.save(
      this.instructionsRepo.create({
        version: (latest?.version ?? 0) + 1,
        text: normalized.slice(0, 12000),
        createdById,
      }),
    );
  }

  async captureManualResponse(interactionId: string): Promise<void> {
    const existing = await this.learningsRepo.findOne({
      where: { interactionId },
    });
    if (existing) return;
    await this.learningsRepo.save(
      this.learningsRepo.create({
        interactionId,
        status: BotLearningStatus.PENDING,
        category: 'style',
        approvedText: null,
        reviewerId: null,
      }),
    );
  }

  async listLearnings(status?: BotLearningStatus) {
    const learnings = await this.learningsRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const interactionIds = learnings.map((learning) => learning.interactionId);
    const interactions = interactionIds.length
      ? await this.interactionsRepo.findByIds(interactionIds)
      : [];
    const textByInteraction = new Map(
      interactions.map((interaction) => [interaction.id, interaction.notes]),
    );
    return learnings.map((learning) => ({
      ...learning,
      candidateText: textByInteraction.get(learning.interactionId) ?? null,
    }));
  }

  async reviewLearning(
    id: string,
    reviewerId: string,
    status: BotLearningStatus.APPROVED | BotLearningStatus.REJECTED,
    category?: string,
    approvedText?: string,
  ): Promise<BotLearning> {
    const learning = await this.learningsRepo.findOne({ where: { id } });
    if (!learning)
      throw new NotFoundException(`Aprendizaje ${id} no encontrado`);

    learning.status = status;
    learning.category = (category?.trim() || learning.category).slice(0, 20);
    learning.reviewerId = reviewerId;
    if (status === BotLearningStatus.APPROVED) {
      const interaction = await this.interactionsRepo.findOne({
        where: { id: learning.interactionId },
      });
      const text = (approvedText?.trim() || interaction?.notes || '').trim();
      if (!text) throw new Error('No hay texto para aprobar');
      learning.approvedText = text.slice(0, 4000);
    } else {
      learning.approvedText = null;
    }
    return this.learningsRepo.save(learning);
  }

  async getApprovedExamples(limit = 8): Promise<string[]> {
    const learnings = await this.learningsRepo.find({
      where: { status: BotLearningStatus.APPROVED },
      order: { updatedAt: 'DESC' },
      take: limit,
    });
    return learnings
      .map((learning) => learning.approvedText?.trim())
      .filter((text): text is string => Boolean(text));
  }

  async isPaused(): Promise<boolean> {
    const control = await this.controlRepo.findOne({ where: { id: 1 } });
    return control?.paused ?? true;
  }

  async setPaused(paused: boolean, updatedById: string): Promise<BotControl> {
    const control =
      (await this.controlRepo.findOne({ where: { id: 1 } })) ??
      this.controlRepo.create({ id: 1 });
    control.paused = paused;
    control.updatedById = updatedById;
    return this.controlRepo.save(control);
  }

  async getConfiguration() {
    const [instruction, paused] = await Promise.all([
      this.getLatestInstruction(),
      this.isPaused(),
    ]);
    return { instruction, paused };
  }
}
