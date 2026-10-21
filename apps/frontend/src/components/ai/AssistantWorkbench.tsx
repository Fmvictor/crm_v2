'use client';

import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { CheckCircle2, FileText, History, LockKeyhole, Save } from 'lucide-react';
import api from '@/lib/api';
import { MarkdownEditor, MarkdownView } from './MarkdownEditor';
import { BotRulesEditor } from './BotRulesEditor';
import type { BotConfiguration, BotDocument, BotOverview } from './bot-configuration';
import { buttonClass, dateLabel, downloadText, inputClass, primaryClass, readMarkdown } from './bot-configuration';

type Tab = 'active' | 'assistant' | 'documents' | 'rules' | 'test' | 'history';
const tabs: [Tab, string][] = [['active', 'Publicado'], ['assistant', 'Instrucciones'], ['documents', 'Conocimiento'], ['rules', 'Reglas'], ['test', 'Pruebas'], ['history', 'Historial']];
interface Preview { instructions?: string; context?: string; sources?: { id: string; name: string; hash: string }[]; decision?: { reply: string; handoff: boolean; handoffReason?: string }; handoff?: boolean; reason?: string; aiUsed?: boolean }

function ConfigurationView({ configuration }: { configuration: BotConfiguration }) {
  const [documentId, setDocumentId] = useState('assistant');
  const selected = configuration.documents.find(d => d.id === documentId);
  return <div className="space-y-4">
    <label className="block text-sm font-medium">Archivo<select className={`${inputClass} mt-1`} value={documentId} onChange={e => setDocumentId(e.target.value)}>
      <option value="assistant">asistente.md</option>{configuration.documents.map(doc => <option key={doc.id} value={doc.id}>{doc.name}{!doc.enabled ? ' (desactivado)' : ''}{doc.validUntil ? ` · hasta ${doc.validUntil}` : ''}</option>)}
    </select></label>
    <button className={buttonClass} onClick={() => downloadText(selected?.name ?? 'asistente.md', selected?.content ?? configuration.assistant)}>Descargar archivo</button>
    <MarkdownView text={selected?.content ?? configuration.assistant} />
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Reglas y ejemplos de esta versión</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{JSON.stringify({ rules: configuration.rules, examples: configuration.examples }, null, 2)}</pre></details>
  </div>;
}

export function AssistantWorkbench({ initial }: { initial: BotOverview }) {
  const [overview, setOverview] = useState(initial);
  const [draft, setDraft] = useState<BotConfiguration>(initial.state.draft);
  const [tab, setTab] = useState<Tab>('active');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(initial.state.draft.documents[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [historyVersion, setHistoryVersion] = useState(initial.active.version);
  const dirty = JSON.stringify(draft) !== JSON.stringify(overview.state.draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(overview.active.configuration);
  const revision = overview.state.draftRevision;
  const document = draft.documents.find(d => d.id === selectedDoc);

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);

  const adopt = (next: BotOverview) => { setOverview(next); setDraft(next.state.draft); setSelectedDoc(next.state.draft.documents[0]?.id ?? null); setWarnings([]); setPreview(null); setConflict(false); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) {
      const message: unknown = isAxiosError(e) ? e.response?.data?.message : e instanceof Error ? e.message : null;
      setError(typeof message === 'string' ? message : Array.isArray(message) ? message.join(' · ') : 'No se pudo completar la operación. Tu texto sigue en el editor.');
      if (isAxiosError(e) && e.response?.status === 409) setConflict(true);
    } finally { setBusy(false); }
  };
  const patch = (change: Partial<BotConfiguration>) => { setDraft({ ...draft, ...change }); setPreview(null); setNotice(''); setWarnings([]); };
  const patchDocument = (change: Partial<BotDocument>) => patch({ documents: draft.documents.map(doc => doc.id === selectedDoc ? { ...doc, ...change } : doc) });
  const fetchOverview = () => api.get<BotOverview>('/bot-config').then(r => r.data);
  const save = () => run(async () => { adopt((await api.put<BotOverview>('/bot-config/draft', { configuration: draft, revision })).data); setNotice('Borrador guardado. La versión publicada sigue activa.'); });
  const validate = () => run(async () => {
    const result = (await api.post<{ hash: string; warnings: string[] }>('/bot-config/validate', { revision })).data;
    setOverview({ ...overview, state: { ...overview.state, validatedHash: result.hash } }); setWarnings(result.warnings); setNotice('Borrador validado. Puedes probarlo y publicarlo.');
  });
  const publish = () => run(async () => {
    await api.post('/bot-config/publish', { revision, activeVersion: overview.active.version });
    adopt(await fetchOverview()); setNotice('Nueva versión publicada. Se usará en las próximas respuestas.'); setTab('active');
  });
  const addDocument = (name: string, content: string) => {
    if (draft.documents.length >= 10) throw new Error('Puedes guardar hasta diez documentos.');
    const id = crypto.randomUUID(); patch({ documents: [...draft.documents, { id, name, content, enabled: true, validUntil: null }] }); setSelectedDoc(id);
  };
  const test = (useAi: boolean) => run(async () => {
    setPreview((await api.post<Preview>('/bot-config/preview', { revision, question, useAi })).data);
    setNotice(useAi ? 'Prueba terminada y contabilizada en el consumo de IA.' : 'Contexto preparado sin generar con IA.');
  });

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-blue-700">WhatsApp · EMEB</p><h1 className="text-2xl font-bold text-gray-900">Asistente</h1><p className="mt-2 max-w-2xl text-sm text-gray-600">Lee lo que tiene publicado el bot y prepara cambios en sus instrucciones, conocimiento y reglas.</p></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800"><CheckCircle2 className="h-4 w-4" />Versión {overview.active.version} activa</span>
    </header>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">Las instrucciones se guardan en el servidor del CRM y se envían a OpenAI al preparar cada respuesta. Puedes descargarlas como Markdown. Editar o guardar un borrador no cambia el bot: debes validarlo y publicarlo.</div>
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="text-sm"><strong>Borrador {revision}</strong><p className="mt-1 text-xs text-gray-500">{dirty ? 'Cambios sin guardar' : overview.state.validatedHash ? 'Guardado y validado' : 'Guardado · pendiente de validación'}{!changed ? ' · coincide con lo publicado' : ''}</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={busy || !dirty || conflict} onClick={save}><Save className="h-4 w-4" />Guardar borrador</button>
        <button className={buttonClass} disabled={busy || dirty || conflict} onClick={validate}>Validar</button>
        <button className={primaryClass} disabled={busy || dirty || !changed || !overview.state.validatedHash || conflict} onClick={publish}>{busy ? 'Procesando…' : 'Publicar cambios'}</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
    {warnings.map(w => <p key={w} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{w}</p>)}
    {conflict && <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>Otro administrador ha cambiado la configuración. Conserva tu borrador antes de recargar; no se combinarán cambios automáticamente.</p><div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={() => downloadText('borrador-asistente.json', JSON.stringify(draft, null, 2), 'application/json')}>Descargar mi borrador completo</button><button disabled={busy} className={buttonClass} onClick={() => run(async () => { adopt(await fetchOverview()); setNotice('Configuración recargada.'); })}>Descartar mis cambios y recargar</button></div></div>}
    <nav aria-label="Configuración del asistente" className="flex flex-wrap gap-1 border-b border-gray-200">{tabs.map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>{label}</button>)}</nav>
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      {tab === 'active' && <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Lo que usa el bot ahora</h2><p className="mt-1 text-xs text-gray-500">Versión {overview.active.version} · publicada el {dateLabel(overview.active.createdAt)} · hora de Madrid</p></div><button disabled={busy || dirty} className={buttonClass} onClick={() => run(async () => { adopt(await fetchOverview()); setNotice('Versión activa comprobada.'); })}>Actualizar</button></div>
        {!overview.active.configuration.documents.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Todavía no hay documentos propios publicados. Se conserva la consulta a emeb.es. Añade tus archivos en Conocimiento y publica el borrador cuando estén listos.</p>}
        <ConfigurationView key={overview.active.version} configuration={overview.active.configuration} />
        <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Ver todas las instrucciones ensambladas que se envían al modelo</summary><p className="mt-3 text-xs text-gray-500">La etapa se completa con la de cada conversación. El conocimiento vigente y el historial se incorporan como contexto de la petición.</p><pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs leading-6">{overview.activeInstructions}</pre><button className={`${buttonClass} mt-3`} onClick={() => downloadText(`instrucciones-v${overview.active.version}.md`, overview.activeInstructions)}>Descargar instrucciones completas</button></details>
      </div>}
      {tab === 'assistant' && <div className="space-y-6">
        <div><h2 className="mb-2 text-lg font-semibold">Instrucciones del borrador</h2><p className="text-sm text-gray-600">Define su identidad, tono, forma de atender y criterios de respuesta. Los datos de cursos van en Conocimiento.</p></div>
        <MarkdownEditor label="asistente.md" name="asistente.md" value={draft.assistant} limit={12000} disabled={busy} onChange={assistant => patch({ assistant })} onError={setError} />
        <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Ejemplos de respuesta ({draft.examples.length}/8)</summary><p className="my-3 text-sm text-gray-600">Orientan el tono y el proceso. Se usan cuando publiques esta versión.</p><button className={buttonClass} disabled={busy || !overview.approvedExamples.length} onClick={() => patch({ examples: [...new Set([...draft.examples, ...overview.approvedExamples])].slice(0, 8) })}>Incorporar ejemplos aprobados</button><div className="mt-4 space-y-3">{draft.examples.map((example, index) => <div key={index} className="space-y-2"><label className="block text-sm">Ejemplo {index + 1}<textarea className={`${inputClass} mt-1 min-h-24`} value={example} maxLength={4000} disabled={busy} onChange={e => patch({ examples: draft.examples.map((v, i) => i === index ? e.target.value : v) })} /></label><button className={buttonClass} disabled={busy} onClick={() => patch({ examples: draft.examples.filter((_, i) => i !== index) })}>Eliminar ejemplo {index + 1}</button></div>)}</div></details>
      </div>}
      {tab === 'documents' && <div className="space-y-5">
        <div><h2 className="text-lg font-semibold">Conocimiento del borrador</h2><p className="mt-2 text-sm text-gray-600">Escribe o importa la información que debe utilizar para responder. Hasta 10 archivos y 15.000 caracteres por archivo; el conjunto de la configuración admite 80 KB.</p></div>
        <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy || draft.documents.length >= 10} onClick={() => { try { addDocument(`documento-${draft.documents.length + 1}.md`, '# Nuevo documento\n\nEscribe aquí la información que debe conocer el asistente.'); } catch (e) { setError((e as Error).message); } }}><FileText className="h-4 w-4" />Nuevo documento</button><label className={`${buttonClass} cursor-pointer`}>Añadir archivo .md<input type="file" aria-label="Añadir documento Markdown" accept=".md,text/markdown" className="sr-only" disabled={busy || draft.documents.length >= 10} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { addDocument(file.name, await readMarkdown(file, 15000)); } catch (error) { setError((error as Error).message); } }} /></label></div>
        {draft.documents.length > 0 && <label className="block text-sm font-medium">Documento a editar<select className={`${inputClass} mt-1`} value={selectedDoc ?? ''} onChange={e => setSelectedDoc(e.target.value)}><option disabled value="">Selecciona un documento</option>{draft.documents.map(d => <option key={d.id} value={d.id}>{d.name}{!d.enabled ? ' (desactivado)' : ''}</option>)}</select></label>}
        {document && <div className="space-y-5 border-t pt-5">
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Nombre del archivo<input className={`${inputClass} mt-1`} maxLength={85} value={document.name} disabled={busy} onChange={e => patchDocument({ name: e.target.value })} /></label><label className="text-sm">Vigente hasta (opcional)<input type="date" className={`${inputClass} mt-1`} value={document.validUntil ?? ''} disabled={busy} onChange={e => patchDocument({ validUntil: e.target.value || null })} /></label></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={document.enabled} disabled={busy} onChange={e => patchDocument({ enabled: e.target.checked })} />Utilizar este documento al publicar</label>
          <p className="text-xs text-gray-500">La vigencia incluye el día seleccionado, con hora de Madrid. Los documentos desactivados o vencidos se conservan, pero no se usan para responder.</p>
          <MarkdownEditor key={document.id} label="Contenido Markdown" name={document.name} value={document.content} limit={15000} disabled={busy} onChange={content => patchDocument({ content })} onError={setError} />
          <button className={`${buttonClass} text-red-700`} disabled={busy} onClick={() => { const docs = draft.documents.filter(d => d.id !== selectedDoc); patch({ documents: docs }); setSelectedDoc(docs[0]?.id ?? null); }}>Quitar del borrador</button>
        </div>}
        {!draft.documents.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">Añade tu primer documento para preparar el conocimiento del asistente.</p>}
      </div>}
      {tab === 'rules' && <div className="space-y-6"><BotRulesEditor value={draft.rules} onChange={rules => patch({ rules })} disabled={busy} /><div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><h3 className="mb-3 flex items-center gap-2 font-semibold"><LockKeyhole className="h-4 w-4" />Protecciones del programa</h3><p className="mb-3 text-sm text-gray-600">Se muestran para consulta. Una modificación de estas protecciones requiere un cambio de código.</p><ul className="list-disc space-y-2 pl-5 text-sm">{overview.protectedRules.map(rule => <li key={rule}>{rule}</li>)}</ul></div></div>}
      {tab === 'test' && <div className="space-y-4">
        <h2 className="text-lg font-semibold">Probar el borrador guardado</h2><p className="text-sm text-gray-600">Las pruebas no envían WhatsApps ni modifican conversaciones. «Preparar contexto» muestra las fuentes sin generar una respuesta. «Probar con IA» consume el presupuesto mensual existente.</p>
        {dirty && <p className="rounded-lg bg-amber-50 p-3 text-sm">Guarda los cambios antes de probarlos.</p>}
        <label className="block text-sm font-medium">Pregunta de prueba<textarea disabled={busy} className={`${inputClass} mt-1 min-h-24`} value={question} maxLength={2000} onChange={e => { setQuestion(e.target.value); setPreview(null); }} placeholder="Por ejemplo: ¿qué incluye el curso?" /></label>
        <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy || dirty || conflict || !question.trim()} onClick={() => test(false)}>Preparar contexto</button><button className={primaryClass} disabled={busy || dirty || conflict || !question.trim()} onClick={() => test(true)}>Probar con IA</button></div>
        {preview && <div className="space-y-4 rounded-xl border p-4">{preview.handoff && <p className="text-sm text-amber-900">Atención humana: {preview.reason}</p>}{preview.decision && <><h3 className="font-semibold">Respuesta de prueba</h3><p className="whitespace-pre-wrap text-sm leading-7">{preview.decision.reply || 'Sin respuesta automática.'}</p>{preview.decision.handoff && <p className="text-sm text-amber-900">Derivación: {preview.decision.handoffReason}</p>}</>}<div><h3 className="mb-2 text-sm font-semibold">Fuentes utilizadas</h3>{preview.sources?.length ? <ul className="space-y-2 text-sm">{preview.sources.map(s => <li key={s.id}>{s.name}<span className="mt-1 block break-all font-mono text-xs text-gray-500">SHA-256: {s.hash}</span></li>)}</ul> : <p className="text-sm text-gray-500">Sin fuentes vigentes.</p>}</div>{preview.context && <details open><summary className="cursor-pointer text-sm font-medium">Conocimiento que recibirá el modelo</summary><pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs leading-6">{preview.context}</pre></details>}{preview.instructions && <details><summary className="cursor-pointer text-sm font-medium">Instrucciones del borrador ensambladas</summary><pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs leading-6">{preview.instructions}</pre></details>}</div>}
      </div>}
      {tab === 'history' && <div className="space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5" />Historial de publicaciones</h2><p className="text-sm text-gray-600">Consulta las últimas 100 versiones. Recuperar una versión sustituye el borrador guardado; tendrás que validarlo y publicarlo para activarlo.</p>
        <label className="block text-sm font-medium">Versión a consultar<select className={`${inputClass} mt-1`} value={historyVersion} onChange={e => setHistoryVersion(Number(e.target.value))}>{overview.history.map(v => <option key={v.version} value={v.version}>Versión {v.version} · {dateLabel(v.createdAt)}{v.version === overview.active.version ? ' · activa' : ''}</option>)}</select></label>
        {(() => { const selected = overview.history.find(v => v.version === historyVersion); return selected && <><p className="break-all text-xs text-gray-500">Publicada por: {selected.createdBy ?? 'Migración inicial'} · SHA-256: {selected.hash}</p><ConfigurationView key={selected.version} configuration={selected.configuration} /><button disabled={busy || dirty || conflict} className={buttonClass} onClick={() => run(async () => { adopt((await api.post<BotOverview>(`/bot-config/restore/${selected.version}`, { revision })).data); setNotice(`Versión ${selected.version} recuperada como borrador. La versión activa sigue siendo la ${overview.active.version}.`); setTab('assistant'); })}>Recuperar versión {selected.version} como borrador</button></>; })()}
        <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Comparar versión activa y borrador</summary><div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2"><div className="min-w-0"><h3 className="mb-2 font-medium">Publicado · versión {overview.active.version}</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs leading-6">{JSON.stringify(overview.active.configuration, null, 2)}</pre></div><div className="min-w-0"><h3 className="mb-2 font-medium">Borrador · revisión {revision}</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs leading-6">{JSON.stringify(draft, null, 2)}</pre></div></div></details>
      </div>}
    </section>
  </div>;
}
