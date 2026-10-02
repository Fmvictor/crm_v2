import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum KnowledgeDocumentStatus { DRAFT = 'draft', APPROVED = 'approved', ARCHIVED = 'archived' }

@Entity('knowledge_documents')
@Index('IDX_knowledge_documents_slug_version', ['slug', 'version'], { unique: true })
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  slug: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  sourceUrl: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'enum', enum: KnowledgeDocumentStatus, enumName: 'knowledge_document_status_enum', default: KnowledgeDocumentStatus.DRAFT })
  status: KnowledgeDocumentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  fetchedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastCheckedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
