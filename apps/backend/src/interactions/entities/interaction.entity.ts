import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contact } from '../../contacts/entities/contact.entity';
import { User } from '../../users/entities/user.entity';

export enum InteractionType {
  WHATSAPP = 'whatsapp',
}

export enum InteractionDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum InteractionSource {
  CUSTOMER = 'customer',
  HUMAN = 'human',
  BOT = 'bot',
  SYSTEM = 'system',
}

@Entity('interactions')
export class Interaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: InteractionType })
  type: InteractionType;

  @Column({
    type: 'enum',
    enum: InteractionDirection,
    default: InteractionDirection.OUTBOUND,
    nullable: true,
  })
  direction: InteractionDirection | null;

  @Column({ type: 'text' })
  notes: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  externalMessageId: string | null;

  @Column({ type: 'varchar', length: 16, default: InteractionSource.SYSTEM })
  source: InteractionSource;

  @Column({ type: 'timestamptz', nullable: true })
  messageTimestamp: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  deliveryStatus: string | null;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column()
  contactId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
