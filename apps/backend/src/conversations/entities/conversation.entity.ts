import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Contact } from '../../contacts/entities/contact.entity';
import { ConversationMessage } from './conversation-message.entity';
import { PipelineEvent } from './pipeline-event.entity';
import { PipelineStage } from '../../pipeline/pipeline-stage.enum';

export enum ConversationChannel { WHATSAPP = 'whatsapp' }
export enum ConversationAiMode { AUTO = 'auto', PAUSED = 'paused', HUMAN = 'human' }
export enum ConversationStatus { OPEN = 'open', CLOSED = 'closed' }

@Entity('conversations')
@Index('IDX_conversations_channel_contact_key', ['channel', 'externalContactKey'], { unique: true })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ConversationChannel, enumName: 'conversation_channel_enum', default: ConversationChannel.WHATSAPP })
  channel: ConversationChannel;

  @Column({ type: 'varchar', length: 80 })
  externalContactKey: string;

  @Column({ type: 'enum', enum: ConversationStatus, enumName: 'conversation_status_enum', default: ConversationStatus.OPEN })
  status: ConversationStatus;

  @Column({ type: 'enum', enum: ConversationAiMode, enumName: 'conversation_ai_mode_enum', default: ConversationAiMode.AUTO })
  aiMode: ConversationAiMode;

  @Column({ type: 'enum', enum: PipelineStage, enumName: 'pipeline_stage_enum', default: PipelineStage.NEW })
  pipelineStage: PipelineStage;

  @Column({ type: 'varchar', length: 10, nullable: true })
  language: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  optInAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  optOutAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastInboundAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastOutboundAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextFollowUpAt: Date | null;

  @Column({ type: 'int', default: 0 })
  followUpStep: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  handoffReason: string | null;

  @Column({ type: 'text', nullable: true })
  aiSummary: string | null;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column()
  contactId: string;

  @OneToMany(() => ConversationMessage, (message) => message.conversation)
  messages: ConversationMessage[];

  @OneToMany(() => PipelineEvent, (event) => event.conversation)
  pipelineEvents: PipelineEvent[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
