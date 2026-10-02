"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { BotJob, Contact } from "@/types";

export function BotConversationPanel({
  contact,
  onUseDraft,
}: {
  contact: Contact;
  onUseDraft: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [editedMemory, setEditedMemory] = useState<string | null>(null);
  const memory = editedMemory ?? contact.botMemory ?? "";

  const { data: config } = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => api.get<{ mode: "off" | "draft" | "auto"; paused: boolean }>("/whatsapp/bot/config").then((r) => r.data),
  });
  const { data: jobs } = useQuery({
    queryKey: ["bot-jobs", contact.id],
    queryFn: () => api.get<BotJob[]>(`/whatsapp/contacts/${contact.id}/bot-jobs`).then((r) => r.data),
    refetchInterval: 5000,
  });
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      api.patch(`/whatsapp/contacts/${contact.id}/bot`, { paused }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts", contact.id] }),
  });
  const saveMemory = useMutation({
    mutationFn: () => api.patch(`/whatsapp/contacts/${contact.id}/bot-memory`, { memory }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contacts", contact.id] });
      setEditedMemory(null);
    },
  });
  const canEdit = user?.role === "admin" || user?.role === "agent";
  const drafts = jobs?.filter((job) => job.status === "draft" || job.status === "needs_human") ?? [];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm" aria-label="Asistente de IA">
      <h2 className="text-sm font-semibold text-gray-900">Asistente de IA</h2>
      <p className="mt-1 text-xs text-gray-500">
        Modo general: {config?.mode === "auto" ? "respuestas automáticas" : config?.mode === "draft" ? "solo borradores" : "apagado"}.
        {config?.paused ? " Pausa general activa." : contact.botPaused ? " Pausado para este contacto." : " Disponible para este contacto."}
      </p>
      {canEdit && (
        <button
          type="button"
          onClick={() => pause.mutate(!contact.botPaused)}
          disabled={pause.isPending}
          className="mt-3 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {contact.botPaused ? "Reactivar en este chat" : "Pausar en este chat"}
        </button>
      )}
      {pause.isError && <p className="mt-2 text-xs text-red-600">No se pudo cambiar el estado.</p>}

      {drafts.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-xs font-semibold text-gray-700">Pendientes de revisión</h3>
          {drafts.slice(0, 5).map((job) => (
            <div key={job.id} className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              <p className="font-medium">{job.status === "draft" ? "Borrador" : "Atención humana"}</p>
              <p className="mt-1 whitespace-pre-wrap">{job.answer || job.reason}</p>
              {job.sourceUrl && (
                <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-blue-600 underline">
                  Fuente: emeb.es
                </a>
              )}
              {job.status === "draft" && job.answer && canEdit && (
                <button type="button" onClick={() => onUseDraft(job.answer!)} className="mt-2 font-medium text-green-700 underline">
                  Usar en el mensaje
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-gray-100 pt-4">
        <label htmlFor={`bot-memory-${contact.id}`} className="text-xs font-semibold text-gray-700">
          Memoria de este contacto
        </label>
        <textarea
          id={`bot-memory-${contact.id}`}
          value={memory}
          onChange={(event) => setEditedMemory(event.target.value)}
          maxLength={700}
          readOnly={!canEdit}
          rows={3}
          className="mt-2 w-full resize-y rounded-lg border border-gray-200 p-2 text-xs text-gray-700"
          placeholder="Preferencias útiles del cliente"
        />
        {canEdit && (
          <button
            type="button"
            onClick={() => saveMemory.mutate()}
            disabled={saveMemory.isPending || memory === (contact.botMemory ?? "")}
            className="mt-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            Guardar memoria
          </button>
        )}
        {saveMemory.isError && <p className="mt-2 text-xs text-red-600">No se pudo guardar la memoria.</p>}
      </div>
    </section>
  );
}
