/**
 * Seed script — datos de prueba para desarrollo local.
 * Ejecutar: npx ts-node src/database/seed.ts
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
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

const mk = <T>(cls: new () => T, data: Partial<T>): T => Object.assign(new cls(), data);

async function seed() {
  await ds.initialize();
  console.log('Conectado a la base de datos');

  const userRepo    = ds.getRepository(User);
  const courseRepo  = ds.getRepository(Course);
  const contactRepo = ds.getRepository(Contact);
  const enrollRepo  = ds.getRepository(Enrollment);
  const interRepo   = ds.getRepository(Interaction);

  const adminExists = await userRepo.findOneBy({ email: 'admin@emeb.mx' });
  if (adminExists) {
    console.log('Seed ya aplicado. Saliendo sin cambios.');
    await ds.destroy();
    return;
  }

  const hash = (pw: string) => bcrypt.hash(pw, 10);

  // ── Usuarios ──────────────────────────────────────────────────────────────
  const [admin, agent] = await userRepo.save([
    mk(User, { name: 'Admin Emeb',    email: 'admin@emeb.mx',   password: await hash('Admin1234!'),  role: UserRole.ADMIN,  isActive: true }),
    mk(User, { name: 'Agente Ventas', email: 'agente@emeb.mx',  password: await hash('Agente1234!'), role: UserRole.AGENT,  isActive: true }),
  ]);
  console.log('Usuarios creados');

  // ── Cursos ────────────────────────────────────────────────────────────────
  const courses = await courseRepo.save([
    mk(Course, { name: 'Marketing Digital para Negocios', description: 'Aprende a posicionar tu negocio en redes sociales y buscadores.', category: 'Marketing',             price: 2999, durationHours: 40, modality: 'online'    as any, status: 'active' as any, maxStudents: 30, startDate: new Date('2026-04-01'), endDate: new Date('2026-05-31') }),
    mk(Course, { name: 'Excel Avanzado para Finanzas',    description: 'Tablas dinámicas, macros VBA y modelos financieros.',              category: 'Finanzas',             price: 1999, durationHours: 24, modality: 'in_person' as any, status: 'active' as any, maxStudents: 20, startDate: new Date('2026-04-15'), endDate: new Date('2026-05-30') }),
    mk(Course, { name: 'Liderazgo y Gestión de Equipos', description: 'Habilidades directivas para mandos medios y superiores.',          category: 'Habilidades Directivas', price: 3500, durationHours: 16, modality: 'hybrid'    as any, status: 'active' as any, maxStudents: 15 }),
    mk(Course, { name: 'Python para Datos',               description: 'Introducción a Python, pandas y visualización con matplotlib.',    category: 'Tecnología',            price: 3999, durationHours: 60, modality: 'online'    as any, status: 'draft'  as any }),
  ]);
  console.log(`${courses.length} cursos creados`);

  // ── Contactos ─────────────────────────────────────────────────────────────
  const contacts = await contactRepo.save([
    mk(Contact, { name: 'Ana García López',    email: 'ana.garcia@email.com',       phone: '+52 55 1234 5678', status: 'qualified' as any, source: 'web'      as any, assignedTo: agent, notes: 'Interesada en marketing digital. Trabaja en una PyME familiar.' }),
    mk(Contact, { name: 'Carlos Mendoza Ruiz', email: 'carlos.mendoza@empresa.mx',  phone: '+52 33 9876 5432', status: 'enrolled'  as any, source: 'referral' as any, assignedTo: agent, notes: 'Referido por Ana García. Gerente de finanzas.' }),
    mk(Contact, { name: 'María Torres Vega',   email: 'maria.torres@gmail.com',     phone: '+52 81 5555 4444', status: 'new'       as any, source: 'whatsapp' as any, assignedTo: admin }),
    mk(Contact, { name: 'Roberto Jiménez',     email: 'roberto.j@hotmail.com',                                 status: 'contacted' as any, source: 'social'   as any, assignedTo: agent, notes: 'Vio el anuncio en Instagram. Emprendedor.' }),
    mk(Contact, { name: 'Laura Sánchez Mora',  email: 'laura.sanchez@corporativo.com', phone: '+52 55 7777 8888', status: 'enrolled' as any, source: 'web'    as any, assignedTo: agent, notes: 'Directora de RRHH. Interesada en inscribir a su equipo.' }),
    mk(Contact, { name: 'Diego Flores Peña',   email: 'diego.flores@gmail.com',                                status: 'lost'      as any, source: 'web'      as any, assignedTo: agent, notes: 'No contestó después de 3 intentos de contacto.' }),
  ]);
  console.log(`${contacts.length} contactos creados`);

  // ── Inscripciones ─────────────────────────────────────────────────────────
  await enrollRepo.save([
    mk(Enrollment, { contact: contacts[1], course: courses[1], status: 'active'    as any, paymentStatus: 'paid'    as any, amountTotal: 1999, amountPaid: 1999, notes: 'Pago en una sola exhibición.' }),
    mk(Enrollment, { contact: contacts[4], course: courses[2], status: 'confirmed' as any, paymentStatus: 'partial' as any, amountTotal: 3500, amountPaid: 1750, notes: 'Pago en dos partes acordado.' }),
    mk(Enrollment, { contact: contacts[0], course: courses[0], status: 'pending'   as any, paymentStatus: 'pending' as any, amountTotal: 2999, amountPaid: 0 }),
  ]);
  console.log('Inscripciones creadas');

  // ── Interacciones ─────────────────────────────────────────────────────────
  await interRepo.save([
    mk(Interaction, { contact: contacts[0], createdBy: agent, type: 'whatsapp' as any, direction: 'inbound'  as any, notes: 'Ana preguntó por el inicio del curso de Marketing Digital.' }),
    mk(Interaction, { contact: contacts[0], createdBy: agent, type: 'call'     as any, direction: 'outbound' as any, durationMinutes: 15, notes: 'Llamada para resolver dudas sobre modalidad y precio.' }),
    mk(Interaction, { contact: contacts[1], createdBy: agent, type: 'email'    as any, direction: 'outbound' as any, notes: 'Enviado contrato de inscripción y ficha de depósito.' }),
    mk(Interaction, { contact: contacts[1], createdBy: agent, type: 'note'     as any, notes: 'Comprobante de pago recibido vía WhatsApp. Inscripción activada.' }),
    mk(Interaction, { contact: contacts[2], createdBy: admin, type: 'whatsapp' as any, direction: 'inbound'  as any, notes: 'Primer contacto — pregunta por cursos disponibles.' }),
    mk(Interaction, { contact: contacts[4], createdBy: agent, type: 'meeting'  as any, durationMinutes: 45,  notes: 'Reunión para presentar propuesta grupal para su equipo de RRHH.' }),
  ]);
  console.log('Interacciones creadas');

  console.log('\nSeed completado.');
  console.log('  Admin:  admin@emeb.mx  /  Admin1234!');
  console.log('  Agente: agente@emeb.mx /  Agente1234!');

  await ds.destroy();
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
