/**
 * Seed script — datos de prueba para desarrollo local.
 * Ejecutar: npx ts-node src/database/seed.ts
 * Requiere que la DB esté creada y las variables de entorno configuradas.
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Interaction } from '../interactions/entities/interaction.entity';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: true,
  entities: [User, Contact, Course, Enrollment, Interaction],
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function seed() {
  await ds.initialize();
  console.log('Conectado a la base de datos');

  // ── Usuarios ──────────────────────────────────────────────────────────────
  const userRepo = ds.getRepository(User);

  const adminExists = await userRepo.findOneBy({ email: 'admin@emeb.mx' });
  if (adminExists) {
    console.log('Seed ya aplicado (admin@emeb.mx existe). Saliendo sin cambios.');
    await ds.destroy();
    return;
  }

  const hash = (pw: string) => bcrypt.hash(pw, 10);

  const admin = userRepo.create({
    name: 'Admin Emeb',
    email: 'admin@emeb.mx',
    password: await hash('Admin1234!'),
    role: 'admin',
    isActive: true,
  });
  const agent = userRepo.create({
    name: 'Agente Ventas',
    email: 'agente@emeb.mx',
    password: await hash('Agente1234!'),
    role: 'agent',
    isActive: true,
  });
  await userRepo.save([admin, agent]);
  console.log('Usuarios creados');

  // ── Cursos ────────────────────────────────────────────────────────────────
  const courseRepo = ds.getRepository(Course);

  const courses = await courseRepo.save([
    courseRepo.create({
      name: 'Marketing Digital para Negocios',
      description: 'Aprende a posicionar tu negocio en redes sociales y buscadores.',
      category: 'Marketing',
      price: 2999.00,
      durationHours: 40,
      modality: 'online',
      status: 'active',
      maxStudents: 30,
      startDate: '2026-04-01',
      endDate: '2026-05-31',
    }),
    courseRepo.create({
      name: 'Excel Avanzado para Finanzas',
      description: 'Tablas dinámicas, macros VBA y modelos financieros.',
      category: 'Finanzas',
      price: 1999.00,
      durationHours: 24,
      modality: 'in_person',
      status: 'active',
      maxStudents: 20,
      startDate: '2026-04-15',
      endDate: '2026-05-30',
    }),
    courseRepo.create({
      name: 'Liderazgo y Gestión de Equipos',
      description: 'Habilidades directivas para mandos medios y superiores.',
      category: 'Habilidades Directivas',
      price: 3500.00,
      durationHours: 16,
      modality: 'hybrid',
      status: 'active',
      maxStudents: 15,
    }),
    courseRepo.create({
      name: 'Python para Datos',
      description: 'Introducción a Python, pandas y visualización con matplotlib.',
      category: 'Tecnología',
      price: 3999.00,
      durationHours: 60,
      modality: 'online',
      status: 'draft',
    }),
  ]);
  console.log(`${courses.length} cursos creados`);

  // ── Contactos ─────────────────────────────────────────────────────────────
  const contactRepo = ds.getRepository(Contact);

  const contacts = await contactRepo.save([
    contactRepo.create({
      name: 'Ana García López',
      email: 'ana.garcia@email.com',
      phone: '+52 55 1234 5678',
      status: 'qualified',
      source: 'web',
      assignedTo: agent,
      notes: 'Interesada en marketing digital. Trabaja en una PyME familiar.',
    }),
    contactRepo.create({
      name: 'Carlos Mendoza Ruiz',
      email: 'carlos.mendoza@empresa.mx',
      phone: '+52 33 9876 5432',
      status: 'enrolled',
      source: 'referral',
      assignedTo: agent,
      notes: 'Referido por Ana García. Gerente de finanzas.',
    }),
    contactRepo.create({
      name: 'María Torres Vega',
      email: 'maria.torres@gmail.com',
      phone: '+52 81 5555 4444',
      status: 'new',
      source: 'whatsapp',
      assignedTo: admin,
    }),
    contactRepo.create({
      name: 'Roberto Jiménez',
      email: 'roberto.j@hotmail.com',
      status: 'contacted',
      source: 'social',
      assignedTo: agent,
      notes: 'Vio el anuncio en Instagram. Emprendedor.',
    }),
    contactRepo.create({
      name: 'Laura Sánchez Mora',
      email: 'laura.sanchez@corporativo.com',
      phone: '+52 55 7777 8888',
      status: 'enrolled',
      source: 'web',
      assignedTo: agent,
      notes: 'Directora de RRHH. Interesada en inscribir a su equipo.',
    }),
    contactRepo.create({
      name: 'Diego Flores Peña',
      email: 'diego.flores@gmail.com',
      status: 'lost',
      source: 'web',
      assignedTo: agent,
      notes: 'No contestó después de 3 intentos de contacto.',
    }),
  ]);
  console.log(`${contacts.length} contactos creados`);

  // ── Inscripciones ─────────────────────────────────────────────────────────
  const enrollRepo = ds.getRepository(Enrollment);

  await enrollRepo.save([
    enrollRepo.create({
      contact: contacts[1], // Carlos → Excel Finanzas
      course: courses[1],
      status: 'active',
      paymentStatus: 'paid',
      amountTotal: 1999,
      amountPaid: 1999,
      notes: 'Pago en una sola exhibición.',
    }),
    enrollRepo.create({
      contact: contacts[4], // Laura → Liderazgo
      course: courses[2],
      status: 'confirmed',
      paymentStatus: 'partial',
      amountTotal: 3500,
      amountPaid: 1750,
      notes: 'Pago en dos partes acordado.',
    }),
    enrollRepo.create({
      contact: contacts[0], // Ana → Marketing
      course: courses[0],
      status: 'pending',
      paymentStatus: 'pending',
      amountTotal: 2999,
      amountPaid: 0,
    }),
  ]);
  console.log('Inscripciones creadas');

  // ── Interacciones ─────────────────────────────────────────────────────────
  const interRepo = ds.getRepository(Interaction);

  await interRepo.save([
    interRepo.create({
      contact: contacts[0],
      createdBy: agent,
      type: 'whatsapp',
      direction: 'inbound',
      notes: 'Ana preguntó por el inicio del curso de Marketing Digital.',
    }),
    interRepo.create({
      contact: contacts[0],
      createdBy: agent,
      type: 'call',
      direction: 'outbound',
      durationMinutes: 15,
      notes: 'Llamada para resolver dudas sobre modalidad y precio. Quedó pendiente de decidir.',
    }),
    interRepo.create({
      contact: contacts[1],
      createdBy: agent,
      type: 'email',
      direction: 'outbound',
      notes: 'Enviado contrato de inscripción y ficha de depósito bancario.',
    }),
    interRepo.create({
      contact: contacts[1],
      createdBy: agent,
      type: 'note',
      notes: 'Comprobante de pago recibido vía WhatsApp. Inscripción activada.',
    }),
    interRepo.create({
      contact: contacts[2],
      createdBy: admin,
      type: 'whatsapp',
      direction: 'inbound',
      notes: 'Primer contacto — pregunta por cursos disponibles para este semestre.',
    }),
    interRepo.create({
      contact: contacts[4],
      createdBy: agent,
      type: 'meeting',
      durationMinutes: 45,
      notes: 'Reunión con Laura para presentar propuesta grupal para su equipo de RRHH.',
    }),
  ]);
  console.log('Interacciones creadas');

  console.log('\nSeed completado.');
  console.log('Credenciales de acceso:');
  console.log('  Admin:  admin@emeb.mx  /  Admin1234!');
  console.log('  Agente: agente@emeb.mx /  Agente1234!');

  await ds.destroy();
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
