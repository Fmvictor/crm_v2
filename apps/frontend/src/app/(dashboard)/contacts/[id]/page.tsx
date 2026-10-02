"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, Pencil, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Contact, Interaction, PaginatedResult } from "@/types";
import { ContactForm } from "@/components/contacts/ContactForm";
import { WhatsAppTemplateForm } from "@/components/whatsapp/WhatsAppTemplateForm";
import { BotConversationPanel } from "@/components/whatsapp/BotConversationPanel";

const statusLabels: Record<Contact["status"], string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  enrolled: "Inscrito",
  lost: "Perdido",
};
const statusColors: Record<Contact["status"], string> = {
  new: "bg-gray-100 text-gray-700",
  contacted: "bg-blue-100 text-blue-700",
  qualified: "bg-yellow-100 text-yellow-700",
  enrolled: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [message, setMessage] = useState("");

  const { data: contact, isLoading } = useQuery({
    queryKey: ["contacts", id],
    queryFn: () =>
      api.get<Contact>(`/contacts/${id}`).then((response) => response.data),
  });
  const { data: interactions } = useQuery({
    queryKey: ["interactions", id],
    queryFn: () =>
      api
        .get<
          PaginatedResult<Interaction>
        >(`/interactions?contactId=${id}&limit=100`)
        .then((response) => response.data),
    enabled: Boolean(id),
    refetchInterval: 10000,
  });
  const sendMessage = useMutation({
    mutationFn: (text: string) =>
      api.post("/whatsapp/send-text", { to: contact?.phone, text }),
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["interactions", id] });
    },
  });

  if (isLoading)
    return (
      <div className="p-8 text-sm text-gray-400">Cargando conversación...</div>
    );
  if (!contact)
    return (
      <div className="p-8 text-sm text-gray-400">Contacto no encontrado</div>
    );

  const messages = [...(interactions?.data ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.push("/contacts")}
          className="mt-0.5 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{contact.name}</h1>
            <span
              className={cn(
                "rounded-full px-2 py-1 text-xs font-medium",
                statusColors[contact.status],
              )}
            >
              {statusLabels[contact.status]}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
            <MessageCircle className="h-3.5 w-3.5 text-green-600" />
            {contact.phone}
          </p>
        </div>
        <button
          onClick={() => setEditOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-[560px] flex-col rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <h2 className="font-semibold text-gray-900">
              Conversación de WhatsApp
            </h2>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <p className="m-auto text-sm text-gray-400">
                Aún no hay mensajes.
              </p>
            ) : (
              messages.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex max-w-[82%] flex-col",
                    item.direction === "inbound"
                      ? "self-start"
                      : "self-end items-end",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2 text-sm shadow-sm",
                      item.direction === "inbound"
                        ? "rounded-tl-sm bg-gray-50 text-gray-700"
                        : "rounded-tr-sm bg-green-500 text-white",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{item.notes}</p>
                  </div>
                  <time className="mt-1 px-1 text-[10px] text-gray-400">
                    {formatDate(item.createdAt)}
                  </time>
                </div>
              ))
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (message.trim()) sendMessage.mutate(message.trim());
            }}
            className="flex items-end gap-2 border-t border-gray-100 p-4"
          >
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (message.trim()) sendMessage.mutate(message.trim());
                }
              }}
              rows={2}
              placeholder="Escribe un mensaje..."
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              type="submit"
              disabled={sendMessage.isPending || !message.trim()}
              className="rounded-xl bg-green-600 p-3 text-white hover:bg-green-700 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          {sendMessage.isError && (
            <p className="px-5 pb-4 text-xs text-red-600">
              No se pudo enviar el mensaje.
            </p>
          )}
        </section>

        <aside className="space-y-4">
          <BotConversationPanel contact={contact} onUseDraft={setMessage} />
          <WhatsAppTemplateForm
            contactId={contact.id}
            phone={contact.phone ?? ""}
          />
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              Pipeline
            </h2>
            <p className="text-sm text-gray-500">
              Etapa actual:{" "}
              <span className="font-medium text-gray-900">
                {statusLabels[contact.status]}
              </span>
            </p>
            {contact.notes && (
              <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-600">
                {contact.notes}
              </p>
            )}
          </div>
        </aside>
      </div>

      <ContactForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        contact={contact}
      />
    </div>
  );
}
