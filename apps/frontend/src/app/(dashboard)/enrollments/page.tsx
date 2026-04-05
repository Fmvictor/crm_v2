'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, BookOpen, Users, Calendar } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';
import type { PaginatedResult, Enrollment } from '@/types';
import { EnrollmentForm } from '@/components/enrollments/EnrollmentForm';

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateStr));
}

type CourseGroup = {
  courseId: string;
  courseName: string;
  startDate: string | null;
  enrollments: Enrollment[];
};

export default function EnrollmentsPage() {
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['enrollments', 'all'],
    queryFn: () =>
      api.get<PaginatedResult<Enrollment>>(`/enrollments?limit=200`).then((r) => r.data),
  });

  // Agrupar por curso + fecha
  const groups: CourseGroup[] = [];
  const seen = new Map<string, CourseGroup>();

  for (const enrollment of data?.data ?? []) {
    const key = `${enrollment.course?.id}__${enrollment.course?.startDate ?? 'nodate'}`;
    if (!seen.has(key)) {
      const group: CourseGroup = {
        courseId: enrollment.course?.id,
        courseName: enrollment.course?.name ?? '—',
        startDate: enrollment.course?.startDate ?? null,
        enrollments: [],
      };
      seen.set(key, group);
      groups.push(group);
    }
    seen.get(key)!.enrollments.push(enrollment);
  }

  // Ordenar por fecha ascendente, sin fecha al final
  groups.sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inscripciones</h1>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Nueva inscripción
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400">Cargando...</div>
      ) : groups.length === 0 ? (
        <div className="text-sm text-gray-400">Sin inscripciones</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div
              key={`${group.courseId}__${group.startDate}`}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4"
            >
              {/* Cabecera tarjeta */}
              <div className="space-y-1">
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <h2 className="text-sm font-semibold text-gray-900 leading-snug">{group.courseName}</h2>
                </div>
                {group.startDate ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 pl-6">
                    <Calendar className="h-3 w-3" />
                    {formatDate(group.startDate)}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 pl-6">Sin fecha asignada</p>
                )}
              </div>

              {/* Alumnos */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                  <Users className="h-3.5 w-3.5" />
                  {group.enrollments.length} alumno{group.enrollments.length !== 1 ? 's' : ''}
                </div>
                <ul className="divide-y divide-gray-50">
                  {group.enrollments.map((e) => (
                    <li key={e.id} className="py-1.5">
                      <Link
                        href={`/contacts/${e.contact?.id}`}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                      >
                        {e.contact?.name ?? '—'}
                      </Link>
                      {e.contact?.email && (
                        <p className="text-xs text-gray-400 truncate">{e.contact.email}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      <EnrollmentForm open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
