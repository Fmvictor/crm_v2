'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Field, inputClass, selectClass } from '@/components/ui/Field';

const schema = z.object({
  type: z.enum(['call', 'whatsapp', 'email', 'note', 'meeting']),
  direction: z.enum(['inbound', 'outbound']).optional(),
  notes: z.string().min(1, 'Requerido'),
  durationMinutes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  contactId: string;
}

const typeLabels = {
  call: 'Llamada', whatsapp: 'WhatsApp', email: 'Email',
  note: 'Nota', meeting: 'Reunión',
};

export function InteractionForm({ open, onClose, contactId }: Props) {
  const qc = useQueryClient();

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: { type: 'note', direction: 'outbound' },
    });

  const type = watch('type');
  const showDirection = ['call', 'whatsapp', 'email'].includes(type);
  const showDuration = ['call', 'meeting'].includes(type);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      api.post('/interactions', {
        type: data.type,
        notes: data.notes,
        contactId,
        direction: showDirection ? data.direction : undefined,
        durationMinutes: data.durationMinutes ? Number(data.durationMinutes) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interactions', contactId] });
      reset();
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Registrar interacción" size="sm">
      <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-4">
        {mutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Error al guardar</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo" required error={errors.type?.message}>
            <select {...register('type')} className={selectClass}>
              {Object.entries(typeLabels).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>

          {showDirection && (
            <Field label="Dirección" error={errors.direction?.message}>
              <select {...register('direction')} className={selectClass}>
                <option value="outbound">Saliente</option>
                <option value="inbound">Entrante</option>
              </select>
            </Field>
          )}

          {showDuration && (
            <Field label="Duración (min)" error={errors.durationMinutes?.message}>
              <input {...register('durationMinutes')} type="number" min={1} className={inputClass} placeholder="30" />
            </Field>
          )}
        </div>

        <Field label="Notas" required error={errors.notes?.message}>
          <textarea {...register('notes')} rows={4} className={inputClass} placeholder="Describe la interacción..." />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg">
            {isSubmitting ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
