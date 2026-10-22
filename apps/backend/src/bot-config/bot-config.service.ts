import {
  selectDocumentContext,
  needsSecondaryWeb,
  RetrievalConversation,
} from './document-context';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash } from 'node:crypto';
import {
  BotConfiguration,
  BotSnapshot,
  configHash,
  PROTECTED_RULES,
  topicHandoff,
  validateConfiguration,
} from './config-schema';
import { buildInstructions } from './prompt-builder';
import { DeliveryBlockedError } from '../whatsapp/whatsapp-dispatch.service';
export interface State {
  activeVersion: number;
  draftRevision: number;
  draft: BotConfiguration;
  validatedHash: string | null;
  updatedAt: string;
  updatedBy: string | null;
  restoredFrom: number | null;
}
const LOCK = 'bot-configuration-publication';
@Injectable()
export class BotConfigService {
  constructor(private readonly database: DataSource) {}
  private counter(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      throw new BadRequestException('Versión inválida.');
    return value;
  }
  private async state(manager: EntityManager, lock = false): Promise<State> {
    const rows = await manager.query<State[]>(
      `SELECT * FROM bot_config_state WHERE id=1${lock ? ' FOR UPDATE' : ''}`,
    );
    if (!rows[0])
      throw new ConflictException('Configuración pendiente de migración.');
    return rows[0];
  }
  async active(
    manager: EntityManager = this.database.manager,
  ): Promise<BotSnapshot> {
    return (
      (
        await manager.query<BotSnapshot[]>(
          `SELECT v.* FROM bot_config_versions v JOIN bot_config_state s ON s."activeVersion"=v.version WHERE s.id=1`,
        )
      )[0] ||
      Promise.reject(new ConflictException('No hay configuración activa.'))
    );
  }
  async overview() {
    return this.database.transaction('REPEATABLE READ', async (manager) => {
      const state = await this.state(manager);
      const versions = await manager.query<BotSnapshot[]>(
        'SELECT * FROM bot_config_versions ORDER BY version DESC LIMIT 100',
      );
      const active = versions.find((v) => v.version === state.activeVersion);
      if (!active) throw new ConflictException('Publicación inválida.');
      const approved = await manager.query<{ approvedText: string }[]>(
        `SELECT "approvedText" FROM bot_learnings WHERE status='approved' AND "approvedText" IS NOT NULL ORDER BY "updatedAt" DESC LIMIT 8`,
      );
      return {
        state,
        active,
        history: versions,
        approvedExamples: approved.map((e) => e.approvedText),
        activeInstructions: buildInstructions(
          active.configuration,
          '{etapa actual de la conversación}',
        ),
        draftInstructions: buildInstructions(
          state.draft,
          '{etapa actual de la conversación}',
        ),
        protectedRules: PROTECTED_RULES,
      };
    });
  }
  async save(
    input: unknown,
    revision: unknown,
    userId: string,
    restoredFrom: number | null = null,
  ) {
    const draft = validateConfiguration(input);
    const expected = this.counter(revision);
    await this.database.transaction(async (manager) => {
      const state = await this.state(manager, true);
      if (state.draftRevision !== expected)
        throw new ConflictException(
          'El borrador ha cambiado. Recarga antes de guardar.',
        );
      await manager.query(
        'UPDATE bot_config_state SET draft=$1,"draftRevision"="draftRevision"+1,"validatedHash"=NULL,"updatedBy"=$2,"updatedAt"=now(),"restoredFrom"=$3 WHERE id=1',
        [JSON.stringify(draft), userId, restoredFrom],
      );
    });
    return this.overview();
  }
  async restore(version: unknown, revision: unknown, userId: string) {
    this.counter(version);
    const rows = await this.database.query<BotSnapshot[]>(
      'SELECT * FROM bot_config_versions WHERE version=$1',
      [version],
    );
    if (!rows[0]) throw new BadRequestException('Versión no encontrada.');
    return this.save(rows[0].configuration, revision, userId, Number(version));
  }
  async validate(revision: unknown) {
    const expected = this.counter(revision);
    return this.database.transaction(async (manager) => {
      const state = await this.state(manager, true);
      if (state.draftRevision !== expected)
        throw new ConflictException('El borrador ha cambiado.');
      const configuration = validateConfiguration(state.draft);
      const hash = configHash(configuration);
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
      }).format(new Date());
      const warnings: string[] = [];
      if (
        configuration.documents.some(
          (d) => d.enabled && d.validUntil && d.validUntil < today,
        )
      )
        warnings.push('Hay documentos vencidos; no se usarán para responder.');
      if (
        !configuration.rules.webEnabled &&
        !configuration.documents.some(
          (d) => d.enabled && (!d.validUntil || d.validUntil >= today),
        )
      )
        throw new BadRequestException(
          'Activa al menos un documento vigente o la consulta web.',
        );
      await manager.query(
        'UPDATE bot_config_state SET "validatedHash"=$1 WHERE id=1',
        [hash],
      );
      return { hash, warnings, protectedRules: PROTECTED_RULES };
    });
  }
  async publish(revision: unknown, activeVersion: unknown, userId: string) {
    const expected = this.counter(revision),
      active = this.counter(activeVersion);
    return this.database.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [LOCK],
      );
      const state = await this.state(manager, true);
      if (state.draftRevision !== expected || state.activeVersion !== active)
        throw new ConflictException(
          'La configuración ha cambiado. Recarga antes de publicar.',
        );
      const draft = validateConfiguration(state.draft);
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
      }).format(new Date());
      if (
        !draft.rules.webEnabled &&
        !draft.documents.some(
          (d) => d.enabled && (!d.validUntil || d.validUntil >= today),
        )
      )
        throw new BadRequestException(
          'Activa al menos un documento vigente o la consulta web.',
        );
      if (state.validatedHash !== configHash(draft))
        throw new ConflictException(
          'Valida el borrador guardado antes de publicarlo.',
        );
      const previous = (
        await manager.query<BotSnapshot[]>(
          'SELECT * FROM bot_config_versions WHERE version=$1',
          [active],
        )
      )[0];
      const row = (
        await manager.query<{ version: number }[]>(
          'INSERT INTO bot_config_versions(configuration,hash,"createdBy","restoredFrom") VALUES ($1,$2,$3,$4) RETURNING version',
          [
            JSON.stringify(draft),
            configHash(draft),
            userId,
            state.restoredFrom,
          ],
        )
      )[0];
      await manager.query(
        'UPDATE bot_config_state SET "activeVersion"=$1,"validatedHash"=NULL,"draftRevision"="draftRevision"+1,"updatedBy"=$2,"updatedAt"=now() WHERE id=1',
        [row.version, userId],
      );
      if (
        !draft.rules.followUpsEnabled ||
        JSON.stringify(previous.configuration.rules.followUpDays) !==
          JSON.stringify(draft.rules.followUpDays)
      )
        await manager.query(
          'UPDATE conversations SET "nextFollowUpAt"=NULL WHERE "nextFollowUpAt" IS NOT NULL',
        );
      return { version: row.version };
    });
  }
  async isCurrent(version: number): Promise<boolean> {
    const row = (
      await this.database.query<{ activeVersion: number }[]>(
        'SELECT "activeVersion" FROM bot_config_state WHERE id=1',
      )
    )[0];
    return row?.activeVersion === version;
  }
  async withActiveGuard<T>(
    version: number | undefined,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
        [LOCK],
      );
      const state = await this.state(manager);
      if (version !== undefined && state.activeVersion !== version)
        throw new DeliveryBlockedError();
      return action(manager);
    });
  }
  async documentContext(
    snapshot: BotSnapshot,
    query: string,
    web: () => Promise<string>,
    conversation?: RetrievalConversation,
  ) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
    }).format(new Date());
    const docs = snapshot.configuration.documents.filter(
      (d) => d.enabled && (!d.validUntil || d.validUntil >= today),
    );
    // Presupuesto acotado: no se corta un documento a mitad ni se ocultan documentos activos.
    const sources = docs.map((d) => ({
      id: d.id,
      name: d.name,
      hash: createHash('sha256').update(d.content).digest('hex'),
    }));
    const selected = docs.map((d) => ({
      document: d,
      ...selectDocumentContext(d.content, query, conversation),
    }));
    const manual = selected
      .map((d) => `DOCUMENTO APROBADO: ${d.document.name}\n${d.content}`)
      .join('\n\n');
    const focused = selected.length > 0 && selected.every((d) => d.focused);
    let webContext =
      snapshot.configuration.rules.webEnabled &&
      needsSecondaryWeb(query, manual, focused)
        ? await web()
        : '';
    if (
      manual &&
      /no se ha podido verificar|no hay copia local|no se ha podido cargar/i.test(
        webContext,
      )
    )
      webContext = '';
    const total = `${manual ? `FUENTE PRINCIPAL: DOCUMENTOS PUBLICADOS\n${manual}\n\n` : ''}${webContext ? `FUENTE SECUNDARIA: WEB\n${webContext}` : ''}`;
    return {
      context:
        total ||
        'SISTEMA: No hay conocimiento autorizado vigente; deriva a una persona.',
      sources: [
        ...sources,
        ...(webContext
          ? [
              {
                id: 'web',
                name: 'emeb.es',
                hash: createHash('sha256').update(webContext).digest('hex'),
              },
            ]
          : []),
      ],
      handoff: topicHandoff(query, snapshot.configuration.rules),
    };
  }
}
