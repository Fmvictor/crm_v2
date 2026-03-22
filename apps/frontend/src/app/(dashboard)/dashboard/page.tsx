'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, ClipboardList, TrendingUp } from 'lucide-react';
import api from '@/lib/api';
import type { PaginatedResult, Contact, Course, Enrollment } from '@/types';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  qualified: 'bg-yellow-100 text-yellow-700',
  enrolled: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};

const statusLabels: Record<string, string> = {
  new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado',
  enrolled: 'Inscrito', lost: 'Perdido',
  pending: 'Pendiente', confirmed: 'Confirmado', active: 'Activo',
  completed: 'Completado', cancelled: 'Cancelado',
};

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

export default function DashboardPage() {
  const { data: contacts } = useQuery({
    queryKey: ['contacts', 'summary'],
    queryFn: () =>
      api.get<PaginatedResult<Contact>>('/contacts?limit=100').then((r) => r.data),
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', 'summary'],
    queryFn: () =>
      api.get<PaginatedResult<Course>>('/courses?status=active&limit=100').then((r) => r.data),
  });

  const { data: enrollments } = useQuery({
    queryKey: ['enrollments', 'summary'],
    queryFn: () =>
      api.get<PaginatedResult<Enrollment>>('/enrollments?limit=100').then((r) => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['enrollments', 'stats'],
    queryFn: () => api.get('/enrollments/stats').then((r) => r.data),
  });

  const totalCollected = stats?.byPayment
    ? (stats.byStatus as any[]).reduce(
        (sum: number, s: any) => sum + Number(s.totalCollected ?? 0),
        0,
      )
    : 0;

  const recentContacts = contacts?.data.slice(0, 5) ?? [];
  const activeEnrollments =
    enrollments?.data.filter((e) => e.status === 'active') ?? [];

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
        {/* Contactos recientes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Contactos recientes
          </h2>
          {recentContacts.length === 0 ? (
            <p className="text-sm text-gray-400">Sin contactos aún</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentContacts.map((c) => (
                <li key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.email ?? c.phone ?? '—'}</p>
                  </div>
                  <span className={cn('text-xs font-medium px-2 py-1 rounded-full', statusColors[c.status])}>
                    {statusLabels[c.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Inscripciones activas */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Inscripciones activas
          </h2>
          {activeEnrollments.length === 0 ? (
            <p className="text-sm text-gray-400">Sin inscripciones activas</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {activeEnrollments.slice(0, 5).map((e) => (
                <li key={e.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.contact.name}</p>
                    <p className="text-xs text-gray-500">{e.course.name}</p>
                  </div>
                  <span className={cn('text-xs font-medium px-2 py-1 rounded-full', statusColors[e.paymentStatus])}>
                    {statusLabels[e.paymentStatus]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
