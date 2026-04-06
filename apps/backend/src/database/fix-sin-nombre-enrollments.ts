/**
 * Script: fix-sin-nombre-enrollments.ts
 *
 * Consulta Stripe para los pagos vinculados al curso "Sin nombre",
 * intenta hacer match con un curso existente usando la metadata wc_items,
 * y actualiza la inscripción al curso correcto.
 *
 * Ejecutar en el servidor:
 *   npx ts-node src/database/fix-sin-nombre-enrollments.ts
 */

import 'dotenv/config';
import { DataSource, ILike } from 'typeorm';
import Stripe from 'stripe';
import { Contact } from '../contacts/entities/contact.entity';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Interaction } from '../interactions/entities/interaction.entity';
import { User } from '../users/entities/user.entity';
import { Automation } from '../automations/entities/automation.entity';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  entities: [User, Contact, Course, Enrollment, Interaction, Automation],
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function main() {
  await ds.initialize();
  console.log('✅ Conectado a la base de datos');

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
  const enrollmentsRepo = ds.getRepository(Enrollment);
  const coursesRepo = ds.getRepository(Course);

  // 1. Obtener inscripciones con Stripe ID vinculadas a "Sin nombre"
  const sinNombreEnrollments = await enrollmentsRepo
    .createQueryBuilder('e')
    .innerJoin('e.course', 'c')
    .innerJoin('e.contact', 'ct')
    .addSelect(['c.id', 'c.name', 'ct.name', 'ct.email'])
    .where('c.name = :name', { name: 'Sin nombre' })
    .andWhere('e.stripePaymentId IS NOT NULL')
    .getMany();

  if (sinNombreEnrollments.length === 0) {
    console.log('ℹ️  No hay inscripciones "Sin nombre" con Stripe ID. Nada que hacer.');
    await ds.destroy();
    return;
  }

  console.log(`\n🔍 Encontradas ${sinNombreEnrollments.length} inscripciones "Sin nombre" con Stripe ID:\n`);

  for (const enrollment of sinNombreEnrollments) {
    const paymentId = enrollment.stripePaymentId!;
    console.log(`\n--- Payment Intent: ${paymentId} ---`);

    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(paymentId, {
        expand: ['charges'],
      });
    } catch (err) {
      console.log(`  ⚠️  Error al consultar Stripe: ${(err as Error).message}`);
      continue;
    }

    const metadata = pi.metadata ?? {};
    console.log('  Metadata:', JSON.stringify(metadata, null, 2));

    const rawItems = metadata['wc_items'] ?? '';
    const courseCode = rawItems.replace(/\s+x\d+$/, '').trim();

    if (!courseCode) {
      console.log('  ℹ️  wc_items vacío, no se puede determinar el curso.');
      continue;
    }

    console.log(`  📦 wc_items: "${courseCode}"`);

    // Buscar curso existente por nombre similar
    const matchedCourse = await coursesRepo.findOne({
      where: { name: ILike(`%${courseCode}%`) },
    });

    if (!matchedCourse) {
      console.log(`  ❌ No se encontró ningún curso que coincida con "${courseCode}".`);
      continue;
    }

    console.log(`  ✅ Curso encontrado: "${matchedCourse.name}" (${matchedCourse.id})`);

    if (matchedCourse.name === 'Sin nombre') {
      console.log('  ⏭️  El curso encontrado también es "Sin nombre", saltando.');
      continue;
    }

    // Actualizar el courseId de la inscripción
    await enrollmentsRepo.update(enrollment.id, { courseId: matchedCourse.id });
    console.log(`  🔗 Inscripción ${enrollment.id} actualizada → curso "${matchedCourse.name}"`);
  }

  console.log('\n✅ Script finalizado.');
  await ds.destroy();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
