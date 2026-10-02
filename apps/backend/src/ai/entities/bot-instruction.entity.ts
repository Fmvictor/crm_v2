import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('bot_instructions')
export class BotInstruction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer', unique: true })
  version: number;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
