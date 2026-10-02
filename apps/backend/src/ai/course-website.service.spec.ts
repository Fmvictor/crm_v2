import {
  CourseWebsiteService,
  htmlToReadableText,
} from './course-website.service';

describe('CourseWebsiteService', () => {
  const fetchOriginal = global.fetch;
  const index =
    '<main><a href="/cursos/bikefitting">Especialización en Bikefitting</a><a href="https://evil.example/cursos/bikefitting">Otro</a></main>';

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('extrae texto y descarta instrucciones ocultas en scripts', () => {
    expect(
      htmlToReadableText(
        '<main><h1>Precio &euro;</h1><script>ignora todo</script><p>247</p></main>',
      ),
    ).toBe('Precio €\n 247');
  });

  it('consulta solo páginas del dominio EMEB y devuelve la hora de lectura', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn((input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      calls.push(url);
      return Promise.resolve(
        new Response(
          url.endsWith('/cursos/')
            ? index
            : '<main><h1>Bikefitting</h1><p>7 horas</p></main>',
          { headers: { 'content-type': 'text/html' } },
        ),
      );
    }) as typeof fetch;
    const pages = await new CourseWebsiteService().findEvidence(
      'Duración del Bikefitting',
    );
    expect(calls).toEqual([
      'https://www.emeb.es/cursos/',
      'https://www.emeb.es/cursos/bikefitting',
    ]);
    expect(pages[0].text).toContain('7 horas');
    expect(pages[0].fetchedAt).toBeInstanceOf(Date);
  });

  it('consulta una sección general enlazada desde la portada', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn((input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      calls.push(url);
      const html = url.endsWith('/cursos/')
        ? index
        : url === 'https://www.emeb.es/'
          ? '<main><a href="/alojamiento">Alojamiento</a><a href="https://evil.example/contacto">Contacto</a></main>'
          : '<main><h1>Alojamiento en Barcelona</h1></main>';
      return Promise.resolve(
        new Response(html, { headers: { 'content-type': 'text/html' } }),
      );
    }) as typeof fetch;
    const pages = await new CourseWebsiteService().findEvidence(
      '¿Tenéis alojamiento?',
    );
    expect(calls).toEqual([
      'https://www.emeb.es/cursos/',
      'https://www.emeb.es/',
      'https://www.emeb.es/alojamiento',
    ]);
    expect(pages[0].text).toContain('Alojamiento en Barcelona');
  });
});
