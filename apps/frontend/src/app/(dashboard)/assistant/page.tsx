'use client';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { AssistantWorkbench } from '@/components/ai/AssistantWorkbench';
import type { BotOverview } from '@/components/ai/bot-configuration';

export default function AssistantPage() {
  const user = useAuthStore(state => state.user);
  const query = useQuery({ queryKey: ['bot-configuration'], enabled: user?.role === 'admin', refetchOnWindowFocus: false, refetchOnMount: 'always', queryFn: () => api.get<BotOverview>('/bot-config').then(r => r.data) });
  if (user?.role !== 'admin') return <p role="alert" className="rounded-xl border bg-white p-6 text-sm">Solo los administradores pueden consultar y editar la configuración del asistente.</p>;
  if (query.isPending) return <p role="status" className="p-6 text-sm text-gray-600">Cargando las instrucciones del asistente…</p>;
  if (query.isError) return <div role="alert" className="space-y-3 rounded-xl border bg-white p-6 text-sm"><p>No se pudo cargar la configuración del asistente.</p><button className="text-blue-700 underline" onClick={() => query.refetch()}>Reintentar</button></div>;
  return <AssistantWorkbench initial={query.data} />;
}
