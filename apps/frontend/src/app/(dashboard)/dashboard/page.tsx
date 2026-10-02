"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, Users } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  Contact,
  ContactStatus,
  Interaction,
  PaginatedResult,
} from "@/types";

const statuses: ContactStatus[] = [
  "new",
  "contacted",
  "qualified",
  "enrolled",
  "lost",
];
const statusLabels: Record<ContactStatus, string> = {
  new: "Nuevos",
  contacted: "Contactados",
  qualified: "Calificados",
  enrolled: "Inscritos",
  lost: "Perdidos",
};
const statusColors: Record<ContactStatus, string> = {
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

export default function DashboardPage() {
  const { data: contacts } = useQuery({
    queryKey: ["contacts", "summary"],
    queryFn: () =>
      api
        .get<PaginatedResult<Contact>>("/contacts?limit=100")
        .then((response) => response.data),
  });
  const { data: interactions } = useQuery({
    queryKey: ["interactions", "summary"],
    queryFn: () =>
      api
        .get<PaginatedResult<Interaction>>("/interactions?limit=8")
        .then((response) => response.data),
  });
  const contactList = contacts?.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-green-600">WhatsApp CRM</p>
        <h1 className="text-2xl font-bold text-gray-900">Resumen</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gestiona conversaciones y mueve cada contacto por el pipeline.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-green-600">
            <Users className="h-5 w-5" />
            <span className="text-sm font-medium">Contactos</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {contacts?.total ?? 0}
          </p>
          <Link
            href="/contacts"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-600"
          >
            Ver pipeline <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-green-600">
            <MessageCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Mensajes registrados</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {interactions?.total ?? 0}
          </p>
          <Link
            href="/whatsapp"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-600"
          >
            Abrir WhatsApp <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
          <p className="mb-3 text-sm font-medium text-gray-500">
            Pipeline actual
          </p>
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <span
                key={status}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  statusColors[status],
                )}
              >
                {statusLabels[status]}:{" "}
                {
                  contactList.filter((contact) => contact.status === status)
                    .length
                }
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Últimos mensajes</h2>
          <Link
            href="/whatsapp"
            className="text-xs font-semibold text-green-600"
          >
            Ver todos
          </Link>
        </div>
        {(interactions?.data ?? []).length === 0 ? (
          <p className="p-8 text-sm text-gray-400">Todavía no hay mensajes.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {interactions?.data.map((item) => (
              <Link
                key={item.id}
                href={`/contacts/${item.contactId}`}
                className="flex items-start gap-3 px-6 py-4 hover:bg-gray-50"
              >
                <span className="mt-0.5 rounded-full bg-green-50 p-2 text-green-600">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      {item.contact?.name ?? "Contacto"}
                    </span>
                    <time className="shrink-0 text-[11px] text-gray-400">
                      {formatDate(item.createdAt)}
                    </time>
                  </span>
                  <span className="mt-1 block truncate text-sm text-gray-500">
                    {item.notes}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
