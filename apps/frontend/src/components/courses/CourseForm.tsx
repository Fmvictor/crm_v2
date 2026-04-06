'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass } from '@/components/ui/Field';
import type { Course } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Requerido').max(150),
  startDate: z.string().optional(),
  durationDays: z.string().optional(),
  price: z.string().optional(),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  course?: Course;
}

export function CourseForm({ open, onClose, course }: Props) {
  const qc = useQueryClient();
  const isEdit = !!course;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset(course
        ? {
            name: course.name,
            startDate: course.startDate?.slice(0, 10) ?? '',
            durationDays: course.durationDays != null ? String(course.durationDays) : '',
            price: course.price != null ? String(course.price) : '',
            description: course.description ?? '',
          }
        : { name: '', startDate: '', durationDays: '', price: '', description: '' }
      );
    }
  }, [open, course, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        name: data.name,
        startDate: data.startDate || undefined,
        durationDays: data.durationDays ? Number(data.durationDays) : undefined,
        price: data.price ? Number(data.price) : undefined,
        description: data.description || undefined,
        status: 'active',
        modality: 'online',
      };
      return isEdit
        ? api.patch(`/courses/${course!.id}`, payload)
        : api.post('/courses', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      reset();
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/courses/${course!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar curso' : 'Nuevo curso'}>
      <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-4">
        {mutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Error al guardar el curso</p>
        )}

        <Field label="Nombre del curso" required error={errors.name?.message}>
          <input {...register('name')} className={inputClass} placeholder="Ej: Marketing Digital" />
        </Field>

        <Field label="Fecha de inicio" error={errors.startDate?.message}>
          <input {...register('startDate')} type="date" className={inputClass} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Duración (días)" error={errors.durationDays?.message}>
            <input {...register('durationDays')} type="number" min={1} className={inputClass} placeholder="30" />
          </Field>
          <Field label="Precio (€)" error={errors.price?.message}>
            <input {...register('price')} type="number" min={0} step="0.01" className={inputClass} placeholder="299.00" />
          </Field>
        </div>

        <Field label="Notas" error={errors.description?.message}>
          <textarea {...register('description')} rows={4} className={inputClass} placeholder="Información adicional del curso..." />
        </Field>

        <div className="flex items-center justify-between pt-2">
          {isEdit && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          )}
          {isEdit && confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600 font-medium">¿Eliminar este curso?</span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          )}
          {!isEdit && <div />}
          <div className="flex gap-3 ml-auto">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg">
              {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear curso'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
