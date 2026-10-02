import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('bot_control')
export class BotControl {
  @PrimaryColumn({ type: 'integer' })
  id: number;

  @Column({ type: 'boolean', default: true })
  paused: boolean;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
