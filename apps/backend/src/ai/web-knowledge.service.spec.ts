import { Repository } from 'typeorm';
import {
  KnowledgeDocument,
  KnowledgeDocumentStatus,
} from '../knowledge/entities/knowledge-document.entity';
import { WebKnowledgeService } from './web-knowledge.service';

function createRepository() {
  const documents = new Map<string, KnowledgeDocument>();
  return {
    documents,
    findOne: jest.fn((options: { where: { slug: string } }) =>
      Promise.resolve(documents.get(options.where.slug) ?? null),
    ),
    create: jest.fn((document: Partial<KnowledgeDocument>) =>
      Object.assign(new KnowledgeDocument(), document, {
        id: `${document.slug}-id`,
        createdAt: new Date(),
      }),
    ),
    save: jest.fn((document: KnowledgeDocument) => {
      documents.set(document.slug, document);
      return Promise.resolve(document);
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
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<main>Información EMEB</main>'),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WebKnowledgeService(
      repository as unknown as Repository<KnowledgeDocument>,
    );

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
        text: () => Promise.resolve('<main>Precio 100</main>'),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('<main>Precio 120</main>'),
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WebKnowledgeService(
      repository as unknown as Repository<KnowledgeDocument>,
    );

    await (
      service as unknown as {
        syncPage(path: string): Promise<KnowledgeDocument | null>;
      }
    ).syncPage('/fechas');
    const first = repository.documents.get('emeb-web:/fechas');
    await (
      service as unknown as {
        syncPage(path: string): Promise<KnowledgeDocument | null>;
      }
    ).syncPage('/fechas');
    const second = repository.documents.get('emeb-web:/fechas');
    if (!first || !second) throw new Error('No se guardó la copia de prueba');

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.documents.size).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    expect(second.content).toContain('Precio 120');
  });

  it('incluye la ficha individual cuando el lead menciona un curso concreto', async () => {
    const repository = createRepository();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<main>Precio CMB1 1.650€</main>'),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WebKnowledgeService(
      repository as unknown as Repository<KnowledgeDocument>,
    );

    await service.getContext('¿Cuál es el precio del CMB1?');

    expect(fetchMock.mock.calls.map(([url]) => url as string)).toEqual(
      expect.arrayContaining(['https://www.emeb.es/cursos/cmb1']),
    );
  });

  it('usa la última copia válida si la web no responde', async () => {
    const repository = createRepository();
    const now = new Date();
    repository.documents.set(
      'emeb-web:/fechas',
      Object.assign(new KnowledgeDocument(), {
        id: 'fechas-id',
        slug: 'emeb-web:/fechas',
        version: 1,
        status: KnowledgeDocumentStatus.APPROVED,
        content:
          'FUENTE: https://www.emeb.es/fechas\nPrecio y fechas guardados',
        contentHash: 'hash',
        fetchedAt: now,
        lastCheckedAt: now,
        createdAt: now,
      }),
    );
    repository.documents.set(
      'emeb-web:/cursos-profesionales',
      Object.assign(new KnowledgeDocument(), {
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
      }),
    );
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;

    const context = await new WebKnowledgeService(
      repository as unknown as Repository<KnowledgeDocument>,
    ).getContext('¿Qué fechas hay?');

    expect(context).toContain('Precio y fechas guardados');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(context).toContain('No se ha podido verificar ahora mismo');
  });

  it.each([
    ['What accommodation options are available?', ['/alojamientos']],
    ['¿Qué metodología y cuánta práctica hay en los cursos?', ['/metodo']],
    [
      '¿Qué fechas y alojamiento hay para CMB1?',
      ['/cursos/cmb1', '/fechas', '/alojamientos'],
    ],
    [
      'Quel est le prix du CMB1 et quel hébergement proposez-vous?',
      ['/cursos/cmb1', '/fechas', '/alojamientos'],
    ],
  ])(
    'recupera las fuentes de cada intención: %s',
    async (query, expectedPaths) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<main>Información oficial</main>'),
      }) as unknown as typeof fetch;
      await new WebKnowledgeService(
        createRepository() as unknown as Repository<KnowledgeDocument>,
      ).getContext(query);
      expect(
        (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(
          ([url]) =>
            typeof url === 'string'
              ? url
              : url instanceof URL
                ? url.href
                : url.url,
        ),
      ).toEqual(
        expect.arrayContaining(
          expectedPaths.map((path) => `https://www.emeb.es${path}`),
        ),
      );
      if (query.includes('metodología'))
        expect(
          (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(
            ([url]) =>
              typeof url === 'string'
                ? url
                : url instanceof URL
                  ? url.href
                  : url.url,
          ),
        ).not.toContain('https://www.emeb.es/fechas');
    },
  );

  it.each([
    [
      '¿Y cuánto cuesta?',
      [{ direction: 'inbound', body: 'Me interesa CMB1' }],
      'Bikefitting',
      '/cursos/cmb1',
    ],
    ['¿Y cuánto cuesta?', [], 'CMB1', '/cursos/cmb1'],
    [
      '¿Y Bikefitting?',
      [{ direction: 'inbound', body: 'Me interesa CMB1' }],
      'CMB1',
      '/cursos/bikefitting',
    ],
    [
      '¿Y cuánto cuesta?',
      [
        { direction: 'inbound', body: 'Me interesa CMB1' },
        { direction: 'inbound', body: 'Ahora Bikefitting' },
      ],
      'CMB1',
      '/cursos/bikefitting',
    ],
    [
      '¿Y cuánto cuesta?',
      [{ direction: 'outbound', body: 'Te interesa CMB1' }],
      null,
      '/cursos-profesionales',
    ],
  ])(
    'resuelve el curso vigente sin usar respuestas del bot',
    async (query, previousMessages, courseInterest, expectedPath) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<main>Información oficial</main>'),
      }) as unknown as typeof fetch;
      await new WebKnowledgeService(
        createRepository() as unknown as Repository<KnowledgeDocument>,
      ).getContext(query, { previousMessages, courseInterest });
      expect(
        (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(
          ([url]) =>
            typeof url === 'string'
              ? url
              : url instanceof URL
                ? url.href
                : url.url,
        ),
      ).toContain(`https://www.emeb.es${expectedPath}`);
    },
  );

  it('conserva la advertencia de fallo aunque se recorte una copia larga', async () => {
    const repository = createRepository();
    repository.documents.set(
      'emeb-web:/cursos/cmb1',
      Object.assign(new KnowledgeDocument(), {
        content: 'x'.repeat(30_000),
      }),
    );
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
    const context = await new WebKnowledgeService(
      repository as unknown as Repository<KnowledgeDocument>,
    ).getContext('Precio CMB1');
    expect(context).toHaveLength(26_000);
    expect(context).toMatch(/^SISTEMA: No se ha podido verificar/);
  });
});
