import { Injectable } from '@nestjs/common';

export interface WebsiteEvidence {
  url: string;
  text: string;
  fetchedAt: Date;
}

const SITE_ORIGIN = 'https://www.emeb.es';
const HOME_PAGE = `${SITE_ORIGIN}/`;
const COURSE_INDEX = `${SITE_ORIGIN}/cursos/`;
const DATES_PAGE = `${SITE_ORIGIN}/fechas`;
const WEBSITE_TIMEOUT_MS = 8_000;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    nbsp: ' ',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    euro: '€',
    aacute: 'á',
    eacute: 'é',
    iacute: 'í',
    oacute: 'ó',
    uacute: 'ú',
    ntilde: 'ñ',
  };
  return value.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (entity: string, code: string) => {
      const lower = code.toLowerCase();
      if (lower.startsWith('#x'))
        return String.fromCodePoint(parseInt(lower.slice(2), 16));
      if (lower.startsWith('#'))
        return String.fromCodePoint(parseInt(lower.slice(1), 10));
      return named[lower] ?? entity;
    },
  );
}

export function htmlToReadableText(html: string): string {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
  return decodeEntities(
    main
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?\s*>|<\/(p|h[1-6]|li|section|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, 50_000);
}

function courseLinks(html: string): Array<{ url: string; label: string }> {
  const result = new Map<string, string>();
  const anchors = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchors)) {
    let url: URL;
    try {
      url = new URL(decodeEntities(match[1]), SITE_ORIGIN);
    } catch {
      continue;
    }
    if (
      url.origin !== SITE_ORIGIN ||
      !/^\/cursos\/[a-z0-9-]+\/?$/.test(url.pathname) ||
      url.pathname === '/cursos/'
    ) {
      continue;
    }
    result.set(url.pathname, htmlToReadableText(match[2]));
  }
  return [...result].map(([path, label]) => ({
    url: `${SITE_ORIGIN}${path}`,
    label,
  }));
}

function generalLinks(html: string): Array<{ url: string; label: string }> {
  const result = new Map<string, string>();
  const anchors = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchors)) {
    let url: URL;
    try {
      url = new URL(decodeEntities(match[1]), SITE_ORIGIN);
    } catch {
      continue;
    }
    if (
      url.origin !== SITE_ORIGIN ||
      !/^\/[a-z0-9/-]*\/?$/.test(url.pathname) ||
      url.pathname === '/' ||
      url.pathname.startsWith('/cursos/')
    )
      continue;
    result.set(url.pathname, htmlToReadableText(match[2]));
  }
  return [...result].map(([path, label]) => ({
    url: `${SITE_ORIGIN}${path}`,
    label,
  }));
}

function selectCourse(
  question: string,
  links: Array<{ url: string; label: string }>,
): string | null {
  const words = new Set(
    normalize(question)
      .split(' ')
      .filter((word) => word.length > 2),
  );
  const scored = links
    .map(({ url, label }) => {
      const slug = normalize(
        new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '',
      );
      const tokens = new Set(
        `${slug} ${normalize(label)}`.split(' ').filter(Boolean),
      );
      const score = [...words].filter((word) => tokens.has(word)).length;
      return { url, score };
    })
    .sort((a, b) => b.score - a.score);
  if (!scored[0] || scored[0].score === 0) return null;
  if (scored[1] && scored[0].score === scored[1].score) return null;
  return scored[0].url;
}

@Injectable()
export class CourseWebsiteService {
  private async readPage(
    url: string,
  ): Promise<{ html: string; fetchedAt: Date }> {
    if (new URL(url).origin !== SITE_ORIGIN)
      throw new Error('Dominio no permitido');
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(WEBSITE_TIMEOUT_MS),
      headers: { Accept: 'text/html' },
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('text/html')
    ) {
      throw new Error(
        `La web no devolvió una página HTML válida: ${response.status}`,
      );
    }
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error('Página demasiado grande');
    return { html, fetchedAt: new Date() };
  }

  async findEvidence(question: string): Promise<WebsiteEvidence[]> {
    const index = await this.readPage(COURSE_INDEX);
    const links = courseLinks(index.html);
    const courseUrl = selectCourse(question, links);
    const asksDates =
      /\b(fecha|fechas|cuando|cuándo|proxima|próxima|convocatoria|plaza|plazas)\b/i.test(
        question,
      );
    const urls = courseUrl
      ? [courseUrl, ...(asksDates ? [DATES_PAGE] : [])]
      : asksDates
        ? [DATES_PAGE]
        : /\b(curso|cursos|formaci[oó]n|programa|programas)\b/i.test(question)
          ? [COURSE_INDEX]
          : [];
    if (urls.length === 0) {
      const home = await this.readPage(HOME_PAGE);
      const section = selectCourse(question, generalLinks(home.html));
      urls.push(section ?? HOME_PAGE);
      if (
        section === null &&
        /\b(d[oó]nde|direcci[oó]n|tel[eé]fono|contacto|horario)\b/i.test(
          question,
        )
      ) {
        urls[0] = HOME_PAGE;
      }
      if (urls[0] === HOME_PAGE) {
        const text = htmlToReadableText(home.html);
        if (!text) throw new Error('La página no contiene texto legible');
        return [{ url: HOME_PAGE, text, fetchedAt: home.fetchedAt }];
      }
    }
    const evidence: WebsiteEvidence[] = [];
    for (const url of urls) {
      const page = url === COURSE_INDEX ? index : await this.readPage(url);
      const text = htmlToReadableText(page.html);
      if (!text) throw new Error('La página no contiene texto legible');
      evidence.push({ url, text, fetchedAt: page.fetchedAt });
    }
    return evidence;
  }
}
