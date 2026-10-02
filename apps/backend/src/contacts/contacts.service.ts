import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, EntityManager, LessThan } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { FilterContactDto } from './dto/filter-contact.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  lastPage: number;
}

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
  ) {}

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  async create(dto: CreateContactDto): Promise<Contact> {
    if (dto.phone) {
      dto.phone = this.normalizePhone(dto.phone);
    }
    const contact = this.contactsRepo.create(dto);
    return this.contactsRepo.save(contact);
  }

  async findAll(filter: FilterContactDto): Promise<PaginatedResult<Contact>> {
    const { status, search, page = 1, limit = 20 } = filter;

    const where: any = {};
    if (status) where.status = status;

    if (search) {
      const baseWhere = { ...where };

      // Intentar buscar también por teléfono limpio si la búsqueda parece un número
      const cleanSearch = search.replace(/\D/g, '');

      const searchConditions = [
        { ...baseWhere, name: ILike(`%${search}%`) },
        { ...baseWhere, phone: ILike(`%${search}%`) },
      ];

      if (cleanSearch.length >= 3) {
        searchConditions.push({
          ...baseWhere,
          phone: ILike(`%${cleanSearch}%`),
        });
      }

      const [data, total] = await this.contactsRepo.findAndCount({
        where: searchConditions,
        relations: ['assignedTo'],
        skip: (page - 1) * limit,
        take: limit,
        order: { createdAt: 'DESC' },
      });
      return { data, total, page, lastPage: Math.ceil(total / limit) };
    }

    const [data, total] = await this.contactsRepo.findAndCount({
      where,
      relations: ['assignedTo'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, lastPage: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Contact> {
    const contact = await this.contactsRepo.findOne({
      where: { id },
      relations: ['assignedTo'],
    });
    if (!contact) throw new NotFoundException(`Contacto ${id} no encontrado`);
    return contact;
  }

  async findOneByPhone(phone: string): Promise<Contact | null> {
    const cleanPhone = this.normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 7) return null;

    const lastDigits = cleanPhone.slice(-9);

    // Usamos una consulta cruda para ignorar espacios/guiones en la base de datos
    return this.contactsRepo
      .createQueryBuilder('contact')
      .where(
        "REPLACE(REPLACE(REPLACE(REPLACE(contact.phone, ' ', ''), '-', ''), '(', ''), ')', '') ILIKE :search",
        { search: `%${lastDigits}` },
      )
      .leftJoinAndSelect('contact.assignedTo', 'assignedTo')
      .getOne();
  }

  async findOrCreateWhatsApp(phone: string, name?: string): Promise<Contact> {
    const cleanPhone = this.normalizePhone(phone);
    if (cleanPhone.length < 7)
      throw new NotFoundException('Teléfono de WhatsApp inválido');
    return this.contactsRepo.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        cleanPhone,
      ]);
      const lastDigits = cleanPhone.slice(-9);
      const repo = manager.getRepository(Contact);
      const existing = await repo
        .createQueryBuilder('contact')
        .where(
          "REPLACE(REPLACE(REPLACE(REPLACE(contact.phone, ' ', ''), '-', ''), '(', ''), ')', '') ILIKE :search",
          { search: `%${lastDigits}` },
        )
        .getOne();
      if (existing) return existing;
      return repo.save(
        repo.create({
          name: name?.trim() || `Nuevo contacto (WA ${cleanPhone.slice(-4)})`,
          phone: cleanPhone,
        }),
      );
    });
  }

  async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.findOne(id);
    if (dto.phone) {
      dto.phone = this.normalizePhone(dto.phone);
    }
    Object.assign(contact, dto);
    return this.contactsRepo.save(contact);
  }

  async setBotPaused(id: string, paused: boolean): Promise<Contact> {
    return this.withConversationLock(id, async (contact, manager) => {
      contact.botPaused = paused;
      return manager.save(contact);
    });
  }

  async withConversationLock<T>(
    id: string,
    action: (contact: Contact, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.contactsRepo.manager.transaction(async (manager) => {
      const contact = await manager.getRepository(Contact).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!contact) throw new NotFoundException(`Contacto ${id} no encontrado`);
      return action(contact, manager);
    });
  }

  async setBotMemory(id: string, memory: string | null): Promise<Contact> {
    return this.withConversationLock(id, (contact, manager) => {
      contact.botMemory = memory?.trim().slice(0, 700) || null;
      contact.botMemoryExpiresAt = contact.botMemory
        ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        : null;
      return manager.save(contact);
    });
  }

  async appendBotMemory(id: string, memory: string): Promise<void> {
    const addition = memory.trim();
    if (!addition || addition.length > 700) return;
    await this.withConversationLock(id, async (contact, manager) => {
      const existing =
        contact.botMemoryExpiresAt && contact.botMemoryExpiresAt > new Date()
          ? (contact.botMemory?.trim() ?? '')
          : '';
      if (existing.includes(addition)) return;
      const combined = existing ? `${existing}\n${addition}` : addition;
      if (combined.length > 700) return;
      contact.botMemory = combined;
      contact.botMemoryExpiresAt = new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000,
      );
      await manager.save(contact);
    });
  }

  async purgeExpiredBotMemory(): Promise<void> {
    await this.contactsRepo.update(
      { botMemoryExpiresAt: LessThan(new Date()) },
      { botMemory: null, botMemoryExpiresAt: null },
    );
  }

  async remove(id: string): Promise<void> {
    const contact = await this.findOne(id);
    await this.contactsRepo.softRemove(contact);
  }
}
