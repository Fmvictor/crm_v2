'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Pencil, Clock, BookOpen } from 'lucide-react';
import api from '@/lib/api';
import type { PaginatedResult, Course } from '@/types';
import { CourseForm } from '@/components/courses/CourseForm';

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

  const courses = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cursos</h1>
          {!isLoading && (
            <p className="text-sm text-gray-400 mt-0.5">{courses.length} curso{courses.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> Nuevo curso
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-400">No hay cursos todavía</p>
          <p className="text-xs text-gray-300 mt-1">Crea el primero con el botón de arriba</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900 leading-tight">{course.name}</h2>
                <button
                  onClick={(e) => openEdit(course, e)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-4">
                {course.durationDays != null && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <Clock className="h-3.5 w-3.5 text-gray-400" />
                    <span>{course.durationDays} día{course.durationDays !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {course.price != null && (
                  <span className="ml-auto text-lg font-bold text-gray-900">
                    {Number(course.price).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}
                  </span>
                )}
              </div>

              {course.description && (
                <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">{course.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <CourseForm open={formOpen} onClose={() => setFormOpen(false)} course={editing} />
    </div>
  );
}
