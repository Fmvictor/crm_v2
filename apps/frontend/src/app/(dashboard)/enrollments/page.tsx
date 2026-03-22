'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PaginatedResult, Enrollment, EnrollmentStatus, PaymentStatus } from '@/types';
import { EnrollmentForm } from '@/components/enrollments/EnrollmentForm';

const enrollStatusColors: Record<EnrollmentStatus, string> = {
  pending: 'bg-gray-100 text-gray-700', confirmed: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700', completed: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};
const enrollStatusLabels: Record<EnrollmentStatus, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', active: 'Activo',
  completed: 'Completado', cancelled: 'Cancelado',
};
const paymentColors: Record<PaymentStatus, string> = {
  pending: 'bg-gray-100 text-gray-600', partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700', refunded: 'bg-red-100 text-red-700',
};
const paymentLabels: Record<PaymentStatus, string> = {
  pending: 'Sin pagar', partial: 'Parcial', paid: 'Pagado', refunded: 'Reembolsado',
};

export default function EnrollmentsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Enrollment | undefined>();

  const params = new URLSearchParams({ page: String(page), limit: '20', ...(status && { status }) });

  const { data, isLoading } = useQuery({
    queryKey: ['enrollments', status, page],
    queryFn: () => api.get<PaginatedResult<Enrollment>>(`/enrollments?${params}`).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const openCreate = () => { setEditing(undefined); setFormOpen(true); };
  const openEdit = (e: Enrollment, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setEditing(e);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inscripciones</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Nueva inscripción
        </button>
      </div>

      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(enrollStatusLabels) as EnrollmentStatus[]).map((s) => (
            <option key={s} value={s}>{enrollStatusLabels[s]}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">Cargando...</div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">Sin inscripciones</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Alumno</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Curso</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Estado</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Pago</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Monto</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.data.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{e.contact.name}</td>
                  <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate">{e.course.name}</td>
                  <td className="px-6 py-4">
                    <span className={cn('px-2 py-1 rounded-full text-xs font-medium', enrollStatusColors[e.status])}>
                      {enrollStatusLabels[e.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn('px-2 py-1 rounded-full text-xs font-medium', paymentColors[e.paymentStatus])}>
                      {paymentLabels[e.paymentStatus]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    {e.amountPaid != null ? `$${Number(e.amountPaid).toLocaleString('es-MX')}` : '—'}
                    {e.amountTotal != null && (
                      <span className="text-gray-400"> / ${Number(e.amountTotal).toLocaleString('es-MX')}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={(ev) => openEdit(e, ev)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(data?.lastPage ?? 0) > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              {data?.total} inscripciones · página {data?.page} de {data?.lastPage}
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

      <EnrollmentForm open={formOpen} onClose={() => setFormOpen(false)} enrollment={editing} />
    </div>
  );
}
