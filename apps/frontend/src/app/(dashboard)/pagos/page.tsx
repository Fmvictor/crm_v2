'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import api from '@/lib/api';
import type { PaginatedResult, Enrollment } from '@/types';

export default function PagosPage() {
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), limit: '20', paymentStatus: 'paid' });

  const { data, isLoading } = useQuery({
    queryKey: ['pagos', page],
    queryFn: () =>
      api.get<PaginatedResult<Enrollment>>(`/enrollments?${params}`).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const formatAmount = (amount: number | null, currency: string | null) => {
    if (amount == null) return '—';
    const cur = (currency ?? 'eur').toUpperCase();
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: cur }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Pagos</h1>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">Cargando...</div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            No hay pagos capturados todavía
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Alumno</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Curso</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Importe</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Nº Pedido</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">ID Stripe</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.data.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{e.contact.name}</p>
                    {e.contact.email && (
                      <p className="text-xs text-gray-400">{e.contact.email}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600 max-w-[200px] truncate">
                    {e.course.name}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {formatAmount(e.amountPaid, e.currency)}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {e.wooOrderNumber ?? '—'}
                  </td>
                  <td className="px-6 py-4">
                    {e.stripePaymentId ? (
                      <span className="font-mono text-xs text-gray-400">
                        {e.stripePaymentId}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {e.enrolledAt
                      ? new Date(e.enrolledAt).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(data?.lastPage ?? 0) > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              {data?.total} pagos · página {data?.page} de {data?.lastPage}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page === data?.lastPage}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
