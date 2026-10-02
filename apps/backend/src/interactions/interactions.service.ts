import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Interaction,
  InteractionDirection,
  InteractionType,
} from './entities/interaction.entity';

export interface SystemInteractionInput {
  contactId: string;
  type: InteractionType;
  direction: InteractionDirection | null;
  notes: string;
  externalMessageId?: string | null;
  createdById?: string;
  source?: string;
  messageTimestamp?: Date;
  deliveryStatus?: string;
}

@Injectable()
export class InteractionsService {
  constructor(
    @InjectRepository(Interaction)
    private readonly interactionsRepo: Repository<Interaction>,
  ) {}

  async createSystemInteraction(
    dto: SystemInteractionInput,
  ): Promise<Interaction> {
    if (dto.externalMessageId) {
      const existing = await this.interactionsRepo.findOne({
        where: { externalMessageId: dto.externalMessageId },
      });
      if (existing) return existing;
    }
    const interaction = this.interactionsRepo.create(dto);
    try {
      return await this.interactionsRepo.save(interaction);
    } catch (error) {
      if (
        dto.externalMessageId &&
        (error as { code?: string }).code === '23505'
      ) {
        const existing = await this.interactionsRepo.findOne({
          where: { externalMessageId: dto.externalMessageId },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }
}
