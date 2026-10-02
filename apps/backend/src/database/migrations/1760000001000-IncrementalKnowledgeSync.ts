import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncrementalKnowledgeSync1760000001000 implements MigrationInterface {
  name = 'IncrementalKnowledgeSync1760000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "knowledge_documents" ADD COLUMN IF NOT EXISTS "contentHash" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "knowledge_documents" ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP WITH TIME ZONE`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "knowledge_documents" DROP COLUMN IF EXISTS "lastCheckedAt"`);
    await queryRunner.query(`ALTER TABLE "knowledge_documents" DROP COLUMN IF EXISTS "contentHash"`);
  }
}
