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

  async create(dto: CreateContactDto): Promise<Contact> {
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
      const results = await this.contactsRepo.findAndCount({
        where: [
          { ...baseWhere, name: ILike(`%${search}%`) },
          { ...baseWhere, email: ILike(`%${search}%`) },
          { ...baseWhere, phone: ILike(`%${search}%`) },
        ],
        relations: ['assignedTo'],
        skip: (page - 1) * limit,
        take: limit,
        order: { createdAt: 'DESC' },
      });
      return {
        data: results[0],
        total: results[1],
        page,
        lastPage: Math.ceil(results[1] / limit),
      };
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
    // Normalizar teléfono quitando todo lo que no sea número
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Buscar por coincidencia exacta o por los últimos digitos (comunmente 9 o 10)
    // Para ser más robustos usamos el operador LIKE con los últimos 9 dígitos
    const lastDigits = cleanPhone.slice(-9);
    
    return this.contactsRepo.findOne({
      where: { phone: ILike(`%${lastDigits}`) },
      relations: ['assignedTo'],
    });
  }

  async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.findOne(id);
    Object.assign(contact, dto);
    return this.contactsRepo.save(contact);
  }

  async remove(id: string): Promise<void> {
    const contact = await this.findOne(id);
    await this.contactsRepo.softRemove(contact);
  }
}
