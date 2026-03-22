'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PaginatedResult, Course, CourseStatus } from '@/types';
import { CourseForm } from '@/components/courses/CourseForm';

const statusColors: Record<CourseStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  archived: 'bg-red-100 text-red-700',
};
const statusLabels: Record<CourseStatus, string> = {
  draft: 'Borrador', active: 'Activo', archived: 'Archivado',
};
const modalityLabels: Record<string, string> = {
  online: 'Online', in_person: 'Presencial', hybrid: 'Híbrido',
};

export default function CoursesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Course | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get<PaginatedResult<Course>>('/courses?limit=50').then((r) => r.data),
  });

  const openCreate = () => { setEditing(undefined); setFormOpen(true); };
  const openEdit = (c: Course, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(c);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cursos</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Nuevo curso
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(data?.data ?? []).map((course) => (
            <div key={course.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900 leading-tight">{course.name}</h2>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn('text-xs font-medium px-2 py-1 rounded-full', statusColors[course.status])}>
                    {statusLabels[course.status]}
                  </span>
                  <button
                    onClick={(e) => openEdit(course, e)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {course.category && <p className="text-xs text-gray-500">{course.category}</p>}
              {course.description && (
                <p className="text-xs text-gray-400 line-clamp-2">{course.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                <span>{modalityLabels[course.modality]}</span>
                {course.durationHours && <span>{course.durationHours}h</span>}
                {course.maxStudents && <span>Máx {course.maxStudents}</span>}
                {course.price && (
                  <span className="ml-auto font-semibold text-gray-700">
                    ${Number(course.price).toLocaleString('es-MX')}
                  </span>
                )}
              </div>
              {(course.startDate || course.endDate) && (
                <p className="text-xs text-gray-400">
                  {course.startDate?.slice(0, 10)} {course.endDate && `→ ${course.endDate.slice(0, 10)}`}
                </p>
              )}
            </div>
          ))}
          {(data?.data ?? []).length === 0 && (
            <p className="text-sm text-gray-400 col-span-full">Sin cursos registrados</p>
          )}
        </div>
      )}

      <CourseForm open={formOpen} onClose={() => setFormOpen(false)} course={editing} />
    </div>
  );
}
