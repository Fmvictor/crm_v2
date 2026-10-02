import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Interaction,
  InteractionDirection,
  InteractionSource,
  InteractionType,
} from './entities/interaction.entity';
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
    metadata: {
      externalMessageId?: string;
      source?: InteractionSource;
      messageTimestamp?: Date;
      createdById?: string;
    } = {},
  ): Promise<Interaction> {
    const interaction = this.interactionsRepo.create({
      ...dto,
      type: dto.type ?? InteractionType.WHATSAPP,
      externalMessageId: metadata.externalMessageId ?? null,
      source: metadata.source ?? InteractionSource.SYSTEM,
      messageTimestamp: metadata.messageTimestamp ?? null,
      createdById: metadata.createdById ?? null,
    });
    return this.interactionsRepo.save(interaction);
  }

  async createIncomingOnce(input: {
    contactId: string;
    notes: string;
    externalMessageId: string;
    messageTimestamp?: Date;
  }): Promise<string | null> {
    const result = await this.interactionsRepo
      .createQueryBuilder()
      .insert()
      .values({
        contactId: input.contactId,
        type: InteractionType.WHATSAPP,
        direction: InteractionDirection.INBOUND,
        notes: input.notes,
        externalMessageId: input.externalMessageId,
        source: InteractionSource.CUSTOMER,
        messageTimestamp: input.messageTimestamp ?? null,
      })
      .orIgnore()
      .returning('id')
      .execute();
    return (result.raw[0]?.id as string | undefined) ?? null;
  }

  async findLatestIncoming(contactId: string): Promise<Interaction | null> {
    return this.interactionsRepo.findOne({
      where: {
        contactId,
        type: InteractionType.WHATSAPP,
        direction: InteractionDirection.INBOUND,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findLatestHumanOutbound(
    contactId: string,
  ): Promise<Interaction | null> {
    return this.interactionsRepo.findOne({
      where: {
        contactId,
        type: InteractionType.WHATSAPP,
        direction: InteractionDirection.OUTBOUND,
        source: InteractionSource.HUMAN,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async updateDeliveryStatus(
    externalMessageId: string,
    status: string,
  ): Promise<void> {
    if (
      !externalMessageId ||
      !['sent', 'delivered', 'read', 'failed'].includes(status)
    )
      return;
    await this.interactionsRepo.update(
      { externalMessageId },
      { deliveryStatus: status },
    );
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
