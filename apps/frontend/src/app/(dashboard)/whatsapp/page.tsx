"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Interaction, PaginatedResult } from "@/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function WhatsAppPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["interactions", "whatsapp-inbox"],
    queryFn: () =>
      api
        .get<PaginatedResult<Interaction>>("/interactions?limit=100")
        .then((response) => response.data),
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-green-600">Inbox</p>
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
        <p className="mt-1 text-sm text-gray-500">
          Mensajes entrantes y salientes registrados desde WhatsApp Cloud API.
        </p>
      </div>
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">
            Cargando mensajes...
          </div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            No hay mensajes de WhatsApp.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data?.data.map((item) => (
              <Link
                key={item.id}
                href={`/contacts/${item.contactId}`}
                className="flex gap-4 p-5 hover:bg-gray-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="truncate text-sm font-semibold text-gray-900">
                      {item.contact?.name ?? "Contacto"}
                    </h2>
                    <time className="shrink-0 text-xs text-gray-400">
                      {formatDate(item.createdAt)}
                    </time>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        item.direction === "inbound"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-green-50 text-green-700",
                      )}
                    >
                      {item.direction === "inbound" ? "Entrante" : "Saliente"}
                    </span>
                    <span className="truncate text-sm text-gray-500">
                      {item.notes}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
