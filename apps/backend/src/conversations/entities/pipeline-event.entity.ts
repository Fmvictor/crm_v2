import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Conversation } from './conversation.entity';
import { PipelineStage } from '../../pipeline/pipeline-stage.enum';

export enum PipelineEventActor { AI = 'ai', AGENT = 'agent', SYSTEM = 'system' }

@Entity('pipeline_events')
@Index('IDX_pipeline_events_conversation_created', ['conversationId', 'createdAt'])
export class PipelineEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PipelineStage, enumName: 'pipeline_stage_enum', nullable: true })
  fromStage: PipelineStage | null;

  @Column({ type: 'enum', enum: PipelineStage, enumName: 'pipeline_stage_enum' })
  toStage: PipelineStage;

  @Column({ type: 'enum', enum: PipelineEventActor, enumName: 'pipeline_event_actor_enum' })
  actor: PipelineEventActor;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => Conversation, (conversation) => conversation.pipelineEvents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column()
  conversationId: string;

  @CreateDateColumn()
  createdAt: Date;
}
