import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationLifecycle1760000006000 implements MigrationInterface {
  name = 'ConversationLifecycle1760000006000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS "lifecycleVersion" integer NOT NULL DEFAULT 0',
    );
    await runner.query(
      'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS "aiActivatedAt" timestamptz',
    );
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error('Conservar el historial de cierres; revertir sólo el código.'),
    );
  }
}
