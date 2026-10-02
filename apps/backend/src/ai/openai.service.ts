import { Injectable, Logger } from '@nestjs/common';

export interface AiDecision {
  reply: string;
  language: string | null;
  stage: string | null;
  courseInterest: string | null;
  summary: string | null;
  optIn: boolean;
  optOut: boolean;
  handoff: boolean;
  handoffReason: string | null;
  followUpDays: number | null;
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);

  async decide(context: { messages: { direction: string; body: string }[]; webContext: string; currentStage: string }): Promise<AiDecision> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');

    const model = process.env.OPENAI_MODEL || 'gpt-6-astra';
    const input = [
      {
        role: 'developer',
        content: `Eres el asistente comercial de EMEB. Conversas por WhatsApp con leads interesados en formación de mecánica de bicicletas. Responde de forma humana, breve y útil, en el idioma del lead. Nunca inventes precios, fechas, plazas, certificaciones o condiciones. Usa únicamente el contexto web proporcionado. Para preguntas informativas sobre cursos, precios, fechas, plazas, temarios, metodología o alojamiento, responde directamente con la información disponible y pon handoff=false. Solo deriva a una persona si el lead lo pide expresamente, si se trata de un pago, matrícula, reclamación o gestión humana, o si el contexto indica que la información no se ha podido verificar. No prometas una matrícula ni confirmes pagos. La etapa actual es ${context.currentStage}.`,
      },
      {
        role: 'user',
        content: `CONTEXTO WEB ACTUAL:\n${context.webContext}\n\nHISTORIAL:\n${context.messages.map((m) => `${m.direction === 'inbound' ? 'LEAD' : 'EMEB'}: ${m.body}`).join('\n')}`,
      },
    ];

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        store: false,
        input,
        text: {
          format: {
            type: 'json_schema',
            name: 'emeb_whatsapp_decision',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['reply', 'language', 'stage', 'courseInterest', 'summary', 'optIn', 'optOut', 'handoff', 'handoffReason', 'followUpDays'],
              properties: {
                reply: { type: 'string' },
                language: { type: ['string', 'null'] },
                stage: { type: ['string', 'null'], enum: ['new', 'contacted', 'qualified', 'call_scheduled', 'offer_sent', 'deposit_requested', 'nurture', 'lost', null] },
                courseInterest: { type: ['string', 'null'] },
                summary: { type: ['string', 'null'] },
                optIn: { type: 'boolean' },
                optOut: { type: 'boolean' },
                handoff: { type: 'boolean' },
                handoffReason: { type: ['string', 'null'] },
                followUpDays: { type: ['integer', 'null'], enum: [1, 3, 7, 14, null] },
              },
            },
          },
        },
      }),
    });
    if (!response.ok) {
      this.logger.warn(`OpenAI devolvió HTTP ${response.status}`);
      throw new Error(`OpenAI API error ${response.status}`);
    }
    const payload = await response.json() as { output_text?: string; output?: Array<{ type?: string; content?: Array<{ text?: string }> }> };
    const raw = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
    if (!raw) throw new Error('OpenAI no devolvió una decisión estructurada');
    return this.normalizeDecision(JSON.parse(raw) as AiDecision, context);
  }

  private normalizeDecision(
    decision: AiDecision,
    context: { messages: { direction: string; body: string }[]; webContext: string; currentStage: string },
  ): AiDecision {
    const lastInbound = [...context.messages].reverse().find((message) => message.direction === 'inbound')?.body ?? '';
    const normalizedMessage = lastInbound.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const informationalQuestion = /precio|coste|cuanto|tarifa|importe|fecha|plaza|curso|temario|metod|aloj|hotel|certific/.test(normalizedMessage);
    const explicitHumanRequest = /persona|humano|alguien|agente|asesor|hablar con|llamad/.test(normalizedMessage);
    const humanOnlyRequest = /pago|pagar|matricul|inscrib|reclam|devoluc|factura|transferencia/.test(normalizedMessage);
    const contextUnavailable = /no se ha podido cargar|no hay copia local|pendiente de actualizacion|no se ha podido verificar/.test(
      context.webContext.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    );

    // El modelo puede ser conservador y devolver handoff=true aunque tenga
    // una fuente válida. Para información comercial verificable, el backend
    // obliga a continuar la conversación automática.
    if (decision.handoff && informationalQuestion && !explicitHumanRequest && !humanOnlyRequest && !contextUnavailable) {
      return { ...decision, handoff: false, handoffReason: null };
    }
    return decision;
  }
}
