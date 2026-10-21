'use client';

import { useId, useState } from 'react';
import Markdown from 'react-markdown';
import { buttonClass, downloadText, inputClass, readMarkdown } from './bot-configuration';

export function MarkdownView({ text }: { text: string }) {
  return <div className="markdown-content min-w-0 break-words rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-7 text-gray-800">
    <Markdown skipHtml disallowedElements={['img']} components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{text}</Markdown>
  </div>;
}

export function MarkdownEditor({ label, name, value, limit, onChange, onError, disabled }: {
  label: string; name: string; value: string; limit: number;
  onChange: (text: string) => void; onError: (message: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const [preview, setPreview] = useState(false);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={id} className="font-medium text-gray-900">{label}</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={() => setPreview(!preview)}>{preview ? 'Editar Markdown' : 'Vista previa'}</button>
        <button type="button" className={buttonClass} onClick={() => downloadText(name, value)}>Descargar .md</button>
        <label className={`${buttonClass} ${disabled ? 'pointer-events-none opacity-45' : 'cursor-pointer'}`}>
          Importar .md
          <input aria-label={`Importar ${name}`} type="file" accept=".md,text/markdown" className="sr-only" disabled={disabled} onChange={async event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try { onChange(await readMarkdown(file, limit)); } catch (error) { onError(error instanceof Error ? error.message : 'No se pudo leer el archivo.'); }
          }} />
        </label>
      </div>
    </div>
    {preview ? <MarkdownView text={value} /> : <textarea id={id} value={value} maxLength={limit} onChange={e => onChange(e.target.value)} disabled={disabled} spellCheck={false} className={`${inputClass} min-h-80 font-mono leading-6`} />}
    <p className="text-xs text-gray-500">{value.length.toLocaleString('es')} / {limit.toLocaleString('es')} caracteres. Los cambios se incorporan al borrador.</p>
  </div>;
}
