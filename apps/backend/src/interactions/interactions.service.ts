import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interaction } from './entities/interaction.entity';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { UpdateInteractionDto } from './dto/update-interaction.dto';
import { FilterInteractionDto } from './dto/filter-interaction.dto';
import { PaginatedResult } from '../contacts/contacts.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class InteractionsService {
  constructor(
    @InjectRepository(Interaction)
    private readonly interactionsRepo: Repository<Interaction>,
  ) {}

  create(dto: CreateInteractionDto, actor: User): Promise<Interaction> {
    const interaction = this.interactionsRepo.create({
      ...dto,
      createdById: actor.id,
    });
    return this.interactionsRepo.save(interaction);
  }

  async createSystemInteraction(dto: CreateInteractionDto): Promise<Interaction> {
    const interaction = this.interactionsRepo.create(dto);
    return this.interactionsRepo.save(interaction);
  }

  async findAll(
    filter: FilterInteractionDto,
  ): Promise<PaginatedResult<Interaction>> {
    const { contactId, type, page = 1, limit = 20 } = filter;
    const where: any = {};
    if (contactId) where.contactId = contactId;
    if (type) where.type = type;

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
      where: { id },
      relations: ['contact', 'createdBy'],
    });
    if (!interaction)
      throw new NotFoundException(`Interacción ${id} no encontrada`);
    return interaction;
  }

  async update(id: string, dto: UpdateInteractionDto): Promise<Interaction> {
    const interaction = await this.findOne(id);
    Object.assign(interaction, dto);
    return this.interactionsRepo.save(interaction);
  }

  async remove(id: string): Promise<void> {
    const interaction = await this.findOne(id);
    await this.interactionsRepo.remove(interaction);
  }
}
