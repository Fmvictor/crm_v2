'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import type { Course } from '@/types';

// Form keeps numeric fields as strings (HTML inputs always return strings)
const schema = z.object({
  name: z.string().min(1, 'Requerido').max(150),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  price: z.string().optional(),
  durationHours: z.string().optional(),
  modality: z.enum(['online', 'in_person', 'hybrid']),
  status: z.enum(['draft', 'active', 'archived']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  maxStudents: z.string().optional(),
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

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: course
        ? {
            name: course.name,
            description: course.description ?? '',
            category: course.category ?? '',
            price: course.price != null ? String(course.price) : '',
            durationHours: course.durationHours != null ? String(course.durationHours) : '',
            modality: course.modality,
            status: course.status,
            startDate: course.startDate?.slice(0, 10) ?? '',
            endDate: course.endDate?.slice(0, 10) ?? '',
            maxStudents: course.maxStudents != null ? String(course.maxStudents) : '',
          }
        : { modality: 'online', status: 'draft' },
    });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        name: data.name,
        modality: data.modality,
        status: data.status,
        description: data.description || undefined,
        category: data.category || undefined,
        price: data.price ? Number(data.price) : undefined,
        durationHours: data.durationHours ? Number(data.durationHours) : undefined,
        maxStudents: data.maxStudents ? Number(data.maxStudents) : undefined,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
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

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar curso' : 'Nuevo curso'} size="lg">
      <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-4">
        {mutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Error al guardar el curso</p>
        )}

        <Field label="Nombre" required error={errors.name?.message}>
          <input {...register('name')} className={inputClass} placeholder="Marketing Digital para Negocios" />
        </Field>

        <Field label="Descripción" error={errors.description?.message}>
          <textarea {...register('description')} rows={3} className={inputClass} placeholder="Descripción del curso..." />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Categoría" error={errors.category?.message}>
            <input {...register('category')} className={inputClass} placeholder="Ej: Marketing" />
          </Field>
          <Field label="Precio (MXN)" error={errors.price?.message}>
            <input {...register('price')} type="number" min={0} step="0.01" className={inputClass} placeholder="2999.99" />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Modalidad" required error={errors.modality?.message}>
            <select {...register('modality')} className={selectClass}>
              <option value="online">Online</option>
              <option value="in_person">Presencial</option>
              <option value="hybrid">Híbrido</option>
            </select>
          </Field>
          <Field label="Estado" required error={errors.status?.message}>
            <select {...register('status')} className={selectClass}>
              <option value="draft">Borrador</option>
              <option value="active">Activo</option>
              <option value="archived">Archivado</option>
            </select>
          </Field>
          <Field label="Duración (horas)" error={errors.durationHours?.message}>
            <input {...register('durationHours')} type="number" min={1} className={inputClass} placeholder="40" />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Fecha inicio" error={errors.startDate?.message}>
            <input {...register('startDate')} type="date" className={inputClass} />
          </Field>
          <Field label="Fecha fin" error={errors.endDate?.message}>
            <input {...register('endDate')} type="date" className={inputClass} />
          </Field>
          <Field label="Máx. alumnos" error={errors.maxStudents?.message}>
            <input {...register('maxStudents')} type="number" min={1} className={inputClass} placeholder="30" />
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg">
            {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear curso'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
