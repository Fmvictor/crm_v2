/** Extracts whole course sections; never changes the administrator's documents.
 * Unstructured/ambiguous documents are kept whole rather than guessed or truncated.
 */
export interface RetrievalConversation {
  previousMessages?: { direction: string; body: string }[];
  courseInterest?: string | null;
}
const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bcmb\s+(\d)/g, 'cmb$1')
    .replace(/\be[ -]+bike/g, 'ebike')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(
      (word) =>
        !['de', 'del', 'en', 'el', 'la', 'los', 'las', 'a', 'para'].includes(
          word,
        ),
    )
    .join(' ');

export function selectDocumentContext(
  content: string,
  query: string,
  conversation?: RetrievalConversation,
) {
  // A fence may contain heading-like data; fall back to the original document.
  if (
    !/^# .*cat[aá]logo.*cursos/im.test(content) ||
    /^\s*(```|~~~)/m.test(content)
  )
    return { content, focused: false };
  const pieces = content.split(/(?=^## )/m);
  const courses = pieces
    .map((text, index) => ({
      text,
      index,
      key: normalized(
        (text.match(/^## \d+\. ([^\n]+)/)?.[1] ?? '').split('·')[0],
      ),
    }))
    .filter((section) => section.key);
  if (courses.length < 2) return { content, focused: false };
  const match = (text: string) => {
    const source = ' ' + normalized(text) + ' ';
    const ranges = courses.flatMap((course) => {
      const keys = [
        course.key,
        ...(course.key.includes('online') ? ['online'] : []),
      ];
      return keys.flatMap((key) => {
        const found: { index: number; start: number; end: number }[] = [];
        let offset = 0;
        while ((offset = source.indexOf(' ' + key + ' ', offset)) >= 0) {
          found.push({
            index: course.index,
            start: offset,
            end: offset + key.length + 2,
          });
          offset++;
        }
        return found;
      });
    });
    // CMB1 Online must not also select CMB1, unless separately mentioned.
    return new Set(
      ranges
        .filter(
          (r) =>
            !ranges.some(
              (other) =>
                other.index !== r.index &&
                other.start <= r.start &&
                other.end >= r.end &&
                other.end - other.start > r.end - r.start,
            ),
        )
        .map((r) => r.index),
    );
  };
  let selected = match(query);
  if (
    /\d\s*(?:y|o|a|-)\s*\d/i.test(query) ||
    (!selected.size && /\b(?:cmb\s*\d+|mec[aá]nica\s*\d+)/i.test(query))
  )
    return { content, focused: false };
  if (!selected.size) {
    for (const message of [
      ...(conversation?.previousMessages ?? []),
    ].reverse()) {
      if (message.direction !== 'inbound') continue;
      selected = match(message.body);
      if (selected.size) break;
    }
  }
  if (!selected.size) selected = match(conversation?.courseInterest ?? '');
  if (!selected.size) return { content, focused: false };
  const courseIndexes = new Set(courses.map((course) => course.index));
  return {
    content: pieces
      .filter((_, index) => !courseIndexes.has(index) || selected.has(index))
      .join(''),
    focused: true,
  };
}

export function needsSecondaryWeb(
  query: string,
  manual: string,
  focused: boolean,
): boolean {
  if (!focused) return true;
  const text = normalized(query);
  // Live commercial conditions are always checked against the optional web source.
  if (
    /\b(precio\w*|price\w*|prix|cost\w*|cuest\w*|vale|tarifa\w*|importe\w*|fechas?|dates?|cuando|when|quand|inicio|edicion\w*|proxim\w*|actual\w*|hoy|ahora|vigent\w*|plazas?|disponib\w*|convocatoria\w*|descuento\w*|aloj\w*|accommodat\w*)\b/.test(
      text,
    )
  )
    return true;
  // Skip the web only for a clearly identified static fact already in the document.
  const topics = [
    [
      /\b(dura\w*|dias?|presencial\w*|streaming|modalidad|duration|days?)\b/,
      /\b(dias?|presencial\w*|streaming)\b/,
    ],
    [
      /\b(inclu\w*|contenido|temario|campus|soporte|support|syllabus|includes?)\b/,
      /\b(inclu\w*|contenido|temario|campus|soporte)\b/,
    ],
    [/\b(horario\w*|horas?|hours?)\b/, /\b(horario\w*|horas?)\b/],
  ];
  return !topics.some(
    ([question, evidence]) =>
      question.test(text) && evidence.test(normalized(manual)),
  );
}
