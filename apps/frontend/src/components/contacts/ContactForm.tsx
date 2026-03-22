'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import type { Contact } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Requerido').max(100),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  status: z.enum(['new', 'contacted', 'qualified', 'enrolled', 'lost']),
  source: z.enum(['whatsapp', 'web', 'referral', 'social', 'other']),
  courseInterest: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  contact?: Contact;
}

export function ContactForm({ open, onClose, contact }: Props) {
  const qc = useQueryClient();
  const isEdit = !!contact;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: contact
      ? {
          name: contact.name,
          email: contact.email ?? '',
          phone: contact.phone ?? '',
          status: contact.status,
          source: contact.source,
          courseInterest: contact.courseInterest ?? '',
          notes: contact.notes ?? '',
        }
      : { status: 'new', source: 'other' },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...data,
        email: data.email || undefined,
        phone: data.phone || undefined,
        courseInterest: data.courseInterest || undefined,
        notes: data.notes || undefined,
      };
      return isEdit
        ? api.patch(`/contacts/${contact!.id}`, payload)
        : api.post('/contacts', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar contacto' : 'Nuevo contacto'}
    >
      <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-4">
        {mutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            Error al guardar el contacto
          </p>
        )}

        <Field label="Nombre" required error={errors.name?.message}>
          <input {...register('name')} className={inputClass} placeholder="Carlos López" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" error={errors.email?.message}>
            <input {...register('email')} type="email" className={inputClass} placeholder="carlos@example.com" />
          </Field>
          <Field label="Teléfono" error={errors.phone?.message}>
            <input {...register('phone')} className={inputClass} placeholder="+52 55 1234 5678" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Estado" required error={errors.status?.message}>
            <select {...register('status')} className={selectClass}>
              <option value="new">Nuevo</option>
              <option value="contacted">Contactado</option>
              <option value="qualified">Calificado</option>
              <option value="enrolled">Inscrito</option>
              <option value="lost">Perdido</option>
            </select>
          </Field>
          <Field label="Origen" required error={errors.source?.message}>
            <select {...register('source')} className={selectClass}>
              <option value="whatsapp">WhatsApp</option>
              <option value="web">Web</option>
              <option value="referral">Referido</option>
              <option value="social">Redes sociales</option>
              <option value="other">Otro</option>
            </select>
          </Field>
        </div>

        <Field label="Curso de interés" error={errors.courseInterest?.message}>
          <input {...register('courseInterest')} className={inputClass} placeholder="Ej: Marketing Digital" />
        </Field>

        <Field label="Notas" error={errors.notes?.message}>
          <textarea {...register('notes')} rows={3} className={inputClass} placeholder="Notas adicionales..." />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors"
          >
            {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear contacto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
