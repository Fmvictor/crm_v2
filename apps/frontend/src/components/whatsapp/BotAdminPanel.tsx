"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BotLearning } from "@/types";

function LearningReview({ item, onReviewed }: { item: BotLearning; onReviewed: () => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<"style" | "process">("style");
  const review = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      api.patch(`/whatsapp/bot/learnings/${item.id}`, {
        status,
        category,
        approvedText: status === "approved" ? text : undefined,
      }),
    onSuccess: onReviewed,
  });
  return (
    <div className="rounded-lg border border-gray-200 p-3 text-sm">
      <p className="text-xs font-medium text-gray-500">Respuesta manual para revisar</p>
      <p className="mt-1 whitespace-pre-wrap text-gray-800">{item.interaction?.notes ?? "Mensaje no disponible"}</p>
      <label className="mt-3 block text-xs font-medium text-gray-700">Ejemplo depurado, sin datos personales ni hechos de cursos</label>
      <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={category} onChange={(event) => setCategory(event.target.value as "style" | "process")} className="rounded-lg border border-gray-200 px-2 py-1 text-xs">
          <option value="style">Estilo</option>
          <option value="process">Proceso</option>
        </select>
        <button type="button" disabled={review.isPending || !text.trim()} onClick={() => review.mutate("approved")} className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Aprobar</button>
        <button type="button" disabled={review.isPending} onClick={() => review.mutate("rejected")} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">Descartar</button>
      </div>
      {review.isError && <p className="mt-2 text-xs text-red-600">No se pudo guardar la revisión.</p>}
    </div>
  );
}

export function BotAdminPanel() {
  const queryClient = useQueryClient();
  const { data: current } = useQuery({
    queryKey: ["bot-instructions"],
    queryFn: () => api.get<{ text: string; version: number } | null>("/whatsapp/bot/instructions").then((r) => r.data),
  });
  const { data: learnings } = useQuery({
    queryKey: ["bot-learnings"],
    queryFn: () => api.get<BotLearning[]>("/whatsapp/bot/learnings").then((r) => r.data),
  });
  const { data: config } = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => api.get<{ mode: "off" | "draft" | "auto"; paused: boolean }>("/whatsapp/bot/config").then((r) => r.data),
  });
  const toggleGlobal = useMutation({
    mutationFn: (paused: boolean) => api.patch("/whatsapp/bot/config", { paused }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-config"] }),
  });
  const [instructions, setInstructions] = useState("");
  useEffect(() => setInstructions(current?.text ?? ""), [current?.text]);
  const save = useMutation({
    mutationFn: () => api.put("/whatsapp/bot/instructions", { text: instructions }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-instructions"] }),
  });
  const pending = learnings?.filter((item) => item.status === "pending") ?? [];

  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Administración del bot">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Instrucciones del asistente</h2>
        <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
          Modo: {config?.mode ?? "apagado"}. {config?.paused ? "Pausa general activa." : "Sin pausa general."}
          <button type="button" disabled={toggleGlobal.isPending || !config} onClick={() => toggleGlobal.mutate(!config?.paused)} className="ml-3 font-semibold text-blue-700 underline disabled:opacity-40">
            {config?.paused ? "Quitar pausa general" : "Pausar todo el bot"}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Se guardan por versión. Los datos de cursos siempre se consultan en emeb.es.</p>
        <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={5000} rows={5} className="mt-3 w-full rounded-lg border border-gray-200 p-3 text-sm" placeholder="Tono, límites y criterios de derivación" />
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !instructions.trim() || instructions === (current?.text ?? "")} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Guardar versión</button>
          {current && <span className="text-xs text-gray-500">Versión {current.version}</span>}
        </div>
        {save.isError && <p className="mt-2 text-xs text-red-600">No se pudieron guardar las instrucciones.</p>}
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Aprendizaje supervisado</h2>
        <p className="mt-1 text-xs text-gray-500">Revisa respuestas humanas antes de convertirlas en ejemplos de estilo o proceso.</p>
        <div className="mt-3 max-h-96 space-y-3 overflow-y-auto">
          {pending.length === 0 ? <p className="text-sm text-gray-500">No hay propuestas pendientes.</p> : pending.slice(0, 20).map((item) => (
            <LearningReview key={item.id} item={item} onReviewed={() => queryClient.invalidateQueries({ queryKey: ["bot-learnings"] })} />
          ))}
        </div>
      </div>
    </section>
  );
}
