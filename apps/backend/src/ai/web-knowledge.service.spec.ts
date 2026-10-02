import { KnowledgeDocumentStatus } from '../knowledge/entities/knowledge-document.entity';
import { WebKnowledgeService } from './web-knowledge.service';

function createRepository() {
  const documents = new Map<string, any>();
  return {
    documents,
    findOne: jest.fn(
      async (options: any) => documents.get(options.where.slug) ?? null,
    ),
    create: jest.fn((document: any) => ({
      ...document,
      id: `${document.slug}-id`,
      createdAt: new Date(),
    })),
    save: jest.fn(async (document: any) => {
      documents.set(document.slug, document);
      return document;
    }),
  };
}

describe('WebKnowledgeService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('consulta la web en cada mensaje y conserva una copia local', async () => {
    const repository = createRepository();
    const fetchMock = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        text: async () => '<main>Información EMEB</main>',
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WebKnowledgeService(repository as any);

    await service.getContext('¿Qué fechas y precios hay para el curso?');
    await service.getContext('¿Qué fechas y precios hay para el curso?');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(repository.documents.size).toBe(2);
    expect(
      [...repository.documents.values()].every(
        (document) => document.status === KnowledgeDocumentStatus.APPROVED,
      ),
    ).toBe(true);
  });

  it('actualiza la misma fila solo cuando cambia la huella del contenido', async () => {
    const repository = createRepository();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<main>Precio 100</main>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<main>Precio 120</main>',
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WebKnowledgeService(repository as any);

    await (service as any).syncPage('/fechas');
    const first = repository.documents.get('emeb-web:/fechas');
    await (service as any).syncPage('/fechas');
    const second = repository.documents.get('emeb-web:/fechas');

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.documents.size).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    expect(second.content).toContain('Precio 120');
  });

  it('incluye la ficha individual cuando el lead menciona un curso concreto', async () => {
    const repository = createRepository();
    const fetchMock = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        text: async () => '<main>Precio CMB1 1.650€</main>',
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WebKnowledgeService(repository as any);

    await service.getContext('¿Cuál es el precio del CMB1?');

    expect(fetchMock.mock.calls.map(([url]) => url as string)).toEqual(
      expect.arrayContaining(['https://www.emeb.es/cursos/cmb1']),
    );
  });

  it('usa la última copia válida si la web no responde', async () => {
    const repository = createRepository();
    const now = new Date();
    repository.documents.set('emeb-web:/fechas', {
      id: 'fechas-id',
      slug: 'emeb-web:/fechas',
      version: 1,
      status: KnowledgeDocumentStatus.APPROVED,
      content: 'FUENTE: https://www.emeb.es/fechas\nPrecio y fechas guardados',
      contentHash: 'hash',
      fetchedAt: now,
      lastCheckedAt: now,
      createdAt: now,
    });
    repository.documents.set('emeb-web:/cursos-profesionales', {
      id: 'cursos-id',
      slug: 'emeb-web:/cursos-profesionales',
      version: 1,
      status: KnowledgeDocumentStatus.APPROVED,
      content:
        'FUENTE: https://www.emeb.es/cursos-profesionales\nCursos guardados',
      contentHash: 'hash2',
      fetchedAt: now,
      lastCheckedAt: now,
      createdAt: now,
    });
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;

    const context = await new WebKnowledgeService(repository as any).getContext(
      '¿Qué fechas hay?',
    );

    expect(context).toContain('Precio y fechas guardados');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(context).toContain('No se ha podido verificar ahora mismo');
  });
});
