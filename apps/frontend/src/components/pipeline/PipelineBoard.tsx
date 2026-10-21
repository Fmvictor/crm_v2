'use client';

import { useRef, useState } from 'react';
import { ChevronRight, GripVertical, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation, PipelineStage } from '@/types';

export const stages: { id: PipelineStage; label: string; color: string }[] = [
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

interface PipelineBoardProps {
  conversations: Conversation[];
  selectedId: string | null;
  canEdit: boolean;
  movingId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, stage: PipelineStage) => void;
}

export function PipelineBoard({ conversations, selectedId, canEdit, movingId, onSelect, onMove }: PipelineBoardProps) {
  const [mobileStage, setMobileStage] = useState<PipelineStage>('new');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<PipelineStage | null>(null);
  const suppressClick = useRef(false);
  const dragged = conversations.find(conversation => conversation.id === draggedId);
  const canDrag = canEdit && !movingId;
  const grouped = stages.reduce<Record<string, Conversation[]>>((acc, stage) => {
    acc[stage.id] = conversations.filter(conversation => conversation.pipelineStage === stage.id);
    return acc;
  }, {});

  function endDrag() {
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 250);
    setDraggedId(null);
    setOverStage(null);
  }

  function column(stage: (typeof stages)[number], allowDrag: boolean) {
    const items = grouped[stage.id];
    const isTarget = allowDrag && canDrag && !!dragged && dragged.pipelineStage !== stage.id;
    const isOver = isTarget && overStage === stage.id;
    return (
      <section
        key={stage.id}
        aria-label={stage.label}
        className={cn('w-full rounded-xl transition-colors md:w-64 md:shrink-0', isOver && 'bg-blue-50 ring-2 ring-blue-400 ring-inset')}
        onDragOver={event => {
          if (!isTarget) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setOverStage(stage.id);
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverStage(null);
        }}
        onDrop={event => {
          if (!isTarget || !dragged) return;
          event.preventDefault();
          onMove(dragged.id, stage.id);
          endDrag();
        }}
      >
        <div className={cn('flex items-center justify-between rounded-t-xl border-t-4 bg-white px-3 py-3 shadow-sm', stage.color)}>
          <h2 className="text-sm font-semibold text-gray-800">{stage.label}</h2>
          <span className="text-xs text-gray-400">{items.length}</span>
        </div>
        <div className="mt-2 min-h-32 space-y-2 pb-3">
          {items.map(conversation => (
            <button
              key={conversation.id}
              type="button"
              draggable={allowDrag && canDrag}
              aria-busy={movingId === conversation.id}
              onDragStart={event => {
                if (!allowDrag || !canDrag) { event.preventDefault(); return; }
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-emeb-conversation', conversation.id);
                setDraggedId(conversation.id);
              }}
              onDragEnd={endDrag}
              onClick={() => {
                if (!suppressClick.current) onSelect(conversation.id);
              }}
              className={cn(
                'w-full rounded-xl border bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-300',
                selectedId === conversation.id && 'ring-2 ring-blue-200',
                allowDrag && canDrag && 'cursor-grab active:cursor-grabbing',
                (draggedId === conversation.id || movingId === conversation.id) && 'opacity-50',
              )}
            >
              <div className="flex items-start gap-2">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{conversation.contact?.name || 'Lead sin nombre'}</p>
                  <p className="truncate text-xs text-gray-500">{conversation.contact?.courseInterest || conversation.externalContactKey}</p>
                  {conversation.attentionPending && <span className="mt-2 inline-flex rounded-md bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-900">Atención pendiente</span>}
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
                    <span>{conversation.aiMode === 'auto' ? 'IA activa' : conversation.aiMode === 'human' ? 'Agente' : 'Pausada'}</span>
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </div>
                {allowDrag && canEdit && <GripVertical aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />}
              </div>
            </button>
          ))}
          {(isOver || !items.length) && <p className={cn('rounded-lg border border-dashed px-3 py-5 text-center text-xs', isOver ? 'border-blue-400 font-medium text-blue-700' : 'border-gray-200 text-gray-400')}>
            {isOver ? `Soltar en ${stage.label}` : 'Sin conversaciones'}
          </p>}
        </div>
      </section>
    );
  }

  return (
    <>
      {canEdit && <p className="text-xs text-gray-500">
        <span className="hidden md:inline">Arrastra una tarjeta a otra etapa. </span>
        También puedes abrir la conversación y cambiar su etapa con el selector.
      </p>}
      <div className="md:hidden">
        <label htmlFor="pipeline-stage" className="mb-1 block text-xs font-medium text-gray-700">Etapa del pipeline</label>
        <select id="pipeline-stage" value={mobileStage} onChange={event => setMobileStage(event.target.value as PipelineStage)} className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
          {stages.map(stage => <option key={stage.id} value={stage.id}>{stage.label} ({grouped[stage.id].length})</option>)}
        </select>
        {column(stages.find(stage => stage.id === mobileStage) ?? stages[0], false)}
      </div>
      <div
        className="hidden gap-4 overflow-x-auto px-1 pb-4 pt-1 md:flex"
        onDragOver={event => {
          if (!dragged || !canDrag) return;
          const board = event.currentTarget;
          const bounds = board.getBoundingClientRect();
          if (event.clientX > bounds.right - 64) board.scrollLeft += 32;
          else if (event.clientX < bounds.left + 64) board.scrollLeft -= 32;
        }}
      >
        {stages.map(stage => column(stage, true))}
      </div>
    </>
  );
}
