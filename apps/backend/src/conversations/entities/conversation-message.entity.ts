import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Conversation } from './conversation.entity';

export enum ConversationMessageDirection { INBOUND = 'inbound', OUTBOUND = 'outbound' }
export enum ConversationMessageActor { LEAD = 'lead', AI = 'ai', AGENT = 'agent', SYSTEM = 'system' }

@Entity('conversation_messages')
@Index('IDX_conversation_messages_external_id', ['externalMessageId'], { unique: true })
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  externalMessageId: string | null;

  @Column({ type: 'enum', enum: ConversationMessageDirection, enumName: 'conversation_message_direction_enum' })
  direction: ConversationMessageDirection;

  @Column({ type: 'enum', enum: ConversationMessageActor, enumName: 'conversation_message_actor_enum' })
  actor: ConversationMessageActor;

  @Column({ type: 'varchar', length: 40, default: 'text' })
  messageType: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  providerTimestamp: Date | null;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column()
  conversationId: string;

  @CreateDateColumn()
  createdAt: Date;
}
