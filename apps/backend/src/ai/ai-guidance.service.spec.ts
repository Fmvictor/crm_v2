import { AiGuidanceService } from './ai-guidance.service';
import { Repository } from 'typeorm';
import { BotInstruction } from './entities/bot-instruction.entity';
import { BotControl } from './entities/bot-control.entity';
import { Interaction } from '../interactions/entities/interaction.entity';
import { AiUsageService } from './ai-usage.service';
import { BotLearning, BotLearningStatus } from './entities/bot-learning.entity';

describe('AiGuidanceService', () => {
  it('creates one pending candidate for a manual answer', async () => {
    const learningsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((value: unknown) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AiGuidanceService(
      {} as Repository<BotInstruction>,
      learningsRepo as unknown as Repository<BotLearning>,
      {} as Repository<BotControl>,
      {} as Repository<Interaction>,
      {} as AiUsageService,
    );

    await service.captureManualResponse('interaction-id');

    expect(learningsRepo.create).toHaveBeenCalledWith({
      interactionId: 'interaction-id',
      status: BotLearningStatus.PENDING,
      category: 'style',
      approvedText: null,
      reviewerId: null,
    });
  });

  it('uses the reviewed manual text as an approved example', async () => {
    const learning = {
      id: 'learning-id',
      interactionId: 'interaction-id',
      status: BotLearningStatus.PENDING,
      category: 'style',
      approvedText: null,
      reviewerId: null,
    };
    const learningsRepo = {
      findOne: jest.fn().mockResolvedValue(learning),
      save: jest.fn().mockImplementation((value: unknown) => value),
    };
    const interactionsRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ notes: 'Respuesta enviada por el equipo.' }),
    };
    const service = new AiGuidanceService(
      {} as Repository<BotInstruction>,
      learningsRepo as unknown as Repository<BotLearning>,
      {} as Repository<BotControl>,
      interactionsRepo as unknown as Repository<Interaction>,
      {} as AiUsageService,
    );

    const reviewed = await service.reviewLearning(
      'learning-id',
      'admin-id',
      BotLearningStatus.APPROVED,
    );

    expect(reviewed.status).toBe(BotLearningStatus.APPROVED);
    expect(reviewed.approvedText).toBe('Respuesta enviada por el equipo.');
    expect(reviewed.reviewerId).toBe('admin-id');
  });
});
