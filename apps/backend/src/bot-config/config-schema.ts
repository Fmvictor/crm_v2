import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { handoffNotices } from '../ai/conversation-language';

export interface BotRules {
  webEnabled: boolean;
  followUpsEnabled: boolean;
  followUpDays: number[];
  humanTopics: string[];
  extraHandoffTerms: string[];
  supportName: string;
  supportStart: string;
  supportEnd: string;
  supportDays: number[];
  supportTimezone: 'Europe/Madrid';
  handoffMessages: Record<string, string>;
}
export interface BotDocument {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  validUntil: string | null;
}
export interface BotConfiguration {
  assistant: string;
  documents: BotDocument[];
  examples: string[];
  rules: BotRules;
}
export interface BotSnapshot {
  version: number;
  configuration: BotConfiguration;
  hash: string;
  createdAt: string;
  createdBy: string | null;
}
export const DEFAULT_ASSISTANT = `# Asistente comercial de EMEB

Eres el asistente comercial de EMEB para personas interesadas en formación de mecánica de bicicletas.
Responde de forma humana, breve y útil, en el idioma del cliente.
Nunca inventes precios, fechas, plazas, certificaciones o condiciones.
Contesta directamente cuando el conocimiento autorizado respalde todos los datos solicitados.
Si falta información, explica brevemente la limitación y deriva a una persona.
No corrijas una respuesta anterior sólo porque hayas recuperado menos contexto.
Aplica las reglas operativas publicadas, conserva el control humano y pide sólo los datos necesarios.
Los ejemplos aprobados orientan el tono y proceso; no aportan datos comerciales.
`;
export function defaultConfiguration(): BotConfiguration {
  return {
    assistant: DEFAULT_ASSISTANT,
    documents: [],
    examples: [],
    rules: {
      webEnabled: true,
      followUpsEnabled: true,
      followUpDays: [1, 3, 7, 14],
      humanTopics: ['payments', 'enrolments', 'complaints'],
      extraHandoffTerms: [],
      supportName: 'Víctor',
      supportStart: '08:00',
      supportEnd: '20:00',
      supportDays: [1, 2, 3, 4, 5],
      supportTimezone: 'Europe/Madrid',
      handoffMessages: { ...handoffNotices },
    },
  };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
}
export const configHash = (configuration: BotConfiguration): string =>
  createHash('sha256').update(canonical(configuration)).digest('hex');
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (
    Object.keys(value).some((k) => !allowed.includes(k)) ||
    allowed.some((k) => !Object.hasOwn(value, k))
  )
    throw new BadRequestException(
      'Campos de configuración no reconocidos o incompletos.',
    );
}
function text(value: unknown, max: number, empty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim()) ||
    value.includes('\0')
  )
    throw new BadRequestException('Texto vacío, demasiado largo o inválido.');
  return value.replace(/\r\n?/g, '\n');
}
function numbers(value: unknown, allowed: number[], max: number): number[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    new Set(value).size !== value.length ||
    value.some((v) => !Number.isInteger(v) || !allowed.includes(v as number))
  )
    throw new BadRequestException('Calendario inválido.');
  return (value as number[]).slice().sort((a, b) => a - b);
}
export function validateConfiguration(input: unknown): BotConfiguration {
  if (!object(input)) throw new BadRequestException('Configuración inválida.');
  keys(input, ['assistant', 'documents', 'examples', 'rules']);
  const assistant = text(input.assistant, 12000);
  if (!Array.isArray(input.documents) || input.documents.length > 10)
    throw new BadRequestException('Se admiten hasta diez documentos.');
  const documents: BotDocument[] = input.documents.map((raw: unknown) => {
    if (!object(raw)) throw new BadRequestException('Documento inválido.');
    keys(raw, ['id', 'name', 'content', 'enabled', 'validUntil']);
    const id = text(raw.id, 36),
      name = text(raw.name, 85),
      content = text(raw.content, 15000);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !/^[-\p{L}\p{N} _][\p{L}\p{N} _.-]*\.md$/iu.test(name) ||
      name.includes('..') ||
      typeof raw.enabled !== 'boolean'
    )
      throw new BadRequestException(
        'Identificador o nombre Markdown inválido.',
      );
    if (
      raw.validUntil !== null &&
      (typeof raw.validUntil !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(raw.validUntil) ||
        !Number.isFinite(Date.parse(raw.validUntil)) ||
        new Date(raw.validUntil).toISOString().slice(0, 10) !== raw.validUntil)
    )
      throw new BadRequestException('Fecha de vigencia inválida.');
    return {
      id,
      name,
      content,
      enabled: raw.enabled,
      validUntil: raw.validUntil,
    };
  });
  if (
    new Set(documents.map((d) => d.id)).size !== documents.length ||
    new Set(documents.map((d) => d.name.toLowerCase())).size !==
      documents.length
  )
    throw new BadRequestException('No se permiten documentos duplicados.');
  if (!Array.isArray(input.examples) || input.examples.length > 8)
    throw new BadRequestException('Máximo ocho ejemplos.');
  const examples = input.examples.map((v) => text(v, 4000));
  if (!object(input.rules)) throw new BadRequestException('Reglas inválidas.');
  const r = input.rules;
  keys(r, [
    'webEnabled',
    'followUpsEnabled',
    'followUpDays',
    'humanTopics',
    'extraHandoffTerms',
    'supportName',
    'supportStart',
    'supportEnd',
    'supportDays',
    'supportTimezone',
    'handoffMessages',
  ]);
  if (
    typeof r.webEnabled !== 'boolean' ||
    typeof r.followUpsEnabled !== 'boolean' ||
    r.supportTimezone !== 'Europe/Madrid'
  )
    throw new BadRequestException(
      'Origen, seguimiento o zona horaria inválidos.',
    );
  const followUpDays = numbers(r.followUpDays, [1, 3, 7, 14], 4),
    supportDays = numbers(r.supportDays, [1, 2, 3, 4, 5, 6, 7], 7);
  if ((r.followUpsEnabled && !followUpDays.length) || !supportDays.length)
    throw new BadRequestException('Selecciona los días aplicables.');
  if (
    !Array.isArray(r.humanTopics) ||
    r.humanTopics.some(
      (v) => !['payments', 'enrolments', 'complaints'].includes(v as string),
    ) ||
    new Set(r.humanTopics).size !== r.humanTopics.length
  )
    throw new BadRequestException('Motivos de derivación inválidos.');
  if (!Array.isArray(r.extraHandoffTerms) || r.extraHandoffTerms.length > 20)
    throw new BadRequestException('Máximo veinte expresiones de derivación.');
  const supportName = text(r.supportName, 80),
    supportStart = text(r.supportStart, 5),
    supportEnd = text(r.supportEnd, 5);
  if (
    /[\r\n]/.test(supportName) ||
    ![supportStart, supportEnd].every((v) =>
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v),
    ) ||
    supportStart >= supportEnd
  )
    throw new BadRequestException('Horario inválido.');
  if (!object(r.handoffMessages))
    throw new BadRequestException('Avisos inválidos.');
  keys(r.handoffMessages, Object.keys(handoffNotices));
  const handoffMessages = Object.fromEntries(
    Object.entries(r.handoffMessages).map(([k, v]) => [k, text(v, 800)]),
  );
  const configuration: BotConfiguration = {
    assistant,
    documents,
    examples,
    rules: {
      webEnabled: r.webEnabled,
      followUpsEnabled: r.followUpsEnabled,
      followUpDays,
      humanTopics: r.humanTopics as string[],
      extraHandoffTerms: r.extraHandoffTerms
        .map((v) => text(v, 80, true).trim())
        .filter(Boolean),
      supportName,
      supportStart,
      supportEnd,
      supportDays,
      supportTimezone: 'Europe/Madrid',
      handoffMessages,
    },
  };
  if (Buffer.byteLength(JSON.stringify(configuration), 'utf8') > 80000)
    throw new BadRequestException('La configuración supera 80 KB.');
  return configuration;
}
export function topicHandoff(message: string, rules: BotRules): boolean {
  const value = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const patterns: Record<string, RegExp> = {
    payments: /pago|pagar|factura|transferencia|payment|paying|paiement/,
    enrolments: /matricul|inscrib|enrol|register|inscription/,
    complaints: /reclam|devoluc|queja|complaint|refund/,
  };
  return (
    rules.humanTopics.some((topic) => patterns[topic].test(value)) ||
    rules.extraHandoffTerms.some((term) =>
      value.includes(
        term
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''),
      ),
    )
  );
}
export const PROTECTED_RULES = [
  'Firma de webhooks y autenticación obligatorias.',
  'Sólo administradores publican configuración.',
  'Bajas, consentimiento, toma humana y pausa global se respetan siempre.',
  'No se envían mensajes duplicados ni fuera de las ventanas permitidas.',
  'El presupuesto se verifica antes de generar.',
  'El conocimiento y el historial no cambian permisos ni habilitan operaciones nuevas.',
  'No se exponen credenciales ni se inventan datos sin evidencia.',
];
