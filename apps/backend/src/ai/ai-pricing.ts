// Tarifas Standard y cambio de referencia contrastados el 22-10-2026.
// El resultado es una estimación del bot, sin impuestos ni cargos de otros sistemas.
export const AI_PRICING = {
  model: 'gpt-6.1-sol',
  checkedAt: '2026-10-22',
  validUntil: '2026-11-20',
  usdPerEur: 1.1215,
  exchangeDate: '2026-10-20',
  maxOutputTokens: 8192,
  source: 'https://developers.openai.com/api/docs/models/gpt-6.1-sol',
  exchangeSource:
    'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
} as const;

export interface ReportedUsage {
  input: number;
  cached: number;
  cacheWrites: number;
  output: number;
  reasoning: number;
}
const integer = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseUsage(value: unknown): ReportedUsage | null {
  if (
    !record(value) ||
    !integer(value.input_tokens) ||
    !integer(value.output_tokens)
  )
    return null;
  const inputDetails = record(value.input_tokens_details)
    ? value.input_tokens_details
    : {};
  const outputDetails = record(value.output_tokens_details)
    ? value.output_tokens_details
    : {};
  const cached = inputDetails.cached_tokens ?? 0;
  const cacheWrites = inputDetails.cache_write_tokens ?? 0;
  const reasoning = outputDetails.reasoning_tokens ?? 0;
  if (
    !integer(cached) ||
    !integer(cacheWrites) ||
    !integer(reasoning) ||
    cached + cacheWrites > value.input_tokens ||
    reasoning > value.output_tokens ||
    value.input_tokens > 1_050_000 ||
    value.output_tokens > 128_000
  )
    return null;
  return {
    input: value.input_tokens,
    cached,
    cacheWrites,
    output: value.output_tokens,
    reasoning,
  };
}

export function usageCost(usage: ReportedUsage): {
  usdMicros: number;
  eurMicros: number;
} {
  // Nanodólares enteros, incluyendo escrituras de caché y contexto largo.
  const long = usage.input > 272_000;
  const nanos =
    BigInt(usage.input - usage.cached - usage.cacheWrites) *
      BigInt(long ? 4_000 : 2_000) +
    BigInt(usage.cached) * BigInt(long ? 200 : 100) +
    BigInt(usage.cacheWrites) * BigInt(long ? 5_000 : 2_500) +
    BigInt(usage.output) * BigInt(long ? 15_000 : 10_000);
  const ceil = (value: bigint, divisor: bigint) =>
    (value + divisor - 1n) / divisor;
  return {
    usdMicros: Number(ceil(nanos, 1000n)),
    eurMicros: Number(ceil(nanos * 10_000n, 1000n * 11_215n)),
  };
}

export function reserveCost(input: number): number {
  // Reservar todas las entradas a la tarifa más alta (escritura de caché).
  return usageCost({
    input,
    cached: 0,
    cacheWrites: input,
    output: AI_PRICING.maxOutputTokens,
    reasoning: 0,
  }).eurMicros;
}
