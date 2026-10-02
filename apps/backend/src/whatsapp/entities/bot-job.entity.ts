import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BotJobStatus =
  | 'pending'
  | 'processing'
  | 'draft'
  | 'sent'
  | 'needs_human'
  | 'resolved'
  | 'failed';

@Entity('bot_jobs')
export class BotJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  inboundInteractionId: string;

  @Column({ type: 'uuid' })
  contactId: string;

  @Column({ type: 'varchar', length: 30 })
  phone: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: BotJobStatus;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sourceFetchedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
