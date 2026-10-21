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
export interface BotVersion {
  version: number;
  configuration: BotConfiguration;
  hash: string;
  createdAt: string;
  createdBy: string | null;
}
export interface BotOverview {
  active: BotVersion;
  state: {
    draftRevision: number;
    draft: BotConfiguration;
    validatedHash: string | null;
    updatedAt: string;
    updatedBy: string | null;
  };
  history: BotVersion[];
  approvedExamples: string[];
  protectedRules: string[];
  activeInstructions: string;
  draftInstructions: string;
}
export const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
export const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45';
export const primaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45';
export const dateLabel = (value: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function downloadText(name: string, content: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readMarkdown(file: File, limit: number): Promise<string> {
  if (!file.name.toLowerCase().endsWith('.md')) throw new Error('Selecciona un archivo .md.');
  if (file.size > limit * 4) throw new Error(`El archivo supera el máximo de ${limit.toLocaleString('es')} caracteres.`);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new Error('El archivo debe estar guardado en UTF-8.'); }
  if (!text.trim() || text.includes('\0') || text.length > limit) throw new Error(`El archivo está vacío o supera ${limit.toLocaleString('es')} caracteres.`);
  return text.replace(/\r\n?/g, '\n');
}
