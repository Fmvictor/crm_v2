import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BotLearningStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('bot_learnings')
export class BotLearning {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  interactionId: string;

  @Column({ type: 'varchar', length: 20, default: BotLearningStatus.PENDING })
  status: BotLearningStatus;

  @Column({ type: 'varchar', length: 20, default: 'style' })
  category: string;

  @Column({ type: 'text', nullable: true })
  approvedText: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
