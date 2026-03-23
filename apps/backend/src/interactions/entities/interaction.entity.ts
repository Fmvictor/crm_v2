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
  CALL = 'call',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  NOTE = 'note',
  MEETING = 'meeting',
}

export enum InteractionDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
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

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'int', nullable: true })
  durationMinutes: number | null;

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
