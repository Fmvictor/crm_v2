'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { AiUsageSummary } from '@/types';

const euro = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 }).format(value);
const rate = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 }).format(value);
const number = (value: number) => new Intl.NumberFormat('es-ES').format(value);

export function AiUsagePanel() {
  const client = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const { data, isError, isPending } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api.get<AiUsageSummary>('/ai-usage').then(response => response.data),
    refetchInterval: 15_000,
  });
  const limit = draft ?? (data ? String(data.monthlyLimitEur) : '');
  const numericLimit = Number(limit.replace(',', '.'));
  const valid = limit.trim() !== '' && Number.isFinite(numericLimit) && numericLimit >= 0 && numericLimit <= 100_000 && Math.abs(numericLimit * 100 - Math.round(numericLimit * 100)) < 0.000001;
  const save = useMutation({
    mutationFn: ({ monthlyLimitEur, version }: { monthlyLimitEur: number; version: number }) => api.patch('/ai-usage/budget', { monthlyLimitEur, version }),
    onSuccess: () => { setDraft(null); client.invalidateQueries({ queryKey: ['ai-usage'] }); client.invalidateQueries({ queryKey: ['ai-guidance'] }); },
    onError: () => { client.invalidateQueries({ queryKey: ['ai-usage'] }); },
  });
  if (isPending) return <p className="mt-4 text-xs text-gray-500">Consultando consumo de IA…</p>;
  if (isError || !data) return <p role="alert" className="mt-4 text-sm text-red-700">No se pudo consultar el consumo de IA. Actualiza antes de activar el bot.</p>;
  return <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-gray-900">Consumo de IA · {data.period}</h3>
      <span className={data.blocked ? 'text-xs font-semibold text-amber-800' : 'text-xs font-medium text-green-800'}>{data.blocked ? 'Generación bloqueada' : 'Límite activo'}</span>
    </div>
    <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
      <p><span className="block text-xs text-gray-500">Contabilizado y reservado</span><strong>{euro(data.accountedEur)}</strong> / {euro(data.monthlyLimitEur)}</p>
      <p><span className="block text-xs text-gray-500">Saldo disponible</span><strong>{euro(data.remainingEur)}</strong></p>
      <p><span className="block text-xs text-gray-500">Llamadas de generación</span><strong>{number(data.calls)}</strong> · {number(data.completed)} con consumo confirmado</p>
    </div>
    <progress aria-label="Presupuesto mensual utilizado" max={Math.max(data.monthlyLimitEur, 0.01)} value={Math.min(data.accountedEur, Math.max(data.monthlyLimitEur, 0.01))} className="mt-3 h-2 w-full accent-blue-600" />
    {data.blockedReason && <p role="status" className="mt-2 text-sm text-amber-900">{data.blockedReason} Revisa el límite y activa las respuestas de forma explícita cuando proceda.</p>}
    {data.reserved + data.uncertain > 0 && <p className="mt-2 text-xs text-amber-900">Reservas pendientes: {data.reserved}; llamadas inciertas: {data.uncertain}. Importe: {euro(data.pendingEur)} retenidos. No se supone un coste cero si falta confirmación.</p>}
    <p className="mt-2 text-xs text-gray-600">Tokens: {number(data.inputTokens)} de entrada ({number(data.cachedTokens)} de caché, {number(data.cacheWriteTokens)} de escritura) y {number(data.outputTokens)} de salida. El razonamiento está incluido en la salida.</p>
    <details className="mt-3 border-t border-gray-200 pt-2">
      <summary className="cursor-pointer text-xs font-medium text-gray-700">Cambiar límite mensual</summary>
      <form onSubmit={event => { event.preventDefault(); if (valid) save.mutate({ monthlyLimitEur: numericLimit, version: data.version }); }} className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-700">Límite en euros<input aria-label="Límite mensual en euros" type="text" inputMode="decimal" value={limit} onChange={event => setDraft(event.target.value)} className="mt-1 block w-36 rounded-lg border bg-white px-3 py-2 text-sm text-gray-900" /></label>
        <button disabled={!valid || save.isPending} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Guardar límite</button>
      </form>
      <p className="mt-2 text-xs text-gray-600">0 € detiene nuevas llamadas. Guardar nunca reactiva el bot ni cierra atenciones. El mes se calcula en hora de Madrid; después de un corte se requiere activación manual.</p>
      {save.isError && <p role="alert" className="mt-2 text-xs text-red-700">No se pudo guardar. Comprueba el importe y la versión actualizada antes de reintentar.</p>}
      {save.isSuccess && <p role="status" className="mt-2 text-xs text-green-800">Límite guardado. Se conserva el estado de pausa.</p>}
    </details>
    <p className="mt-3 text-[11px] text-gray-500">Estimación del bot, sin impuestos ni cargos de WhatsApp u otras aplicaciones. Cambio de referencia: 1 € = {rate(data.pricing.usdPerEur)} USD ({data.pricing.exchangeDate}); tarifas revisadas el {data.pricing.checkedAt}, próxima revisión antes de {data.pricing.validUntil}. No sustituye la factura del proveedor.</p>
    <p className="mt-1 text-[11px] text-gray-500">Registro desde {new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(data.trackingSince))}. No incluye consumos anteriores a la activación de este registro.</p>
  </div>;
}
