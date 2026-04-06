'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, BookOpen, Users, Calendar, UserPlus } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';
import { EnrollmentForm } from '@/components/enrollments/EnrollmentForm';

interface SessionStudent {
  name: string;
  email: string | null;
  contactId: string;
  stripePaymentId: string;
  enrolledAt: string;
}

interface CourseSession {
  id: string;
  courseId: string;
  courseName: string;
  startDate: string | null;
  students: SessionStudent[];
  createdAt: string;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateStr));
}

export default function EnrollmentsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>();

  function openForCourse(courseId?: string) {
    setSelectedCourseId(courseId);
    setFormOpen(true);
  }

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['course-sessions'],
    queryFn: () => api.get<CourseSession[]>('/webhooks/course-sessions').then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inscripciones</h1>
        <button
          onClick={() => openForCourse(undefined)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Nueva inscripción
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400">Cargando...</div>
      ) : sessions.length === 0 ? (
        <div className="text-sm text-gray-400">Sin inscripciones</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <BookOpen className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <h2 className="text-sm font-semibold text-gray-900 leading-snug">{session.courseName}</h2>
                  </div>
                  {session.startDate ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 pl-6">
                      <Calendar className="h-3 w-3" />
                      {formatDate(session.startDate)}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 pl-6">Sin fecha asignada</p>
                  )}
                </div>
                <button
                  onClick={() => openForCourse(session.courseId)}
                  title="Añadir alumno a este curso"
                  className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Añadir
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                  <Users className="h-3.5 w-3.5" />
                  {session.students.length} alumno{session.students.length !== 1 ? 's' : ''}
                </div>
                <ul className="divide-y divide-gray-50">
                  {session.students.map((student) => (
                    <li key={student.stripePaymentId} className="py-1.5">
                      <Link
                        href={`/contacts/${student.contactId}`}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                      >
                        {student.name}
                      </Link>
                      {student.email && (
                        <p className="text-xs text-gray-400 truncate">{student.email}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      <EnrollmentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        preselectedCourseId={selectedCourseId}
      />
    </div>
  );
}
