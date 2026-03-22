import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ContactStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  ENROLLED = 'enrolled',
  LOST = 'lost',
}

export enum ContactSource {
  WHATSAPP = 'whatsapp',
  WEB = 'web',
  REFERRAL = 'referral',
  SOCIAL = 'social',
  OTHER = 'other',
}

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ unique: true, length: 150, nullable: true })
  email: string | null;

  @Column({ length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: ContactStatus, default: ContactStatus.NEW })
  status: ContactStatus;

  @Column({ type: 'enum', enum: ContactSource, default: ContactSource.OTHER })
  source: ContactSource;

  @Column({ length: 200, nullable: true })
  courseInterest: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'assignedToId' })
  assignedTo: User | null;

  @Column({ nullable: true })
  assignedToId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
