'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Mail, Phone, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PaginatedResult, Contact, ContactStatus, ContactSource } from '@/types';
import { ContactForm } from '@/components/contacts/ContactForm';

const statusColors: Record<ContactStatus, string> = {
  new: 'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  qualified: 'bg-yellow-100 text-yellow-700',
  enrolled: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};
const statusLabels: Record<ContactStatus, string> = {
  new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado',
  enrolled: 'Inscrito', lost: 'Perdido',
};
const sourceLabels: Record<ContactSource, string> = {
  whatsapp: 'WhatsApp', web: 'Web', referral: 'Referido',
  social: 'Redes', other: 'Otro',
};

export default function ContactsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | undefined>();

  const params = new URLSearchParams({
    page: String(page), limit: '20',
    ...(search && { search }),
    ...(status && { status }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, status, page],
    queryFn: () => api.get<PaginatedResult<Contact>>(`/contacts?${params}`).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const openCreate = () => { setEditing(undefined); setFormOpen(true); };
  const openEdit = (c: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(c);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contactos</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Nuevo contacto
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, email o teléfono..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(statusLabels) as ContactStatus[]).map((s) => (
            <option key={s} value={s}>{statusLabels[s]}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">Cargando...</div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No se encontraron contactos</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Nombre</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Contacto</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Estado</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Origen</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Interés</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.data.map((contact) => (
                <tr
                  key={contact.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{contact.name}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {contact.email && (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Mail className="h-3 w-3" /> {contact.email}
                        </span>
                      )}
                      {contact.phone && (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Phone className="h-3 w-3" /> {contact.phone}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn('px-2 py-1 rounded-full text-xs font-medium', statusColors[contact.status])}>
                      {statusLabels[contact.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{sourceLabels[contact.source]}</td>
                  <td className="px-6 py-4 text-gray-500 max-w-[180px] truncate">
                    {contact.courseInterest ?? '—'}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={(e) => openEdit(contact, e)}
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
              {data?.total} contactos · página {data?.page} de {data?.lastPage}
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

      <ContactForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        contact={editing}
      />
    </div>
  );
}
