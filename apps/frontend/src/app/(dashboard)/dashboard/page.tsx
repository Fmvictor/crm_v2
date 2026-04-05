'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, ClipboardList, TrendingUp, MessageSquare, AtSign } from 'lucide-react';
import api from '@/lib/api';
import type { PaginatedResult, Enrollment, Interaction } from '@/types';
import { cn } from '@/lib/utils';

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
      <div className={cn('p-3 rounded-xl', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function formatAmount(amount: number | string, currency = 'EUR') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(Number(amount));
}

export default function DashboardPage() {
  const { data: contacts } = useQuery({
    queryKey: ['contacts', 'summary'],
    queryFn: () =>
      api.get<PaginatedResult<{ id: string }>>('/contacts?limit=1').then((r) => r.data),
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', 'summary'],
    queryFn: () =>
      api.get<PaginatedResult<{ id: string }>>('/courses?status=active&limit=1').then((r) => r.data),
  });

  const { data: enrollments } = useQuery({
    queryKey: ['enrollments', 'summary'],
    queryFn: () =>
      api.get<PaginatedResult<{ id: string }>>('/enrollments?limit=1').then((r) => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['enrollments', 'stats'],
    queryFn: () => api.get('/enrollments/stats').then((r) => r.data),
  });

  const { data: recentPayments } = useQuery({
    queryKey: ['enrollments', 'recent-paid'],
    queryFn: () =>
      api.get<PaginatedResult<Enrollment>>('/enrollments?paymentStatus=paid&limit=5').then((r) => r.data),
  });

  const { data: recentInteractions } = useQuery({
    queryKey: ['interactions', 'dashboard'],
    queryFn: () =>
      api.get<PaginatedResult<Interaction>>('/interactions?limit=20').then((r) => r.data),
  });

  const totalCollected = stats?.byPayment
    ? (stats.byStatus as any[]).reduce(
        (sum: number, s: any) => sum + Number(s.totalCollected ?? 0),
        0,
      )
    : 0;

  const latestPayments = recentPayments?.data ?? [];
  const latestInteractions = (recentInteractions?.data ?? [])
    .filter((i) => i.type === 'whatsapp' || i.type === 'email')
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Contactos totales"
          value={contacts?.total ?? 0}
          icon={Users}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Cursos activos"
          value={courses?.total ?? 0}
          icon={BookOpen}
          color="bg-green-50 text-green-600"
        />
        <StatCard
          label="Inscripciones"
          value={enrollments?.total ?? 0}
          icon={ClipboardList}
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="Ingresos cobrados"
          value={totalCollected}
          icon={TrendingUp}
          color="bg-yellow-50 text-yellow-600"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Últimos pagos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Últimos pagos</h2>
          {latestPayments.length === 0 ? (
            <p className="text-sm text-gray-400">Sin pagos registrados</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {latestPayments.map((e) => (
                <li key={e.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{e.contact.name}</p>
                    <p className="text-xs text-gray-500 truncate">{e.course.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(e.createdAt)}</p>
                  </div>
                  <span className="text-sm font-bold text-green-700 shrink-0">
                    {formatAmount(e.amountPaid ?? 0, e.currency ?? 'EUR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Últimas interacciones */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Últimas interacciones</h2>
          {latestInteractions.length === 0 ? (
            <p className="text-sm text-gray-400">Sin interacciones recientes</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {latestInteractions.map((i) => {
                const isWA = i.type === 'whatsapp';
                const Icon = isWA ? MessageSquare : AtSign;
                return (
                  <li key={i.id} className="py-3 flex items-start gap-3">
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                      isWA
                        ? 'bg-green-50 border-green-100 text-green-600'
                        : 'bg-blue-50 border-blue-100 text-blue-600',
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {i.contact?.name ?? 'Desconocido'}
                        </p>
                        <time className="text-[11px] text-gray-400 shrink-0">{formatDate(i.createdAt)}</time>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{i.notes}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
