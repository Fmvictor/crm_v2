"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface Template {
  name: string;
  status: string;
  language: string;
}
interface Props {
  contactId: string;
  phone: string;
}

export function WhatsAppTemplateForm({ contactId, phone }: Props) {
  const queryClient = useQueryClient();
  const [selectedName, setSelectedName] = useState("");
  const [params, setParams] = useState<string[]>([""]);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["whatsapp-templates"],
    queryFn: () =>
      api.get("/whatsapp/templates").then((response) => response.data),
  });
  const selected = templates.find((template) => template.name === selectedName);
  const mutation = useMutation({
    mutationFn: () =>
      api.post("/whatsapp/send-template", {
        to: phone,
        templateName: selectedName,
        languageCode: selected?.language ?? "es",
        params: params.filter((value) => value.trim()),
      }),
    onSuccess: () => {
      setStatus("success");
      setSelectedName("");
      setParams([""]);
      queryClient.invalidateQueries({ queryKey: ["interactions", contactId] });
      setTimeout(() => setStatus("idle"), 3000);
    },
    onError: () => {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    },
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Send className="h-4 w-4 text-green-600" /> Plantilla de WhatsApp
        </h2>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase text-gray-500">
            Plantilla aprobada
          </label>
          <select
            value={selectedName}
            onChange={(event) => setSelectedName(event.target.value)}
            disabled={isLoading || mutation.isPending}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
          >
            <option value="">Selecciona una plantilla</option>
            {templates
              .filter((template) => template.status === "APPROVED")
              .map((template) => (
                <option
                  key={`${template.name}-${template.language}`}
                  value={template.name}
                >
                  {template.name} ({template.language})
                </option>
              ))}
          </select>
          {templates.length === 0 && !isLoading && (
            <p className="mt-1 text-[10px] text-orange-600">
              No se encontraron plantillas aprobadas.
            </p>
          )}
        </div>

        {selectedName && (
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase text-gray-500">
              Variables
            </label>
            {params.map((value, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={value}
                  onChange={(event) =>
                    setParams((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                  placeholder={`Valor {{${index + 1}}}`}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="button"
                  onClick={() =>
                    setParams((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="px-2 text-gray-400 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setParams((current) => [...current, ""])}
              className="text-xs font-semibold text-green-600 hover:text-green-700"
            >
              + Añadir variable
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!selectedName || !phone || mutation.isPending}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white transition-colors disabled:bg-gray-200 disabled:text-gray-400",
            status === "error"
              ? "bg-red-600"
              : "bg-green-600 hover:bg-green-700",
          )}
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === "success" ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Enviado
            </>
          ) : status === "error" ? (
            <>
              <AlertCircle className="h-4 w-4" /> Error al enviar
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> Enviar plantilla
            </>
          )}
        </button>
      </div>
    </div>
  );
}
