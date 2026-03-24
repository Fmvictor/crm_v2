import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import Stripe from 'stripe';
import { Contact, ContactSource, ContactStatus } from '../contacts/entities/contact.entity';
import { Course, CourseStatus } from '../courses/entities/course.entity';
import {
  Enrollment,
  EnrollmentStatus,
  PaymentStatus,
} from '../enrollments/entities/enrollment.entity';
import { AutomationsService } from '../automations/automations.service';
import { AutomationTrigger } from '../automations/entities/automation.entity';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
    @InjectRepository(Enrollment)
    private readonly enrollmentsRepo: Repository<Enrollment>,
    private readonly automationsService: AutomationsService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
    return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const paymentId = paymentIntent.id;

    // Idempotencia: si ya procesamos este pago, ignorar
    const existing = await this.enrollmentsRepo.findOne({
      where: { stripePaymentId: paymentId },
    });
    if (existing) {
      this.logger.log(`Pago ${paymentId} ya procesado, ignorando`);
      return;
    }

    const chargeList = (paymentIntent as any).charges as { data: Stripe.Charge[] } | undefined;
    const charge = chargeList?.data?.[0];
    if (!charge) {
      this.logger.warn(`PaymentIntent ${paymentId} sin charges, ignorando`);
      return;
    }

    const billing = charge.billing_details;
    const metadata = paymentIntent.metadata ?? {};

    // --- Contacto ---
    const email = billing.email ?? metadata['customer_email'];
    const name = billing.name ?? metadata['customer_name'] ?? 'Desconocido';

    let contact = email
      ? await this.contactsRepo.findOne({ where: { email } })
      : null;

    if (!contact) {
      contact = this.contactsRepo.create({
        name,
        email: email ?? null,
        phone: billing.phone ?? null,
        address: billing.address?.line1 ?? null,
        city: billing.address?.city ?? null,
        postalCode: billing.address?.postal_code ?? null,
        country: billing.address?.country ?? null,
        dni: billing.address?.line2 ?? null,
        source: ContactSource.WEB,
        status: ContactStatus.ENROLLED,
      });
      contact = await this.contactsRepo.save(contact);
      this.logger.log(`Contacto creado: ${contact.email}`);
    } else {
      // Actualizar datos si estaban vacíos
      const updates: Partial<Contact> = {};
      if (!contact.phone && billing.phone) updates.phone = billing.phone;
      if (!contact.address && billing.address?.line1) updates.address = billing.address.line1;
      if (!contact.city && billing.address?.city) updates.city = billing.address.city;
      if (!contact.postalCode && billing.address?.postal_code) updates.postalCode = billing.address.postal_code;
      if (!contact.country && billing.address?.country) updates.country = billing.address.country;
      if (!contact.dni && billing.address?.line2) updates.dni = billing.address.line2;
      if (Object.keys(updates).length > 0) {
        await this.contactsRepo.update(contact.id, updates);
      }
      this.logger.log(`Contacto existente actualizado: ${contact.email}`);
    }

    // --- Curso ---
    const rawItems = metadata['wc_items'] ?? '';
    // "CMB x1" → "CMB"
    const courseCode = rawItems.replace(/\s+x\d+$/, '').trim() || 'Sin nombre';

    let course = await this.coursesRepo.findOne({
      where: { name: ILike(`%${courseCode}%`) },
    });

    if (!course) {
      course = this.coursesRepo.create({
        name: courseCode,
        status: CourseStatus.ACTIVE,
      });
      course = await this.coursesRepo.save(course);
      this.logger.log(`Curso creado automáticamente: ${courseCode}`);
    }

    // --- Inscripción ---
    const amountPaid = paymentIntent.amount_received / 100;

    const existingEnrollment = await this.enrollmentsRepo.findOne({
      where: { contactId: contact.id, courseId: course.id },
    });

    if (existingEnrollment) {
      // Actualizar pago si ya existía la inscripción
      await this.enrollmentsRepo.update(existingEnrollment.id, {
        stripePaymentId: paymentId,
        amountPaid,
        currency: paymentIntent.currency,
        wooOrderNumber: metadata['wc_order_number'] ?? null,
        paymentStatus: PaymentStatus.PAID,
        status: EnrollmentStatus.CONFIRMED,
      });
      this.logger.log(`Inscripción actualizada: ${existingEnrollment.id}`);
    } else {
      const enrollment = this.enrollmentsRepo.create({
        contactId: contact.id,
        courseId: course.id,
        status: EnrollmentStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        amountPaid,
        amountTotal: amountPaid,
        currency: paymentIntent.currency,
        stripePaymentId: paymentId,
        wooOrderNumber: metadata['wc_order_number'] ?? null,
        enrolledAt: new Date(),
      });
      await this.enrollmentsRepo.save(enrollment);
      this.logger.log(`Inscripción creada para ${contact.email} en ${course.name}`);
    }

    // Disparar automatizaciones
    await this.automationsService.executeForTrigger(
      AutomationTrigger.PAYMENT_CAPTURED,
      { contact, course, amountPaid, currency: paymentIntent.currency },
    );
  }
}
