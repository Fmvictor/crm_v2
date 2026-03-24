'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, MessageCircle } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Automation } from '@/types';

const triggerLabels: Record<string, string> = {
  payment_captured: 'Pago capturado',
};

const actionLabels: Record<string, string> = {
  whatsapp_template: 'WhatsApp — plantilla',
};

export default function AutomatizacionesPage() {
  const queryClient = useQueryClient();

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: () => api.get<Automation[]>('/automations').then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch<Automation>(`/automations/${id}/toggle`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Zap className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Automatizaciones</h1>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">Cargando...</div>
        ) : automations.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            No hay automatizaciones configuradas
          </div>
        ) : (
          automations.map((a) => (
            <div
              key={a.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-5"
            >
              <div
                className={cn(
                  'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
                  a.isActive ? 'bg-green-50' : 'bg-gray-100',
                )}
              >
                <MessageCircle
                  className={cn(
                    'h-5 w-5',
                    a.isActive ? 'text-green-600' : 'text-gray-400',
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{a.name}</p>
                {a.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{a.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                    Cuando: {triggerLabels[a.trigger] ?? a.trigger}
                  </span>
                  <span className="text-gray-300 text-xs">→</span>
                  <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                    {actionLabels[a.action] ?? a.action}
                  </span>
                  {a.templateName && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                      {a.templateName}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => toggleMutation.mutate(a.id)}
                disabled={toggleMutation.isPending}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50',
                  a.isActive ? 'bg-green-500' : 'bg-gray-200',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    a.isActive ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
