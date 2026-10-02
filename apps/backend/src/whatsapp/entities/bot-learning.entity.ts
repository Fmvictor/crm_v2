import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  JoinColumn,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import { Interaction } from '../../interactions/entities/interaction.entity';

export type BotLearningStatus = 'pending' | 'approved' | 'rejected';
export type BotLearningCategory = 'style' | 'process';

@Entity('bot_learnings')
export class BotLearning {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  interactionId: string;

  @OneToOne(() => Interaction)
  @JoinColumn({ name: 'interactionId' })
  interaction: Interaction;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: BotLearningStatus;

  @Column({ type: 'varchar', length: 20, default: 'style' })
  category: BotLearningCategory;

  @Column({ type: 'text', nullable: true })
  approvedText: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
