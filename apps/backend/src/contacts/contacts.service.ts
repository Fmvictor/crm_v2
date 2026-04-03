import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
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
    const { status, source, search, page = 1, limit = 20 } = filter;

    const where: any = {};
    if (status) where.status = status;
    if (source) where.source = source;

    if (search) {
      const baseWhere = { ...where };
      
      // Intentar buscar también por teléfono limpio si la búsqueda parece un número
      const cleanSearch = search.replace(/\D/g, '');
      
      const searchConditions = [
        { ...baseWhere, name: ILike(`%${search}%`) },
        { ...baseWhere, email: ILike(`%${search}%`) },
        { ...baseWhere, phone: ILike(`%${search}%`) },
      ];
      
      if (cleanSearch.length >= 3) {
        searchConditions.push({ ...baseWhere, phone: ILike(`%${cleanSearch}%`) });
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
    return this.contactsRepo.createQueryBuilder('contact')
      .where("REPLACE(REPLACE(REPLACE(REPLACE(contact.phone, ' ', ''), '-', ''), '(', ''), ')', '') ILIKE :search", { search: `%${lastDigits}` })
      .leftJoinAndSelect('contact.assignedTo', 'assignedTo')
      .getOne();
  }

  async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.findOne(id);
    if (dto.phone) {
      dto.phone = this.normalizePhone(dto.phone);
    }
    Object.assign(contact, dto);
    return this.contactsRepo.save(contact);
  }

  async remove(id: string): Promise<void> {
    const contact = await this.findOne(id);
    await this.contactsRepo.softRemove(contact);
  }
}
