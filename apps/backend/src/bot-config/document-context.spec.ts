import { selectDocumentContext, needsSecondaryWeb } from './document-context';
const catalog = `# Catálogo de cursos
## Escuela y condiciones comunes
Máximo 8 alumnos. No se confirma una matrícula.
## 1. CMB1 · Profesional
12 días: 6 presenciales y 6 streaming. Incluye campus y soporte. Precio 1650 EUR.
## 2. CMB1 Online · En casa
24 días en casa. Precio 1950 EUR.
## 3. CMB2 · Avanzado
Contenido avanzado. Precio 2224 EUR.
## Ayudas y consultas
Derivar cuando no haya datos.
`;
describe('Selección conservadora del catálogo publicado', () => {
  it('conserva el curso completo y todas las condiciones comunes', () => {
    const result = selectDocumentContext(catalog, '¿Cuántos días dura CMB1?');
    expect(result.focused).toBe(true);
    expect(result.content).toContain('6 presenciales');
    expect(result.content).toContain('Máximo 8 alumnos');
    expect(result.content).toContain('Derivar cuando');
    expect(result.content).not.toContain('24 días');
    expect(result.content).not.toContain('2224');
  });
  it.each(['CMB1 Online', 'CMB 1 online', '¿Y online?'])(
    'distingue online para %s',
    (query) => {
      const result = selectDocumentContext(catalog, query);
      expect(result.content).toContain('24 días');
      expect(result.content).not.toContain('1650');
    },
  );
  it('mantiene ambos cursos cuando se pide una comparación', () => {
    const result = selectDocumentContext(
      catalog,
      'Compara CMB1 con CMB1 Online y CMB2',
    );
    for (const price of ['1650', '1950', '2224'])
      expect(result.content).toContain(price);
  });
  it('la mención actual prevalece sobre el curso antiguo', () => {
    const result = selectDocumentContext(catalog, 'Ahora CMB2', {
      previousMessages: [{ direction: 'inbound', body: 'CMB1' }],
      courseInterest: 'CMB1',
    });
    expect(result.content).toContain('2224');
    expect(result.content).not.toContain('1650');
  });
  it('resuelve una continuación desde el cliente, sin inferirla de respuestas del bot', () => {
    const result = selectDocumentContext(catalog, '¿Y cuánto cuesta?', {
      previousMessages: [
        { direction: 'inbound', body: 'CMB1' },
        { direction: 'outbound', body: '¿Quizá CMB2?' },
      ],
    });
    expect(result.content).toContain('1650');
    expect(result.content).not.toContain('2224');
  });
  it('no arrastra el curso previo si el cliente cambia a uno desconocido', () => {
    expect(
      selectDocumentContext(catalog, 'Ahora quiero CMB9', {
        courseInterest: 'CMB1',
      }).focused,
    ).toBe(false);
  });
  it('usa el curso guardado si no hay mención explícita', () => {
    expect(
      selectDocumentContext(catalog, '¿Incluye campus?', {
        courseInterest: 'CMB1',
      }).content,
    ).not.toContain('2224');
  });
  it.each(['Quiero información', 'Comparar todos los cursos', 'CMB9'])(
    'conserva el catálogo ante una consulta ambigua: %s',
    (query) => {
      expect(selectDocumentContext(catalog, query)).toEqual({
        content: catalog,
        focused: false,
      });
    },
  );
  it('conserva documentos generales, sin estructura o con bloques de código', () => {
    for (const content of [
      'Precio 123 EUR',
      '## 1. Política\nNo devolver.\n## 2. Horario\nDe 8 a 20.',
      catalog + '```\n## 4. Dato\n```',
    ])
      expect(selectDocumentContext(content, 'CMB1').content).toBe(content);
  });
  it('omite la web sólo para hechos estáticos con evidencia y curso identificado', () => {
    for (const query of [
      '¿Cuántos días dura CMB1?',
      '¿CMB1 incluye campus y soporte?',
      '¿Qué modalidad tiene CMB1?',
    ])
      expect(needsSecondaryWeb(query, catalog, true)).toBe(false);
    for (const query of [
      'Precio CMB1',
      '¿Qué incluye el CMB1 y cuáles son sus precios?',
      '¿Cuánto durará y costará la próxima edición?',
      '¿Hay plazas?',
      '¿Cuándo empieza?',
      '¿CMB1 tiene descuento?',
      '¿Y alojamiento?',
      '¿Qué garantía laboral hay?',
    ])
      expect(needsSecondaryWeb(query, catalog, true)).toBe(true);
    expect(needsSecondaryWeb('¿Cuánto dura?', '', true)).toBe(true);
    expect(needsSecondaryWeb('¿Cuánto dura?', catalog, false)).toBe(true);
  });
});
