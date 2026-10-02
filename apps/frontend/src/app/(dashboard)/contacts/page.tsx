"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Pencil, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Contact, ContactStatus, PaginatedResult } from "@/types";
import { ContactForm } from "@/components/contacts/ContactForm";

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
  new: "border-gray-200 bg-gray-50",
  contacted: "border-blue-100 bg-blue-50/50",
  qualified: "border-yellow-100 bg-yellow-50/50",
  enrolled: "border-green-100 bg-green-50/50",
  lost: "border-red-100 bg-red-50/50",
};

export default function PipelinePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact>();
  const query = new URLSearchParams({
    limit: "100",
    ...(search && { search }),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["contacts", "pipeline", search],
    queryFn: () =>
      api
        .get<PaginatedResult<Contact>>(`/contacts?${query}`)
        .then((response) => response.data),
  });

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (contact: Contact, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditing(contact);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-green-600">WhatsApp CRM</p>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus className="h-4 w-4" /> Nuevo contacto
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre o teléfono..."
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-sm text-gray-400">
          Cargando pipeline...
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-5">
          {statuses.map((status) => {
            const contacts = (data?.data ?? []).filter(
              (contact) => contact.status === status,
            );
            return (
              <section
                key={status}
                className={cn(
                  "min-h-52 rounded-2xl border p-3",
                  statusColors[status],
                )}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-gray-800">
                    {statusLabels[status]}
                  </h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-500">
                    {contacts.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {contacts.map((contact) => (
                    <article
                      key={contact.id}
                      onClick={() => router.push(`/contacts/${contact.id}`)}
                      className="group cursor-pointer rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:border-green-200 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold text-gray-900">
                          {contact.name}
                        </h3>
                        <button
                          onClick={(event) => openEdit(contact, event)}
                          className="invisible rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 group-hover:visible"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <MessageCircle className="h-3 w-3 text-green-600" />
                        {contact.phone ?? "Sin teléfono"}
                      </p>
                      {contact.notes && (
                        <p className="mt-2 line-clamp-2 text-xs text-gray-500">
                          {contact.notes}
                        </p>
                      )}
                    </article>
                  ))}
                  {contacts.length === 0 && (
                    <p className="px-1 py-5 text-center text-xs text-gray-400">
                      Vacío
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ContactForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        contact={editing}
      />
    </div>
  );
}
