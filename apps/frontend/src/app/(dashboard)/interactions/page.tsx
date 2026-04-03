'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, MessageSquare, PhoneCall, AtSign, FileText, Users, Link as LinkIcon 
} from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PaginatedResult, Interaction } from '@/types';

const typeIcons: Record<string, React.ElementType> = {
  call: PhoneCall,
  whatsapp: MessageSquare,
  email: AtSign,
  note: FileText,
  meeting: Users,
};

const typeLabels: Record<string, string> = {
  call: 'Llamada',
  whatsapp: 'WhatsApp',
  email: 'Email',
  note: 'Nota',
  meeting: 'Reunión',
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export default function InteractionsPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');

  const params = new URLSearchParams({
    page: String(page),
    limit: '50',
    ...(type && { type }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['interactions', 'global', type, page],
    queryFn: () => api.get<PaginatedResult<Interaction>>(`/interactions?${params}`).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Historial de interacciones</h1>
      </div>

      <div className="flex gap-3">
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(typeLabels).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">Cargando...</div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No se encontraron interacciones</div>
        ) : (
          <div className="divide-y divide-gray-100">
              {data?.data.map((interaction) => {
                const Icon = typeIcons[interaction.type] || FileText;
                const isWA = interaction.type === 'whatsapp';
                const directionText = interaction.direction === 'inbound' ? 'entrante' : 'saliente';

                return (
                  <div key={interaction.id} className="p-5 hover:bg-gray-50/50 transition-colors">
                    <div className="flex gap-4">
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm",
                        isWA 
                          ? "bg-green-50 border-green-100 text-green-600" 
                          : "bg-gray-50 border-gray-100 text-gray-500"
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                              {typeLabels[interaction.type]}
                            </p>
                            {interaction.direction && (
                              <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                                interaction.direction === 'inbound' 
                                  ? "bg-blue-50 text-blue-600" 
                                  : "bg-orange-50 text-orange-600"
                              )}>
                                {directionText}
                              </span>
                            )}
                          </div>
                          <time className="text-xs text-gray-400 whitespace-nowrap">
                            {formatDate(interaction.createdAt)}
                          </time>
                        </div>
                        
                        <div className="mt-1 flex items-center gap-2">
                          <Link 
                            href={`/contacts/${interaction.contactId}`}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            {interaction.contact?.name || 'Contacto desconocido'}
                            <LinkIcon className="h-3 w-3" />
                          </Link>
                          {interaction.createdBy && (
                            <span className="text-[10px] text-gray-400">
                              · Registrado por <span className="font-medium text-gray-600">{interaction.createdBy.name}</span>
                            </span>
                          )}
                        </div>

                        <div className="mt-2 text-sm leading-relaxed">
                          {isWA ? (
                            <div className={cn(
                              "inline-block rounded-2xl px-4 py-2 border shadow-sm",
                              interaction.direction === 'inbound' 
                                ? "bg-white border-gray-100 text-gray-700 rounded-tl-sm"
                                : "bg-green-50 border-green-100 text-green-900 rounded-tr-sm"
                            )}>
                              <p className="whitespace-pre-wrap">{interaction.notes}</p>
                            </div>
                          ) : (
                            <p className="text-gray-600 whitespace-pre-wrap">{interaction.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {(data?.lastPage ?? 0) > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              {data?.total} interacciones · página {data?.page} de {data?.lastPage}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                Anterior
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page === data?.lastPage}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
