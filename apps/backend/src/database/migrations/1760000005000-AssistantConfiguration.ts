import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  defaultConfiguration,
  configHash,
} from '../../bot-config/config-schema';
export class AssistantConfiguration1760000005000 implements MigrationInterface {
  name = 'AssistantConfiguration1760000005000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE TABLE bot_config_versions(version serial PRIMARY KEY,configuration jsonb NOT NULL,hash varchar(64) NOT NULL,"createdBy" uuid REFERENCES users(id) ON DELETE SET NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),"restoredFrom" integer REFERENCES bot_config_versions(version))`,
    );
    await runner.query(
      `CREATE TABLE bot_config_state(id integer PRIMARY KEY CHECK(id=1),"activeVersion" integer NOT NULL REFERENCES bot_config_versions(version),"draftRevision" integer NOT NULL DEFAULT 0,draft jsonb NOT NULL,"validatedHash" varchar(64),"updatedBy" uuid REFERENCES users(id) ON DELETE SET NULL,"restoredFrom" integer REFERENCES bot_config_versions(version),"updatedAt" timestamptz NOT NULL DEFAULT now())`,
    );
    await runner.query(
      `CREATE TABLE bot_config_usage_refs("callId" uuid PRIMARY KEY REFERENCES ai_usage_calls(id) ON DELETE CASCADE,"configVersion" integer REFERENCES bot_config_versions(version),"draftHash" varchar(64),"draftRevision" integer,sources jsonb NOT NULL)`,
    );
    const configuration = defaultConfiguration();
    const instructions = (await runner.query(
      'SELECT text FROM bot_instructions ORDER BY version DESC LIMIT 1',
    )) as { text: string }[];
    if (instructions[0])
      configuration.assistant += `\n# Instrucciones adicionales vigentes\n${instructions[0].text}`;
    const examples = (await runner.query(
      `SELECT "approvedText" FROM bot_learnings WHERE status='approved' AND "approvedText" IS NOT NULL ORDER BY "updatedAt" DESC LIMIT 8`,
    )) as { approvedText: string }[];
    configuration.examples = examples.map((e) => e.approvedText);
    const rows = (await runner.query(
      'INSERT INTO bot_config_versions(configuration,hash) VALUES ($1,$2) RETURNING version',
      [JSON.stringify(configuration), configHash(configuration)],
    )) as { version: number }[];
    await runner.query(
      'INSERT INTO bot_config_state(id,"activeVersion",draft) VALUES (1,$1,$2)',
      [rows[0].version, JSON.stringify(configuration)],
    );
  }
  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Conservar las publicaciones y referencias del asistente; revertir sólo el código.',
      ),
    );
  }
}
