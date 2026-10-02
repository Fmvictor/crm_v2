import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  KnowledgeDocument,
  KnowledgeDocumentStatus,
} from '../knowledge/entities/knowledge-document.entity';

interface PageDefinition {
  path: string;
  refreshMs: number;
}

@Injectable()
export class WebKnowledgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebKnowledgeService.name);
  // Las páginas públicas de EMEB tardan alrededor de seis segundos en el VPS;
  // dejamos margen sin usar este límite en cada conversación.
  private readonly requestTimeoutMs = 20_000;
  private readonly schedulerIntervalMs = 15 * 60_000;
  private readonly pages: PageDefinition[] = [
    // Fechas y oferta comercial cambian con más frecuencia.
    { path: '/cursos-profesionales', refreshMs: 48 * 60 * 60_000 },
    { path: '/fechas', refreshMs: 48 * 60 * 60_000 },
    // Información general: se comprueba semanalmente.
    { path: '/metodo', refreshMs: 7 * 24 * 60 * 60_000 },
    { path: '/alojamientos', refreshMs: 7 * 24 * 60 * 60_000 },
    { path: '/contacto', refreshMs: 7 * 24 * 60 * 60_000 },
    // Las fichas individuales contienen precios y condiciones del curso.
    { path: '/cursos/bikefitting', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/cmb-2-2', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/cmb-online', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/cmb1', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/constructor-de-ruedas', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/formacion-a-medida', refreshMs: 48 * 60 * 60_000 },
    {
      path: '/cursos/libro-mecanica-de-bicicletas',
      refreshMs: 48 * 60 * 60_000,
    },
    { path: '/cursos/mecanica-1', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/mecanica-2', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/mecanica-3', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/motores-de-ebike', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/tecnico-en-suspensiones', refreshMs: 48 * 60 * 60_000 },
    {
      path: '/cursos/tecnico-en-suspensiones-1-y-2',
      refreshMs: 48 * 60 * 60_000,
    },
    {
      path: '/cursos/tecnico-en-suspensiones-pack',
      refreshMs: 48 * 60 * 60_000,
    },
    { path: '/cursos/tecnico-en-suspensiones2', refreshMs: 48 * 60 * 60_000 },
    { path: '/cursos/transmisiones-electronicas', refreshMs: 48 * 60 * 60_000 },
  ];
  private scheduler?: NodeJS.Timeout;

  constructor(
    @InjectRepository(KnowledgeDocument)
    private readonly knowledgeRepo: Repository<KnowledgeDocument>,
  ) {}

  onModuleInit(): void {
    // No bloquea el arranque del backend. La primera sincronización se hace en
    // segundo plano y respeta las copias locales existentes.
    void this.syncDueDocuments();
    this.scheduler = setInterval(
      () => void this.syncDueDocuments(),
      this.schedulerIntervalMs,
    );
    this.scheduler.unref?.();
  }

  onModuleDestroy(): void {
    if (this.scheduler) clearInterval(this.scheduler);
  }

  async getContext(query: string): Promise<string> {
    const paths = this.selectPaths(query);
    // Cada respuesta consulta las páginas relevantes de emeb.es. La copia local
    // solo permite derivar con seguridad si la web no está disponible.
    const fetchedDocuments = await Promise.all(
      paths.map((path) => this.syncPage(path)),
    );
    const fallbackDocuments = await Promise.all(
      fetchedDocuments.map((document, index) =>
        document
          ? Promise.resolve(document)
          : this.getLocalDocument(paths[index]),
      ),
    );
    const available = fallbackDocuments.filter(
      (document): document is KnowledgeDocument => Boolean(document),
    );
    const unavailablePaths = paths.filter(
      (_, index) => !fetchedDocuments[index],
    );

    const context = available.length
      ? available.map((document) => document.content).join('\n\n')
      : 'SISTEMA: No se ha podido cargar ninguna copia local de la información de EMEB.';
    const warnings: string[] = [];
    if (unavailablePaths.length > 0) {
      warnings.push(
        `SISTEMA: No se ha podido verificar ahora mismo ${unavailablePaths.join(', ')} en emeb.es. No confirmes fechas, precios ni plazas; deriva a una persona.`,
      );
    }
    return `${context}${warnings.length ? `\n\n${warnings.join('\n')}` : ''}`.slice(
      0,
      26_000,
    );
  }

  private selectPaths(query: string): string[] {
    const normalized = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const paths = new Set<string>();
    const asksAboutDatesOrPrice =
      /fecha|plaza|inicio|cuando|precio|coste|cuanto|tarifa|importe|curso/.test(
        normalized,
      );
    const asksAboutLodging = /aloj|hotel|dormir|estancia/.test(normalized);
    const asksAboutMethod = /metod|practica|certific|contenido|temario/.test(
      normalized,
    );
    const asksForContact = /persona|humano|llamad|contact|telefono|hablar/.test(
      normalized,
    );
    const coursePath = this.selectCoursePath(normalized);

    if (coursePath) paths.add(coursePath);

    if (asksAboutDatesOrPrice) {
      if (!coursePath) paths.add('/cursos-profesionales');
      paths.add('/fechas');
    } else if (asksAboutLodging) {
      if (!coursePath) paths.add('/cursos-profesionales');
      paths.add('/alojamientos');
    } else if (asksAboutMethod) {
      if (!coursePath) paths.add('/cursos-profesionales');
      paths.add('/metodo');
    } else if (!coursePath) {
      paths.add('/cursos-profesionales');
      paths.add('/metodo');
    }
    if (asksForContact) paths.add('/contacto');
    return [...paths];
  }

  private selectCoursePath(normalizedQuery: string): string | null {
    if (/cmb\s*(?:1\s*)?online|online\s+cmb/.test(normalizedQuery))
      return '/cursos/cmb-online';
    if (/cmb\s*1|cmb1/.test(normalizedQuery)) return '/cursos/cmb1';
    if (/cmb\s*2|cmb2/.test(normalizedQuery)) return '/cursos/cmb-2-2';
    if (/bikefitting/.test(normalizedQuery)) return '/cursos/bikefitting';
    if (/constructor.*rued|rued/.test(normalizedQuery))
      return '/cursos/constructor-de-ruedas';
    if (/mecanica\s*1|mecanica 1/.test(normalizedQuery))
      return '/cursos/mecanica-1';
    if (/mecanica\s*2|mecanica 2/.test(normalizedQuery))
      return '/cursos/mecanica-2';
    if (/mecanica\s*3|mecanica 3/.test(normalizedQuery))
      return '/cursos/mecanica-3';
    if (/motor.*ebike|ebike.*motor/.test(normalizedQuery))
      return '/cursos/motores-de-ebike';
    if (/suspension/.test(normalizedQuery))
      return '/cursos/tecnico-en-suspensiones';
    if (/transmision.*electron/.test(normalizedQuery))
      return '/cursos/transmisiones-electronicas';
    return null;
  }

  private async getLocalDocument(
    path: string,
  ): Promise<KnowledgeDocument | null> {
    try {
      return await this.knowledgeRepo.findOne({
        where: {
          slug: this.slugFor(path),
          status: KnowledgeDocumentStatus.APPROVED,
        },
        order: { version: 'DESC' },
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo leer la copia local de ${path}: ${this.errorMessage(error)}`,
      );
      return null;
    }
  }

  private async syncDueDocuments(): Promise<void> {
    // La web pública puede responder 503 si recibe muchas fichas a la vez.
    // La sincronización es de fondo, por lo que priorizamos fiabilidad.
    for (const page of this.pages) {
      const document = await this.getLocalDocument(page.path);
      if (!document || this.isDue(document)) await this.syncPage(page.path);
    }
  }

  private async syncPage(path: string): Promise<KnowledgeDocument | null> {
    const definition = this.pages.find((page) => page.path === path);
    if (!definition) return null;

    try {
      const response = await fetch(`https://www.emeb.es${definition.path}`, {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const plainText = this.toPlainText(html);
      if (!plainText) throw new Error('página vacía');

      const content = `FUENTE: https://www.emeb.es${definition.path}\n${plainText}`;
      const contentHash = createHash('sha256').update(content).digest('hex');
      const slug = this.slugFor(path);
      const existing = await this.knowledgeRepo.findOne({
        where: { slug },
        order: { version: 'DESC' },
      });
      const checkedAt = new Date();

      if (existing && existing.contentHash === contentHash) {
        existing.lastCheckedAt = checkedAt;
        return this.knowledgeRepo.save(existing);
      }

      const document =
        existing ??
        this.knowledgeRepo.create({
          slug,
          title: `EMEB ${path.replace(/^\//, '')}`,
          sourceUrl: `https://www.emeb.es${path}`,
          content: '',
          version: 0,
          status: KnowledgeDocumentStatus.APPROVED,
          fetchedAt: null,
          approvedAt: null,
          contentHash: null,
          lastCheckedAt: null,
        });
      document.content = content;
      document.contentHash = contentHash;
      document.version = (document.version || 0) + 1;
      document.status = KnowledgeDocumentStatus.APPROVED;
      document.fetchedAt = checkedAt;
      document.approvedAt = checkedAt;
      document.lastCheckedAt = checkedAt;
      const saved = await this.knowledgeRepo.save(document);
      this.logger.log(
        `${existing ? 'Actualizada' : 'Creada'} copia local de ${path} (versión ${saved.version})`,
      );
      return saved;
    } catch (error) {
      this.logger.warn(
        `No se pudo actualizar ${path}; se conserva la última copia válida: ${this.errorMessage(error)}`,
      );
      return null;
    }
  }

  private isDue(document: KnowledgeDocument): boolean {
    const path = document.slug.replace(/^emeb-web:/, '');
    const definition = this.pages.find((page) => page.path === path);
    if (!definition) return true;
    const lastCheckedAt =
      document.lastCheckedAt ?? document.fetchedAt ?? document.createdAt;
    return (
      !lastCheckedAt ||
      Date.now() - lastCheckedAt.getTime() >= definition.refreshMs
    );
  }

  private slugFor(path: string): string {
    return `emeb-web:${path}`;
  }

  private toPlainText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24_000);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
