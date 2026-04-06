'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import type { Enrollment, PaginatedResult, Contact, Course } from '@/types';

const schema = z.object({
  contactId: z.string().min(1, 'Selecciona un contacto'),
  courseId: z.string().min(1, 'Selecciona un curso'),
  status: z.enum(['pending', 'confirmed', 'active', 'completed', 'cancelled']),
  paymentStatus: z.enum(['pending', 'partial', 'paid', 'refunded']),
  amountTotal: z.string().optional(),
  amountPaid: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  enrollment?: Enrollment;
  preselectedContactId?: string;
  preselectedCourseId?: string;
}

export function EnrollmentForm({ open, onClose, enrollment, preselectedContactId, preselectedCourseId }: Props) {
  const qc = useQueryClient();
  const isEdit = !!enrollment;

  const { data: contacts } = useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: () => api.get<PaginatedResult<Contact>>('/contacts?limit=200').then((r) => r.data),
    enabled: open,
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', 'all'],
    queryFn: () => api.get<PaginatedResult<Course>>('/courses?status=active&limit=200').then((r) => r.data),
    enabled: open,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: enrollment
        ? {
            contactId: enrollment.contact.id,
            courseId: enrollment.course?.id ?? '',
            status: enrollment.status,
            paymentStatus: enrollment.paymentStatus,
            amountTotal: enrollment.amountTotal != null ? String(enrollment.amountTotal) : '',
            amountPaid: enrollment.amountPaid != null ? String(enrollment.amountPaid) : '',
            notes: enrollment.notes ?? '',
          }
        : {
            contactId: preselectedContactId ?? '',
            courseId: preselectedCourseId ?? '',
            status: 'pending',
            paymentStatus: 'pending',
          },
    });

  useEffect(() => {
    if (open && !enrollment) {
      reset({
        contactId: preselectedContactId ?? '',
        courseId: preselectedCourseId ?? '',
        status: 'pending',
        paymentStatus: 'pending',
        amountTotal: '',
        amountPaid: '',
        notes: '',
      });
    }
  }, [open, preselectedContactId, preselectedCourseId, enrollment]);

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        contactId: data.contactId,
        courseId: data.courseId,
        status: data.status,
        paymentStatus: data.paymentStatus,
        amountTotal: data.amountTotal ? Number(data.amountTotal) : undefined,
        amountPaid: data.amountPaid ? Number(data.amountPaid) : undefined,
        notes: data.notes || undefined,
      };
      return isEdit
        ? api.patch(`/enrollments/${enrollment!.id}`, payload)
        : api.post('/enrollments', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['course-sessions'] });
      reset();
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar inscripción' : 'Nueva inscripción'} size="md">
      <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-4">
        {mutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {(mutation.error as any)?.response?.data?.message ?? 'Error al guardar'}
          </p>
        )}

        <Field label="Contacto" required error={errors.contactId?.message}>
          <select {...register('contactId')} className={selectClass} disabled={isEdit}>
            <option value="">Selecciona un contacto...</option>
            {contacts?.data.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>
            ))}
          </select>
        </Field>

        <Field label="Curso" required error={errors.courseId?.message}>
          <select {...register('courseId')} className={selectClass} disabled={isEdit || !!preselectedCourseId}>
            <option value="">Selecciona un curso...</option>
            {courses?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.price ? ` · $${Number(c.price).toLocaleString('es-MX')}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Estado" required error={errors.status?.message}>
            <select {...register('status')} className={selectClass}>
              <option value="pending">Pendiente</option>
              <option value="confirmed">Confirmado</option>
              <option value="active">Activo</option>
              <option value="completed">Completado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </Field>
          <Field label="Estado de pago" required error={errors.paymentStatus?.message}>
            <select {...register('paymentStatus')} className={selectClass}>
              <option value="pending">Sin pagar</option>
              <option value="partial">Parcial</option>
              <option value="paid">Pagado</option>
              <option value="refunded">Reembolsado</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Precio total (MXN)" error={errors.amountTotal?.message}>
            <input {...register('amountTotal')} type="number" min={0} step="0.01" className={inputClass} placeholder="2999.99" />
          </Field>
          <Field label="Monto pagado (MXN)" error={errors.amountPaid?.message}>
            <input {...register('amountPaid')} type="number" min={0} step="0.01" className={inputClass} placeholder="0.00" />
          </Field>
        </div>

        <Field label="Notas" error={errors.notes?.message}>
          <textarea {...register('notes')} rows={2} className={inputClass} placeholder="Notas sobre la inscripción..." />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg">
            {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear inscripción'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
