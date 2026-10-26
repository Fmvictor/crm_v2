import { MigrationInterface, QueryRunner } from 'typeorm';
import { openAttention } from '../../conversations/attention-store';

export class BotPipeline1760000007000 implements MigrationInterface {
  name = 'BotPipeline1760000007000';

  async up(runner: QueryRunner): Promise<void> {
    // Se mantienen los valores del enum y todos los eventos históricos.
    const rows = (await runner.query(
      `SELECT id, "pipelineStage" FROM conversations WHERE "pipelineStage" IN
       ('call_scheduled','call_done','offer_sent','deposit_requested','deposit_paid','nurture') FOR UPDATE`,
    )) as { id: string; pipelineStage: string }[];
    for (const row of rows) {
      await runner.query(
        `INSERT INTO pipeline_events ("conversationId", "fromStage", "toStage", actor, reason, metadata)
         VALUES ($1,$2::text::pipeline_stage_enum,'contacted','system','Adaptación del pipeline; revisar etapa anterior',
         jsonb_build_object('action','pipeline_simplification','previousStage',$2::text))`,
        [row.id, row.pipelineStage],
      );
      await runner.query(
        `UPDATE conversations SET "pipelineStage"='contacted' WHERE id=$1`,
        [row.id],
      );
      await openAttention(
        runner.manager,
        row.id,
        'pipeline-simplification-20261026',
        `Revisar etapa anterior: ${row.pipelineStage}. Se conserva en el historial; no se deduce matrícula.`,
      );
    }
    await runner.query(`UPDATE contacts SET "pipelineStage"='contacted' WHERE "pipelineStage" IN
      ('call_scheduled','call_done','offer_sent','deposit_requested','deposit_paid','nurture')`);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Conservar historial y revisión humana. Revertir código, sin deshacer decisiones posteriores.',
      ),
    );
  }
}
