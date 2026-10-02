'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, ChevronRight, MessageCircle, Pause, Play, Send, UserRound } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AiGuidanceConfiguration, AiLearning, Conversation, ConversationAiMode, PaginatedResult, PipelineStage } from '@/types';
import { useAuthStore } from '@/store/auth.store';

const stages: { id: PipelineStage; label: string; color: string }[] = [
  { id: 'new', label: 'Nuevo', color: 'border-gray-300' },
  { id: 'contacted', label: 'Contactado', color: 'border-blue-300' },
  { id: 'qualified', label: 'Cualificado', color: 'border-yellow-300' },
  { id: 'call_scheduled', label: 'Llamada agendada', color: 'border-orange-300' },
  { id: 'call_done', label: 'Llamada hecha', color: 'border-orange-400' },
  { id: 'offer_sent', label: 'Oferta enviada', color: 'border-purple-300' },
  { id: 'deposit_requested', label: 'Señal solicitada', color: 'border-purple-400' },
  { id: 'deposit_paid', label: 'Señal pagada', color: 'border-green-300' },
  { id: 'enrolled', label: 'Matriculado', color: 'border-green-500' },
  { id: 'nurture', label: 'Nutrir', color: 'border-slate-300' },
  { id: 'lost', label: 'Perdido', color: 'border-red-300' },
];

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function AiGuidancePanel() {
  const qc = useQueryClient();
  const [instruction, setInstruction] = useState('');
  const { data: configuration } = useQuery({
    queryKey: ['ai-guidance'],
    queryFn: () => api.get<AiGuidanceConfiguration>('/ai-guidance').then((response) => response.data),
  });
  const { data: learnings = [] } = useQuery({
    queryKey: ['ai-learnings', 'pending'],
    queryFn: () => api.get<AiLearning[]>('/ai-guidance/learnings?status=pending').then((response) => response.data),
  });
  useEffect(() => setInstruction(configuration?.instruction ?? ''), [configuration?.instruction]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ai-guidance'] });
    qc.invalidateQueries({ queryKey: ['ai-learnings'] });
  };
  const saveInstruction = useMutation({
    mutationFn: () => api.post('/ai-guidance/instructions', { text: instruction }),
    onSuccess: refresh,
  });
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
          <p className="mt-1 text-xs text-gray-500">Los datos de cursos se verifican siempre en emeb.es. Las respuestas manuales requieren aprobación antes de usarse como ejemplo.</p>
        </div>
        <button
          onClick={() => setPaused.mutate(!configuration?.paused)}
          disabled={setPaused.isPending || !configuration}
          className={cn('rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50', configuration?.paused ? 'bg-green-600 text-white' : 'bg-amber-100 text-amber-800')}
        >
          {configuration?.paused ? 'Activar respuestas automáticas' : 'Pausar respuestas automáticas'}
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Instrucciones para el asistente…" className="min-h-20 flex-1 rounded-lg border px-3 py-2 text-sm" />
        <button onClick={() => saveInstruction.mutate()} disabled={!instruction.trim() || saveInstruction.isPending} className="self-end rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Guardar</button>
      </div>
      {learnings.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <h3 className="text-xs font-semibold text-gray-700">Respuestas manuales pendientes de revisar</h3>
          <div className="mt-2 space-y-2">
            {learnings.map((learning) => (
              <div key={learning.id} className="rounded-lg bg-gray-50 p-3">
                <p className="whitespace-pre-wrap text-sm text-gray-700">{learning.candidateText || 'El texto original ya no está disponible.'}</p>
                <div className="mt-2 flex gap-2">
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<PaginatedResult<Conversation>>('/conversations?limit=100').then((r) => r.data),
    refetchInterval: 15_000,
  });
  const { data: selected } = useQuery({
    queryKey: ['conversation', selectedId],
    queryFn: () => api.get<Conversation>(`/conversations/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });
  const updateMode = useMutation({
    mutationFn: (aiMode: ConversationAiMode) => api.patch(`/conversations/${selectedId}/mode`, { aiMode }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversation', selectedId] }); qc.invalidateQueries({ queryKey: ['conversations'] }); },
  });
  const updateStage = useMutation({
    mutationFn: (stage: PipelineStage) => api.patch(`/conversations/${selectedId}/stage`, { stage }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversation', selectedId] }); qc.invalidateQueries({ queryKey: ['conversations'] }); },
  });
  const send = useMutation({
    mutationFn: (body: string) => api.post(`/conversations/${selectedId}/send`, { text: body }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['conversation', selectedId] }); qc.invalidateQueries({ queryKey: ['conversations'] }); },
  });
  const grouped = stages.reduce<Record<string, Conversation[]>>((acc, stage) => { acc[stage.id] = (data?.data ?? []).filter((c) => c.pipelineStage === stage.id); return acc; }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-1">Conversaciones entrantes y seguimiento comercial</p>
        </div>
        <span className="text-xs rounded-full bg-blue-50 text-blue-700 px-3 py-1">IA supervisada</span>
      </div>

      {user?.role === 'admin' && <AiGuidancePanel />}

      {isLoading ? <div className="p-12 text-center text-sm text-gray-400">Cargando conversaciones...</div> : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <section key={stage.id} className="w-64 shrink-0">
              <div className={cn('flex items-center justify-between border-t-4 rounded-t-xl bg-white px-3 py-3 shadow-sm', stage.color)}>
                <h2 className="text-sm font-semibold text-gray-800">{stage.label}</h2>
                <span className="text-xs text-gray-400">{grouped[stage.id]?.length ?? 0}</span>
              </div>
              <div className="mt-2 space-y-2 min-h-24">
                {(grouped[stage.id] ?? []).map((conversation) => (
                  <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={cn('w-full text-left bg-white rounded-xl border p-3 shadow-sm hover:border-blue-300 transition-colors', selectedId === conversation.id && 'ring-2 ring-blue-200')}>
                    <div className="flex items-start gap-2">
                      <MessageCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-gray-900 truncate">{conversation.contact?.name}</p>
                        <p className="text-xs text-gray-500 truncate">{conversation.contact?.courseInterest || conversation.externalContactKey}</p>
                        <div className="flex items-center gap-1 mt-2 text-[11px] text-gray-400"><span>{conversation.aiMode === 'auto' ? 'IA activa' : conversation.aiMode === 'human' ? 'Agente' : 'Pausada'}</span><ChevronRight className="h-3 w-3" /></div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white border-l border-gray-200 shadow-2xl z-20 flex flex-col">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div><h2 className="font-semibold text-gray-900">{selected.contact.name}</h2><p className="text-xs text-gray-500">{selected.externalContactKey} · {selected.language || 'idioma pendiente'}</p></div>
            <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-700 text-sm">Cerrar</button>
          </div>
          <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap">
            <select value={selected.pipelineStage} onChange={(e) => updateStage.mutate(e.target.value as PipelineStage)} className="text-xs border rounded-lg px-2 py-1.5">
              {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
            </select>
            <button onClick={() => updateMode.mutate(selected.aiMode === 'auto' ? 'paused' : 'auto')} className="flex items-center gap-1 text-xs border rounded-lg px-2 py-1.5 hover:bg-gray-50">{selected.aiMode === 'auto' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}{selected.aiMode === 'auto' ? 'Pausar IA' : 'Activar IA'}</button>
            <button onClick={() => updateMode.mutate('human')} className="flex items-center gap-1 text-xs border border-orange-200 text-orange-700 rounded-lg px-2 py-1.5 hover:bg-orange-50"><UserRound className="h-3 w-3" />Tomar conversación</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-gray-50">
            {(selected.messages ?? []).map((message) => <div key={message.id} className={cn('flex', message.direction === 'outbound' ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm', message.direction === 'outbound' ? 'bg-green-100 text-green-950 rounded-tr-sm' : 'bg-white text-gray-800 rounded-tl-sm')}><p className="whitespace-pre-wrap">{message.body}</p><p className="text-[10px] opacity-50 mt-1">{message.actor} · {formatDate(message.createdAt)}</p></div></div>)}
            {(selected.pipelineEvents ?? []).map((event) => <div key={event.id} className="text-[11px] text-center text-gray-400">{event.actor} movió la conversación a {stages.find((stage) => stage.id === event.toStage)?.label ?? event.toStage}{event.reason ? ` · ${event.reason}` : ''}</div>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); if (text.trim()) send.mutate(text.trim()); }} className="p-4 border-t flex gap-2"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Enviar mensaje manual..." className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /><button disabled={!text.trim() || send.isPending} className="rounded-xl bg-blue-600 text-white px-3 disabled:opacity-40"><Send className="h-4 w-4" /></button></form>
        </div>
      )}
    </div>
  );
}
