import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interaction, InteractionType } from './entities/interaction.entity';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { FilterInteractionDto } from './dto/filter-interaction.dto';
import { PaginatedResult } from '../contacts/contacts.service';

@Injectable()
export class InteractionsService {
  constructor(
    @InjectRepository(Interaction)
    private readonly interactionsRepo: Repository<Interaction>,
  ) {}

  async createSystemInteraction(
    dto: CreateInteractionDto,
  ): Promise<Interaction> {
    const interaction = this.interactionsRepo.create({
      ...dto,
      type: dto.type ?? InteractionType.WHATSAPP,
    });
    return this.interactionsRepo.save(interaction);
  }

  async findAll(
    filter: FilterInteractionDto,
  ): Promise<PaginatedResult<Interaction>> {
    const { contactId, page = 1, limit = 20 } = filter;
    const where: any = {};
    if (contactId) where.contactId = contactId;
    where.type = InteractionType.WHATSAPP;

    const [data, total] = await this.interactionsRepo.findAndCount({
      where,
      relations: ['contact', 'createdBy'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, lastPage: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Interaction> {
    const interaction = await this.interactionsRepo.findOne({
      where: { id, type: InteractionType.WHATSAPP },
      relations: ['contact', 'createdBy'],
    });
    if (!interaction)
      throw new NotFoundException(`Interacción ${id} no encontrada`);
    return interaction;
  }
}
