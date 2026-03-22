import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Enrollment,
  EnrollmentStatus,
  PaymentStatus,
} from './entities/enrollment.entity';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { FilterEnrollmentDto } from './dto/filter-enrollment.dto';
import { PaginatedResult } from '../contacts/contacts.service';
import { User } from '../users/entities/user.entity';
import { ContactsService } from '../contacts/contacts.service';
import { ContactStatus } from '../contacts/entities/contact.entity';

// Transiciones de estado permitidas
const ALLOWED_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  [EnrollmentStatus.PENDING]: [
    EnrollmentStatus.CONFIRMED,
    EnrollmentStatus.CANCELLED,
  ],
  [EnrollmentStatus.CONFIRMED]: [
    EnrollmentStatus.ACTIVE,
    EnrollmentStatus.CANCELLED,
  ],
  [EnrollmentStatus.ACTIVE]: [
    EnrollmentStatus.COMPLETED,
    EnrollmentStatus.CANCELLED,
  ],
  [EnrollmentStatus.COMPLETED]: [],
  [EnrollmentStatus.CANCELLED]: [],
};

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollmentsRepo: Repository<Enrollment>,
    private readonly contactsService: ContactsService,
  ) {}

  async create(dto: CreateEnrollmentDto, actor: User): Promise<Enrollment> {
    const existing = await this.enrollmentsRepo.findOne({
      where: { contactId: dto.contactId, courseId: dto.courseId },
    });
    if (existing) {
      throw new ConflictException(
        'Este contacto ya está inscrito en ese curso',
      );
    }

    const enrollment = this.enrollmentsRepo.create({
      ...dto,
      createdById: actor.id,
    });

    const saved = await this.enrollmentsRepo.save(enrollment);

    // Actualizar estado del contacto a 'enrolled' si se confirma directamente
    if (
      saved.status === EnrollmentStatus.CONFIRMED ||
      saved.status === EnrollmentStatus.ACTIVE
    ) {
      await this.contactsService.update(dto.contactId, {
        status: ContactStatus.ENROLLED,
      });
    }

    return saved;
  }

  async findAll(
    filter: FilterEnrollmentDto,
  ): Promise<PaginatedResult<Enrollment>> {
    const { contactId, courseId, status, paymentStatus, page = 1, limit = 20 } =
      filter;
    const where: any = {};
    if (contactId) where.contactId = contactId;
    if (courseId) where.courseId = courseId;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    const [data, total] = await this.enrollmentsRepo.findAndCount({
      where,
      relations: ['contact', 'course', 'createdBy'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, lastPage: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Enrollment> {
    const enrollment = await this.enrollmentsRepo.findOne({
      where: { id },
      relations: ['contact', 'course', 'createdBy'],
    });
    if (!enrollment)
      throw new NotFoundException(`Inscripción ${id} no encontrada`);
    return enrollment;
  }

  async update(id: string, dto: UpdateEnrollmentDto): Promise<Enrollment> {
    const enrollment = await this.findOne(id);

    // Validar transición de estado
    if (dto.status && dto.status !== enrollment.status) {
      const allowed = ALLOWED_TRANSITIONS[enrollment.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `No se puede pasar de '${enrollment.status}' a '${dto.status}'`,
        );
      }

      // Marcar fechas automáticas
      if (dto.status === EnrollmentStatus.COMPLETED && !dto.completedAt) {
        dto.completedAt = new Date();
      }

      // Sincronizar estado del contacto
      if (dto.status === EnrollmentStatus.COMPLETED) {
        await this.contactsService.update(enrollment.contactId, {
          status: ContactStatus.ENROLLED,
        });
      }
    }

    // Calcular paymentStatus automáticamente si se actualizan montos
    const amountPaid = dto.amountPaid ?? enrollment.amountPaid ?? 0;
    const amountTotal = dto.amountTotal ?? enrollment.amountTotal;
    if (amountTotal) {
      if (amountPaid >= amountTotal) {
        dto.paymentStatus = PaymentStatus.PAID;
      } else if (amountPaid > 0) {
        dto.paymentStatus = PaymentStatus.PARTIAL;
      }
    }

    Object.assign(enrollment, dto);
    return this.enrollmentsRepo.save(enrollment);
  }

  async remove(id: string): Promise<void> {
    const enrollment = await this.findOne(id);
    if (
      enrollment.status === EnrollmentStatus.ACTIVE ||
      enrollment.status === EnrollmentStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'No se puede eliminar una inscripción activa o completada. Usa cancelar.',
      );
    }
    await this.enrollmentsRepo.remove(enrollment);
  }

  async getStats(courseId?: string) {
    const qb = this.enrollmentsRepo
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(e.amountPaid)', 'totalCollected');

    if (courseId) qb.where('e.courseId = :courseId', { courseId });

    const byStatus = await qb.groupBy('e.status').getRawMany();

    const paymentQb = this.enrollmentsRepo
      .createQueryBuilder('e')
      .select('e.paymentStatus', 'paymentStatus')
      .addSelect('COUNT(*)', 'count');

    if (courseId) paymentQb.where('e.courseId = :courseId', { courseId });

    const byPayment = await paymentQb.groupBy('e.paymentStatus').getRawMany();

    return { byStatus, byPayment };
  }
}
