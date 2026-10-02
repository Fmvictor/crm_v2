/** Datos de prueba para el inbox de WhatsApp y el pipeline. */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Contact, ContactStatus } from '../contacts/entities/contact.entity';
import {
  Interaction,
  InteractionDirection,
  InteractionType,
} from '../interactions/entities/interaction.entity';
import { User, UserRole } from '../users/entities/user.entity';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: true,
  entities: [User, Contact, Interaction],
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

async function seed() {
  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const contacts = dataSource.getRepository(Contact);
  const interactions = dataSource.getRepository(Interaction);

  if (await users.findOneBy({ email: 'admin@emeb.mx' })) {
    console.log('Seed ya aplicado.');
    await dataSource.destroy();
    return;
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const agentPassword = process.env.SEED_AGENT_PASSWORD;
  if (!adminPassword || !agentPassword) {
    throw new Error(
      'Define SEED_ADMIN_PASSWORD y SEED_AGENT_PASSWORD solo en el entorno local',
    );
  }

  const [admin, agent] = await users.save([
    users.create({
      name: 'Admin Emeb',
      email: 'admin@emeb.mx',
      password: await bcrypt.hash(adminPassword, 10),
      role: UserRole.ADMIN,
      isActive: true,
    }),
    users.create({
      name: 'Agente WhatsApp',
      email: 'agente@emeb.mx',
      password: await bcrypt.hash(agentPassword, 10),
      role: UserRole.AGENT,
      isActive: true,
    }),
  ]);

  const seededContacts = await contacts.save([
    contacts.create({
      name: 'Ana García',
      phone: '+34600123456',
      status: ContactStatus.QUALIFIED,
      assignedTo: agent,
    }),
    contacts.create({
      name: 'Carlos Mendoza',
      phone: '+34600987654',
      status: ContactStatus.NEW,
      assignedTo: admin,
    }),
  ]);

  await interactions.save([
    interactions.create({
      contact: seededContacts[0],
      createdBy: agent,
      type: InteractionType.WHATSAPP,
      direction: InteractionDirection.INBOUND,
      notes: 'Hola, me gustaría recibir información.',
    }),
    interactions.create({
      contact: seededContacts[1],
      createdBy: admin,
      type: InteractionType.WHATSAPP,
      direction: InteractionDirection.OUTBOUND,
      notes: 'WhatsApp enviado (plantilla: bienvenida)',
    }),
  ]);

  console.log('Seed completado.');
  await dataSource.destroy();
}

seed().catch(async (error) => {
  console.error('Error en seed:', error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exit(1);
});
