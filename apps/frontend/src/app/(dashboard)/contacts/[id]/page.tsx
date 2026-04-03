'use client';

import { useState } from 'react';
import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Phone, Mail, MessageSquare,
  PhoneCall, AtSign, FileText, Users, Plus, Trash2,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Contact, Enrollment } from '@/types';
import { ContactForm } from '@/components/contacts/ContactForm';
import { InteractionForm } from '@/components/interactions/InteractionForm';

type Interaction = {
  id: string;
  type: 'call' | 'whatsapp' | 'email' | 'note' | 'meeting';
  direction: 'inbound' | 'outbound' | null;
  notes: string;
  durationMinutes: number | null;
  createdBy: { name: string } | null;
  createdAt: string;
};

const statusColors: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700', contacted: 'bg-blue-100 text-blue-700',
  qualified: 'bg-yellow-100 text-yellow-700', enrolled: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};
const statusLabels: Record<string, string> = {
  new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado',
  enrolled: 'Inscrito', lost: 'Perdido',
};
const typeIcons: Record<string, React.ElementType> = {
  call: PhoneCall, whatsapp: MessageSquare, email: AtSign,
  note: FileText, meeting: Users,
};
const typeLabels: Record<string, string> = {
  call: 'Llamada', whatsapp: 'WhatsApp', email: 'Email',
  note: 'Nota', meeting: 'Reunión',
};
const enrollStatusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700', confirmed: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700', completed: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};
const enrollStatusLabels: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', active: 'Activo',
  completed: 'Completado', cancelled: 'Cancelado',
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contacts', id],
    queryFn: () => api.get<Contact>(`/contacts/${id}`).then((r) => r.data),
  });

  const { data: interactions } = useQuery({
    queryKey: ['interactions', id],
    queryFn: () =>
      api.get<{ data: Interaction[] }>(`/interactions?contactId=${id}&limit=50`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: enrollments } = useQuery({
    queryKey: ['enrollments', 'contact', id],
    queryFn: () =>
      api.get<{ data: Enrollment[] }>(`/enrollments?contactId=${id}&limit=20`).then((r) => r.data),
    enabled: !!id,
  });

  const deleteInteraction = useMutation({
    mutationFn: (iId: string) => api.delete(`/interactions/${iId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interactions', id] }),
  });

  if (isLoading) return <div className="text-sm text-gray-400 p-8">Cargando...</div>;
  if (!contact) return <div className="text-sm text-gray-400 p-8">Contacto no encontrado</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{contact.name}</h1>
            <span className={cn('text-xs font-medium px-2 py-1 rounded-full', statusColors[contact.status])}>
              {statusLabels[contact.status]}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
            {contact.email && (
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{contact.email}</span>
            )}
            {contact.phone && (
              <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{contact.phone}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditOpen(true)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: info + enrollments */}
        <div className="space-y-4">
          {/* Info card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Información</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Origen</dt>
                <dd className="font-medium text-gray-900 capitalize">{contact.source}</dd>
              </div>
              {contact.courseInterest && (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 shrink-0">Interés</dt>
                  <dd className="font-medium text-gray-900 text-right">{contact.courseInterest}</dd>
                </div>
              )}
              {contact.assignedTo && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Asignado a</dt>
                  <dd className="font-medium text-gray-900">{contact.assignedTo.name}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Registrado</dt>
                <dd className="text-gray-700">{formatDate(contact.createdAt)}</dd>
              </div>
            </dl>
            {contact.notes && (
              <div className="pt-2 border-t border-gray-50">
                <p className="text-xs text-gray-500 mb-1">Notas</p>
                <p className="text-sm text-gray-700">{contact.notes}</p>
              </div>
            )}
          </div>

          {/* Enrollments */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Inscripciones</h2>
            {(enrollments?.data.length ?? 0) === 0 ? (
              <p className="text-xs text-gray-400">Sin inscripciones</p>
            ) : (
              <ul className="space-y-2">
                {enrollments?.data.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p className="font-medium text-gray-900 truncate">{e.course.name}</p>
                    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', enrollStatusColors[e.status])}>
                      {enrollStatusLabels[e.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: interactions timeline */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Historial de interacciones
            </h2>
            <button
              onClick={() => setInteractionOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Registrar
            </button>
          </div>

          {(interactions?.data.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400">Sin interacciones registradas</p>
          ) : (
            <ol className="relative border-l border-gray-100 space-y-5 pl-5">
              {interactions?.data.map((interaction) => {
                const Icon = typeIcons[interaction.type];
                return (
                  <li key={interaction.id} className="relative">
                    <span className={cn(
                      "absolute -left-[21px] flex h-9 w-9 items-center justify-center rounded-full border shadow-sm",
                      interaction.type === 'whatsapp' 
                        ? "bg-green-50 border-green-100 text-green-600" 
                        : "bg-gray-50 border-gray-100 text-gray-500"
                    )}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="ml-2 group">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">
                          {typeLabels[interaction.type]}
                        </span>
                        {interaction.direction && (
                          <span className="text-xs text-gray-400">
                            ({interaction.direction === 'inbound' ? 'entrante' : 'saliente'})
                          </span>
                        )}
                        {interaction.durationMinutes && (
                          <span className="text-xs text-gray-400">· {interaction.durationMinutes} min</span>
                        )}
                        <button
                          onClick={() => deleteInteraction.mutate(interaction.id)}
                          className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{interaction.notes}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(interaction.createdAt)}
                        {interaction.createdBy && ` · ${interaction.createdBy.name}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <ContactForm open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />
      <InteractionForm open={interactionOpen} onClose={() => setInteractionOpen(false)} contactId={id} />
    </div>
  );
}
