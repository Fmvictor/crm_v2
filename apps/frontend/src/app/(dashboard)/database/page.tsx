'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Users, BookOpen, ClipboardList, MessageSquare, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type {
  Contact, Course, Enrollment, Interaction, User,
  ContactStatus, EnrollmentStatus, PaymentStatus,
  PaginatedResult,
} from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

type TableKey = 'contacts' | 'courses' | 'enrollments' | 'interactions' | 'users' | 'automations';

interface Automation {
  id: string;
  name: string;
  trigger: string;
  action: string;
  isActive: boolean;
  createdAt: string;
}

// ── Label maps ─────────────────────────────────────────────────────────────

const contactStatusColors: Record<ContactStatus, string> = {
  new: 'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  qualified: 'bg-yellow-100 text-yellow-700',
  enrolled: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};
const contactStatusLabels: Record<ContactStatus, string> = {
  new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado',
  enrolled: 'Inscrito', lost: 'Perdido',
};

const enrollmentStatusColors: Record<EnrollmentStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};
const enrollmentStatusLabels: Record<EnrollmentStatus, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', active: 'Activo',
  completed: 'Completado', cancelled: 'Cancelado',
};

const paymentStatusColors: Record<PaymentStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  refunded: 'bg-red-100 text-red-700',
};
const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado', refunded: 'Reembolsado',
};

// ── Table definitions ──────────────────────────────────────────────────────

const TABLE_META: Record<TableKey, { label: string; icon: React.ElementType; endpoint: string; paginated: boolean }> = {
  contacts:     { label: 'Contactos',      icon: Users,         endpoint: '/contacts',     paginated: true },
  courses:      { label: 'Cursos',         icon: BookOpen,      endpoint: '/courses',      paginated: true },
  enrollments:  { label: 'Inscripciones',  icon: ClipboardList, endpoint: '/enrollments',  paginated: true },
  interactions: { label: 'Interacciones',  icon: MessageSquare, endpoint: '/interactions', paginated: true },
  users:        { label: 'Usuarios',       icon: Users,         endpoint: '/users',        paginated: false },
  automations:  { label: 'Automatizaciones', icon: Zap,         endpoint: '/automations',  paginated: false },
};

// ── Format helpers ─────────────────────────────────────────────────────────

function formatDate(d: string | undefined | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function truncate(s: string | undefined | null, n = 60) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ── Badge ──────────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', color)}>
      {label}
    </span>
  );
}

// ── Row renderers ──────────────────────────────────────────────────────────

function ContactRow({ row }: { row: Contact }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.email ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.phone ?? '—'}</td>
      <td className="px-4 py-3">
        <Badge label={contactStatusLabels[row.status]} color={contactStatusColors[row.status]} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.source}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.createdAt)}</td>
    </tr>
  );
}

function CourseRow({ row }: { row: Course }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.category ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.modality}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.status}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.price != null ? `€${Number(row.price).toFixed(2)}` : '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.createdAt)}</td>
    </tr>
  );
}

function EnrollmentRow({ row }: { row: Enrollment }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.contact?.name ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.course?.name ?? '—'}</td>
      <td className="px-4 py-3">
        <Badge label={enrollmentStatusLabels[row.status]} color={enrollmentStatusColors[row.status]} />
      </td>
      <td className="px-4 py-3">
        <Badge label={paymentStatusLabels[row.paymentStatus]} color={paymentStatusColors[row.paymentStatus]} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.amountPaid != null ? `€${Number(row.amountPaid).toFixed(2)}` : '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.createdAt)}</td>
    </tr>
  );
}

function InteractionRow({ row }: { row: Interaction }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.type}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.direction ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">{truncate(row.notes)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{(row as Interaction & { contact?: { name?: string } }).contact?.name ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.createdAt)}</td>
    </tr>
  );
}

function UserRow({ row }: { row: User }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.email}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.role}</td>
      <td className="px-4 py-3">
        <Badge
          label={row.isActive ? 'Activo' : 'Inactivo'}
          color={row.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
        />
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.createdAt)}</td>
    </tr>
  );
}

function AutomationRow({ row }: { row: Automation }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.trigger}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{row.action}</td>
      <td className="px-4 py-3">
        <Badge
          label={row.isActive ? 'Activa' : 'Inactiva'}
          color={row.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
        />
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.createdAt)}</td>
    </tr>
  );
}

// ── Column headers per table ───────────────────────────────────────────────

const HEADERS: Record<TableKey, string[]> = {
  contacts:     ['Nombre', 'Email', 'Teléfono', 'Estado', 'Fuente', 'Creado'],
  courses:      ['Nombre', 'Categoría', 'Modalidad', 'Estado', 'Precio', 'Creado'],
  enrollments:  ['Contacto', 'Curso', 'Estado', 'Pago', 'Pagado', 'Creado'],
  interactions: ['Tipo', 'Dirección', 'Notas', 'Contacto', 'Creado'],
  users:        ['Nombre', 'Email', 'Rol', 'Estado', 'Creado'],
  automations:  ['Nombre', 'Trigger', 'Acción', 'Estado', 'Creado'],
};

// ── Main page ──────────────────────────────────────────────────────────────

export default function DatabasePage() {
  const [activeTable, setActiveTable] = useState<TableKey>('contacts');
  const [page, setPage] = useState(1);
  const limit = 20;

  const meta = TABLE_META[activeTable];

  // Count queries for badge (page=1, limit=1 just to get total)
  const counts = Object.entries(TABLE_META).map(([key, m]) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['db-count', key],
      queryFn: async () => {
        const res = await api.get(m.endpoint, m.paginated ? { params: { page: 1, limit: 1 } } : {});
        if (m.paginated) return (res.data as PaginatedResult<unknown>).total;
        return Array.isArray(res.data) ? res.data.length : 0;
      },
      staleTime: 30_000,
    })
  );

  // Main data query
  const { data, isLoading } = useQuery({
    queryKey: ['db-table', activeTable, page],
    queryFn: async () => {
      const res = await api.get(meta.endpoint, meta.paginated ? { params: { page, limit } } : {});
      if (meta.paginated) {
        const p = res.data as PaginatedResult<unknown>;
        return { rows: p.data, total: p.total, lastPage: p.lastPage };
      }
      const arr = res.data as unknown[];
      return { rows: arr, total: arr.length, lastPage: 1 };
    },
    placeholderData: (prev) => prev,
  });

  const handleTableSelect = (key: TableKey) => {
    setActiveTable(key);
    setPage(1);
  };

  const tableKeys = Object.keys(TABLE_META) as TableKey[];

  return (
    <div className="flex h-full">
      {/* Left panel — table list */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
          <Database className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Tablas</span>
        </div>
        <ul className="py-2">
          {tableKeys.map((key, i) => {
            const m = TABLE_META[key];
            const Icon = m.icon;
            const count = counts[i].data;
            return (
              <li key={key}>
                <button
                  onClick={() => handleTableSelect(key)}
                  className={cn(
                    'flex w-full items-center justify-between px-4 py-2 text-sm transition-colors',
                    activeTable === key
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {m.label}
                  </span>
                  {count != null && (
                    <span className={cn(
                      'text-xs rounded-full px-1.5 py-0.5 font-medium',
                      activeTable === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right panel — data table */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{meta.label}</h1>
            {data && (
              <p className="text-sm text-gray-500">{data.total} registros</p>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-500">Cargando...</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-500">Sin registros</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  {HEADERS[activeTable].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((row) => {
                  const id = (row as { id: string }).id;
                  if (activeTable === 'contacts')     return <ContactRow     key={id} row={row as Contact} />;
                  if (activeTable === 'courses')      return <CourseRow      key={id} row={row as Course} />;
                  if (activeTable === 'enrollments')  return <EnrollmentRow  key={id} row={row as Enrollment} />;
                  if (activeTable === 'interactions') return <InteractionRow key={id} row={row as Interaction} />;
                  if (activeTable === 'users')        return <UserRow        key={id} row={row as User} />;
                  return                                     <AutomationRow  key={id} row={row as Automation} />;
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data && data.lastPage > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-white">
            <span className="text-sm text-gray-500">
              Página {page} de {data.lastPage}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.lastPage, p + 1))}
                disabled={page === data.lastPage}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
