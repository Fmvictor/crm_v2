'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Send, UserRound } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AiGuidanceConfiguration, AiUsageSummary, AiLearning, Conversation, ConversationAiMode, PaginatedResult, PipelineStage } from '@/types';
import { useAuthStore } from '@/store/auth.store';
import { WhatsAppTemplateForm } from '@/components/whatsapp/WhatsAppTemplateForm';
import { AiUsagePanel } from '@/components/ai/AiUsagePanel';
import { DeliveryStatus } from '@/components/whatsapp/DeliveryStatus';
import { PipelineBoard, stages } from '@/components/pipeline/PipelineBoard';

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function AiGuidancePanel() {
  const qc = useQueryClient();
  const { data: configuration } = useQuery({
    refetchInterval: 15_000,
    queryKey: ['ai-guidance'],
    queryFn: () => api.get<AiGuidanceConfiguration>('/ai-guidance').then((response) => response.data),
  });
  const { data: learnings = [] } = useQuery({
    queryKey: ['ai-learnings', 'pending'],
    queryFn: () => api.get<AiLearning[]>('/ai-guidance/learnings?status=pending').then((response) => response.data),
  });
  const { data: usage } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api.get<AiUsageSummary>('/ai-usage').then(response => response.data),
    refetchInterval: 15_000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ai-guidance'] });
    qc.invalidateQueries({ queryKey: ['ai-learnings'] });
  };
  const setPaused = useMutation({
    mutationFn: (paused: boolean) => api.post('/ai-guidance/paused', { paused }),
    onSuccess: refresh,
  });
  const reviewLearning = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => api.patch(`/ai-guidance/learnings/${id}`, { status }),
    onSuccess: refresh,
  });

  return (
    <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Configuración de la IA</h2>
          <p className="mt-1 text-xs text-gray-500">El bot utiliza el conocimiento publicado en Asistente. Revisa las respuestas manuales antes de incorporarlas a un borrador.</p>
        </div>
        <button
          onClick={() => setPaused.mutate(!configuration?.paused)}
          disabled={setPaused.isPending || !configuration || (configuration.paused && (!usage || usage.blocked))}
          className={cn('rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50', configuration?.paused ? 'bg-green-600 text-white' : 'bg-amber-100 text-amber-800')}
        >
          {configuration?.paused ? 'Activar respuestas automáticas' : 'Pausar respuestas automáticas'}
        </button>
      </div>
      {setPaused.isError && <p role="alert" className="mt-2 text-xs text-red-700">No se pudo cambiar la pausa. Revisa el consumo y actualiza antes de reintentar.</p>}
      <AiUsagePanel />
      <Link href="/assistant" className="mt-4 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">Gestionar instrucciones, documentos y reglas</Link>
      {learnings.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <h3 className="text-xs font-semibold text-gray-700">Respuestas manuales pendientes de revisar</h3>
          <div className="mt-2 space-y-2">
            {learnings.map((learning) => (
              <div key={learning.id} className="rounded-lg bg-gray-50 p-3">
                <p className="whitespace-pre-wrap text-sm text-gray-700">{learning.candidateText || 'El texto original ya no está disponible.'}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => reviewLearning.mutate({ id: learning.id, status: 'approved' })} className="rounded-md bg-green-600 px-2 py-1 text-xs text-white">Aprobar ejemplo</button>
                  <button onClick={() => reviewLearning.mutate({ id: learning.id, status: 'rejected' })} className="rounded-md border px-2 py-1 text-xs text-gray-700">Descartar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function PipelinePage() {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canEdit = user?.role === 'admin' || user?.role === 'agent';
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [workFilter, setWorkFilter] = useState('all');
  const [conversationStatus, setConversationStatus] = useState<'open' | 'closed'>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageChangePending = useRef(false);
  const [text, setText] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['conversations', onlyAttention, conversationStatus, workFilter],
    queryFn: () => api.get<PaginatedResult<Conversation>>(`/conversations?limit=100&status=${conversationStatus}${onlyAttention ? '&attention=pending' : ''}${workFilter === 'followUp' ? '&followUp=scheduled' : workFilter === 'all' ? '' : `&aiMode=${workFilter}`}`).then((r) => r.data),
    refetchInterval: 15_000,
  });
  const { data: selected } = useQuery({
    queryKey: ['conversation', selectedId],
    queryFn: () => api.get<Conversation>(`/conversations/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
    refetchInterval: 5_000,
  });
  const updateMode = useMutation({
    mutationFn: ({ id, aiMode }: { id: string; aiMode: ConversationAiMode }) => api.patch(`/conversations/${id}/mode`, { aiMode }),
    onSettled: (_, _error, { id }) => { qc.invalidateQueries({ queryKey: ['conversation', id] }); qc.invalidateQueries({ queryKey: ['conversations'] }); },
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status, version }: { id: string; status: 'open' | 'closed'; version: number }) => api.patch(`/conversations/${id}/status`, { status, version }),
    onSettled: (_, _error, { id }) => { qc.invalidateQueries({ queryKey: ['conversation', id] }); qc.invalidateQueries({ queryKey: ['conversations'] }); },
  });
  const updateStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: PipelineStage }) => api.patch(`/conversations/${id}/stage`, { stage }),
    onSuccess: async (_, { id, stage }) => {
      // Evita que una consulta anterior al guardado restaure la etapa antigua.
      await Promise.all([
        qc.cancelQueries({ queryKey: ['conversations'] }),
        qc.cancelQueries({ queryKey: ['conversation', id] }),
      ]);
      qc.setQueriesData<PaginatedResult<Conversation>>({ queryKey: ['conversations'] }, current => current && ({
        ...current,
        data: current.data.map(conversation => conversation.id === id ? { ...conversation, pipelineStage: stage } : conversation),
      }));
      qc.setQueryData<Conversation>(['conversation', id], current => current && ({ ...current, pipelineStage: stage }));
    },
    onSettled: async (_, _error, { id }) => {
      try {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['conversation', id] }),
          qc.invalidateQueries({ queryKey: ['conversations'] }),
        ]);
      } finally {
        stageChangePending.current = false;
      }
    },
  });
  function moveConversation(id: string, stage: PipelineStage) {
    const conversation = (selected?.id === id ? selected : undefined) ?? data?.data.find(item => item.id === id);
    if (!canEdit || stageChangePending.current || !conversation || conversation.pipelineStage === stage) return;
    stageChangePending.current = true;
    updateStage.mutate({ id, stage });
  }
  const send = useMutation({
    mutationFn: (body: string) => api.post(`/conversations/${selectedId}/send`, { text: body }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['conversation', selectedId] }); qc.invalidateQueries({ queryKey: ['conversations'] }); },
  });
  const acknowledge = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => api.post(`/conversations/${id}/attention/acknowledge`, { version }),
    onSuccess: (_, variables) => { qc.invalidateQueries({ queryKey: ['conversation', variables.id] }); qc.invalidateQueries({ queryKey: ['conversations'] }); },
    onError: (_error, variables) => { qc.invalidateQueries({ queryKey: ['conversation', variables.id] }); },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-1">Conversaciones entrantes y seguimiento comercial</p>
        </div>
        <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">IA supervisada</span>
      </div>

      {user?.role === 'admin' && <AiGuidancePanel />}
      <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-sm text-gray-700">Conversaciones
        <select aria-label="Estado de conversaciones" value={conversationStatus} onChange={event => setConversationStatus(event.target.value as 'open' | 'closed')} className="rounded-lg border px-3 py-2">
          <option value="open">Abiertas y pendientes</option><option value="closed">Cerradas</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">Atención
        <select aria-label="Filtrar atención" value={workFilter} onChange={event => setWorkFilter(event.target.value)} className="rounded-lg border px-3 py-2">
          <option value="all">Todas</option><option value="auto">Bot</option><option value="human">Persona</option><option value="paused">IA pausada</option><option value="followUp">Con seguimiento</option>
        </select>
      </label>
      <label className="flex w-fit items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={onlyAttention} onChange={(event) => setOnlyAttention(event.target.checked)} className="h-4 w-4" />Sólo pendientes de atención</label>
      </div>

      {updateStage.isError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo guardar el cambio de etapa. Comprueba la conexión y vuelve a intentarlo.</p>}
      <p role="status" className="text-sm text-gray-600">
        {updateStage.isPending ? 'Guardando cambio de etapa…' : updateStage.isSuccess ? `Etapa guardada: ${stages.find(stage => stage.id === updateStage.variables.stage)?.label}.` : ''}
      </p>
      {isLoading ? <div className="p-12 text-center text-sm text-gray-400">Cargando conversaciones...</div> : (
        <PipelineBoard
          conversations={data?.data ?? []}
          selectedId={selectedId}
          canEdit={canEdit}
          movingId={updateStage.isPending ? updateStage.variables.id : null}
          onSelect={setSelectedId}
          onMove={moveConversation}
        />
      )}

      {selected && (
        <div className="fixed inset-0 z-20 flex w-full flex-col bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-w-xl sm:border-l sm:border-gray-200">
          <div className="flex items-center justify-between border-b px-4 py-4 sm:px-5">
            <div className="min-w-0"><h2 className="truncate font-semibold text-gray-900">{selected.contact.name || 'Lead sin nombre'}</h2><p className="truncate text-xs text-gray-500">{selected.externalContactKey} · {selected.language || 'idioma pendiente'}</p></div>
            <button onClick={() => setSelectedId(null)} className="ml-3 shrink-0 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700">Cerrar panel</button>
          </div>
          {selected.attentionPending && <div className="border-b border-orange-200 bg-orange-50 px-4 py-3 sm:px-5" role="status">
            <p className="text-sm font-semibold text-orange-950">Atención pendiente</p>
            <p className="mt-1 text-sm text-orange-900">{selected.attentionReason || 'Esta conversación requiere revisión del equipo.'}</p>
            <p className="mt-1 text-xs text-orange-800">Desde {formatDate(selected.attentionRequestedAt)}. Marcarla atendida mantiene la IA pausada.</p>
            {canEdit && <button disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ id: selected.id, version: selected.attentionVersion })} className="mt-2 rounded-lg bg-orange-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Marcar atendido</button>}
            {acknowledge.isError && acknowledge.variables?.id === selected.id && <p role="alert" className="mt-2 text-xs text-red-700">No se pudo marcar como atendida. Comprueba la versión actualizada e inténtalo de nuevo.</p>}
          </div>}
          <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:flex-wrap sm:px-5">
            <select aria-label="Cambiar etapa de la conversación" disabled={!canEdit || updateStage.isPending} value={selected.pipelineStage} onChange={(e) => moveConversation(selected.id, e.target.value as PipelineStage)} className="w-full rounded-lg border px-2 py-2 text-sm sm:w-auto sm:text-xs sm:py-1.5">
              {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
            </select>
            <button disabled={changeStatus.isPending || selected.status === 'closed' || updateMode.isPending || !canEdit || (selected.aiMode !== 'auto' && (user?.role !== 'admin' || selected.attentionPending || !!selected.optOutAt))} onClick={() => updateMode.mutate({ id: selected.id, aiMode: selected.aiMode === 'auto' ? 'paused' : 'auto' })} className="flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs sm:py-1.5">{selected.aiMode === 'auto' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}{selected.aiMode === 'auto' ? 'Pausar IA' : 'Activar IA'}</button>
            <button disabled={!canEdit || updateMode.isPending || changeStatus.isPending || selected.status === 'closed'} onClick={() => updateMode.mutate({ id: selected.id, aiMode: 'human' })} className="flex items-center justify-center gap-1 rounded-lg border border-orange-200 px-2 py-2 text-sm text-orange-700 hover:bg-orange-50 sm:text-xs sm:py-1.5"><UserRound className="h-3 w-3" />Tomar conversación</button>
          </div>
          <div className="border-b bg-slate-50 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-gray-800">{selected.status === 'closed' ? 'Conversación cerrada' : 'Conversación abierta'}</p>
            <p className="mt-1 text-xs text-gray-600">{selected.status === 'closed' ? 'El historial se conserva. Reabrir mantiene el control humano; después un administrador puede activar la IA para mensajes nuevos.' : 'Cerrar detiene la IA y los seguimientos. Si llega otro mensaje, se reabre para atención humana.'}</p>
            {canEdit && <button disabled={changeStatus.isPending || updateMode.isPending || send.isPending || (selected.status !== 'closed' && selected.attentionPending)} onClick={() => changeStatus.mutate({ id: selected.id, status: selected.status === 'closed' ? 'open' : 'closed', version: selected.lifecycleVersion })} className="mt-2 rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50">{selected.status === 'closed' ? 'Reabrir para atención humana' : 'Cerrar conversación'}</button>}
            {selected.status !== 'closed' && selected.attentionPending && <p className="mt-1 text-xs text-orange-800">Marca la atención como atendida antes de cerrar.</p>}
            {changeStatus.isError && changeStatus.variables?.id === selected.id && <p role="alert" className="mt-2 text-sm text-red-700">No se pudo guardar el cierre o la reapertura. La conversación puede haber cambiado; revisa los mensajes actualizados y vuelve a intentarlo.</p>}
            {updateMode.isError && updateMode.variables?.id === selected.id && <p role="alert" className="mt-2 text-sm text-red-700">No se pudo cambiar el modo. Revisa el estado, las atenciones pendientes y la baja del contacto.</p>}
          </div>
          {updateStage.isError && updateStage.variables.id === selected.id && <p role="alert" className="px-4 py-2 text-sm text-red-700">No se pudo guardar el cambio de etapa. Vuelve a intentarlo.</p>}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 p-3 sm:p-5">
            {(selected.messages ?? []).map((message) => <div key={message.id} className={cn('flex', message.direction === 'outbound' ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[85%]', message.direction === 'outbound' ? 'rounded-tr-sm bg-green-100 text-green-950' : 'rounded-tl-sm bg-white text-gray-800')}><p className="whitespace-pre-wrap break-words">{message.body}</p><p className="mt-1 text-[10px] opacity-50">{message.actor} · {formatDate(message.createdAt)}</p><p className="mt-1 text-[10px]"><DeliveryStatus message={message} /></p>{message.metadata?.configurationVersion && <details className="mt-2 text-xs"><summary className="cursor-pointer">Asistente · versión {message.metadata.configurationVersion}</summary><p className="mt-1">Fuentes: {message.metadata.sources?.map(source => source.name).join(', ') || 'Reglas de la versión publicada'}</p></details>}</div></div>)}
            {(selected.pipelineEvents ?? []).map((event) => <div key={event.id} className="text-[11px] text-center text-gray-400">{event.metadata?.action ? event.reason : `${event.actor} movió la conversación a ${stages.find((stage) => stage.id === event.toStage)?.label ?? event.toStage}${event.reason ? ` · ${event.reason}` : ''}`}</div>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); if (canEdit && selected.status !== 'closed' && !selected.optOutAt && text.trim()) send.mutate(text.trim()); }} className="flex gap-2 border-t p-3 sm:p-4"><input disabled={!canEdit || selected.status === 'closed' || !!selected.optOutAt || changeStatus.isPending} value={text} onChange={(e) => setText(e.target.value)} placeholder="Enviar mensaje manual..." className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" /><button aria-label="Enviar mensaje" disabled={!canEdit || selected.status === 'closed' || !!selected.optOutAt || changeStatus.isPending || !text.trim() || send.isPending} className="rounded-xl bg-blue-600 px-3 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button></form>
          {send.isError && <p role="alert" className="px-4 py-2 text-sm text-red-700">No se pudo enviar el mensaje. Revisa la conexión, el estado de la conversación y la ventana de 24 horas.</p>}
          {canEdit && selected.status !== 'closed' && !selected.optOutAt && <details className="border-t p-3 sm:p-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Plantillas de WhatsApp</summary>
            <div className="mt-3"><WhatsAppTemplateForm
              phone={selected.externalContactKey}
              onSent={() => {
                qc.invalidateQueries({ queryKey: ['conversation', selectedId] });
                qc.invalidateQueries({ queryKey: ['conversations'] });
              }}
            /></div>
          </details>}
        </div>
      )}
    </div>
  );
}
