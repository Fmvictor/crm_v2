import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Contact,
  ContactSource,
  ContactStatus,
} from './entities/contact.entity';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
  ) {}

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
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

  async findOrCreateWhatsApp(phone: string): Promise<Contact> {
    const normalizedPhone = this.normalizePhone(phone);
    return this.contactsRepo.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        normalizedPhone,
      ]);
      const existing = await manager
        .createQueryBuilder(Contact, 'contact')
        .where(
          "REPLACE(REPLACE(REPLACE(REPLACE(contact.phone, ' ', ''), '-', ''), '(', ''), ')', '') = :phone",
          { phone: normalizedPhone },
        )
        .getOne();
      if (existing) return existing;
      return manager.save(
        manager.create(Contact, {
          name: `Nuevo contacto de WhatsApp (${normalizedPhone.slice(-4)})`,
          phone: normalizedPhone,
          source: ContactSource.WHATSAPP,
          status: ContactStatus.NEW,
        }),
      );
    });
  }
}
