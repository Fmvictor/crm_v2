"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Field, inputClass, selectClass } from "@/components/ui/Field";
import type { Contact } from "@/types";

const schema = z.object({
  name: z.string().min(1, "Requerido").max(100),
  phone: z.string().min(7, "Introduce un teléfono válido").max(30),
  status: z.enum(["new", "contacted", "qualified", "enrolled", "lost"]),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  contact?: Contact;
}

const statusLabels: Record<FormData["status"], string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  enrolled: "Inscrito",
  lost: "Perdido",
};

export function ContactForm({ open, onClose, contact }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(contact);
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
          phone: contact.phone ?? "",
          status: contact.status,
          notes: contact.notes ?? "",
        }
      : { name: "", phone: "", status: "new", notes: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      isEdit
        ? api.patch(`/contacts/${contact!.id}`, data)
        : api.post("/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      if (contact)
        queryClient.invalidateQueries({ queryKey: ["contacts", contact.id] });
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar contacto" : "Nuevo contacto"}
    >
      <form
        onSubmit={handleSubmit((data) => mutation.mutateAsync(data))}
        className="space-y-4"
      >
        {mutation.isError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            Error al guardar el contacto
          </p>
        )}

        <Field label="Nombre" required error={errors.name?.message}>
          <input
            {...register("name")}
            className={inputClass}
            placeholder="Nombre del contacto"
          />
        </Field>

        <Field
          label="Teléfono de WhatsApp"
          required
          error={errors.phone?.message}
        >
          <input
            {...register("phone")}
            className={inputClass}
            placeholder="+34 600 123 456"
          />
        </Field>

        <Field
          label="Etapa del pipeline"
          required
          error={errors.status?.message}
        >
          <select {...register("status")} className={selectClass}>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notas" error={errors.notes?.message}>
          <textarea
            {...register("notes")}
            rows={3}
            className={inputClass}
            placeholder="Contexto útil para la conversación..."
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-300"
          >
            {isSubmitting
              ? "Guardando..."
              : isEdit
                ? "Guardar cambios"
                : "Añadir al pipeline"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
