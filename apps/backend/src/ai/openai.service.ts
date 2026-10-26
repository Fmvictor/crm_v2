import {
  BotSnapshot,
  defaultConfiguration,
  topicHandoff,
} from '../bot-config/config-schema';
import { buildInstructions } from '../bot-config/prompt-builder';
import { Injectable, Logger } from '@nestjs/common';
import { AiBudgetBlockedError, AiUsageService } from './ai-usage.service';
import { AI_PRICING } from './ai-pricing';

export interface AiDecision {
  reply: string;
  language: string | null;
  stage: string | null;
  courseInterest: string | null;
  summary: string | null;
  optIn: boolean;
  optOut: boolean;
  informationVerified: boolean;
  handoff: boolean;
  handoffReason: string | null;
  followUpDays: number | null;
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);

  constructor(private readonly usage: AiUsageService) {}

  async decide(context: {
    conversationId?: string;
    configuration?: BotSnapshot;
    preview?: { revision: number; hash: string };
    sources?: { id: string; name: string; hash: string }[];
    messages: { direction: string; body: string }[];
    webContext: string;
    currentStage: string;
    instructions?: string | null;
    examples?: string[];
  }): Promise<AiDecision> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');

    const model = process.env.OPENAI_MODEL || AI_PRICING.model;
    const input = [
      {
        role: 'developer',
        content: buildInstructions(
          context.configuration?.configuration ?? {
            ...defaultConfiguration(),
            assistant:
              defaultConfiguration().assistant +
              (context.instructions
                ? `\n\nINSTRUCCIONES APROBADAS POR EL ADMINISTRADOR:\n${context.instructions}`
                : ''),
            examples: context.examples ?? [],
          },
          context.currentStage,
        ),
      },
      {
        role: 'user',
        content: `CONOCIMIENTO AUTORIZADO:\n${context.webContext}\n\nHISTORIAL:\n${context.messages.map((m) => `${m.direction === 'inbound' ? 'LEAD' : 'EMEB'}: ${m.body}`).join('\n')}`,
      },
    ];

    const request = {
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
            required: [
              'reply',
              'language',
              'stage',
              'courseInterest',
              'summary',
              'optIn',
              'optOut',
              'informationVerified',
              'handoff',
              'handoffReason',
              'followUpDays',
            ],
            properties: {
              reply: { type: 'string' },
              language: { type: ['string', 'null'] },
              stage: {
                type: ['string', 'null'],
                enum: ['new', 'contacted', 'qualified', 'lost', null],
              },
              courseInterest: { type: ['string', 'null'] },
              summary: { type: ['string', 'null'] },
              optIn: { type: 'boolean' },
              optOut: { type: 'boolean' },
              informationVerified: { type: 'boolean' },
              handoff: { type: 'boolean' },
              handoffReason: { type: ['string', 'null'] },
              followUpDays: {
                type: ['integer', 'null'],
                enum: [1, 3, 7, 14, null],
              },
            },
          },
        },
      },
    };
    const countRequest = { model, input, text: request.text };
    await this.usage.assertAvailable();
    let counted: unknown;
    try {
      const response = await fetch(
        'https://api.openai.com/v1/responses/input_tokens',
        {
          method: 'POST',
          signal: AbortSignal.timeout(15_000),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(countRequest),
        },
      );
      if (!response.ok) throw new Error('Count rejected');
      counted = ((await response.json()) as { input_tokens?: unknown })
        .input_tokens;
    } catch {
      throw new AiBudgetBlockedError(
        'No se pudo verificar el consumo de entrada; no se ha generado una respuesta.',
      );
    }
    if (typeof counted !== 'number')
      throw new AiBudgetBlockedError('Conteo de entrada inválido.');
    const reservation = await this.usage.reserve(
      model,
      counted,
      context.conversationId,
    );
    const started = performance.now();
    let payload: Record<string, unknown>;
    try {
      if (context.configuration)
        await this.usage.annotateConfiguration(
          reservation,
          context.configuration.version,
          context.sources ?? [],
          context.preview,
        );
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          ...request,
          max_output_tokens: AI_PRICING.maxOutputTokens,
          service_tier: 'default',
        }),
      });
      if (!response.ok) {
        this.logger.warn(`OpenAI devolvió HTTP ${response.status}`);
        if ([400, 401, 403, 404, 422, 429].includes(response.status)) {
          await this.usage.rejected(
            reservation,
            response.status,
            performance.now() - started,
          );
          throw new AiBudgetBlockedError(
            'OpenAI rechazó la llamada; requiere revisión.',
          );
        }
        await this.usage.uncertain(
          reservation,
          response.status,
          performance.now() - started,
        );
        throw new AiBudgetBlockedError(
          'Resultado de IA incierto; revisar sin repetir la llamada.',
        );
      }
      payload = (await response.json()) as Record<string, unknown>;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('Invalid response');
      await this.usage.settle(
        reservation,
        payload,
        response.status,
        performance.now() - started,
      );
    } catch (error) {
      // Si el proceso o el transporte fallan, nunca liberar una reserva a ciegas.
      await this.usage.uncertain(
        reservation,
        undefined,
        performance.now() - started,
      );
      if (error instanceof AiBudgetBlockedError) throw error;
      throw new AiBudgetBlockedError(
        'Resultado de IA sin confirmar; se conserva la reserva para revisión.',
      );
    }
    const result = payload as {
      output_text?: string;
      output?: Array<{ type?: string; content?: Array<{ text?: string }> }>;
    };
    const raw =
      result.output_text ??
      result.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.text)?.text;
    if (!raw)
      throw new AiBudgetBlockedError(
        'OpenAI no devolvió una decisión estructurada; consumo registrado.',
      );
    try {
      return this.normalizeDecision(JSON.parse(raw) as AiDecision, context);
    } catch {
      throw new AiBudgetBlockedError(
        'Respuesta de IA inválida; consumo registrado y atención humana requerida.',
      );
    }
  }

  private normalizeDecision(
    decision: AiDecision,
    context: {
      messages: { direction: string; body: string }[];
      webContext: string;
      currentStage: string;
      configuration?: BotSnapshot;
    },
  ): AiDecision {
    const lastInbound =
      [...context.messages]
        .reverse()
        .find((message) => message.direction === 'inbound')?.body ?? '';
    const normalizedMessage = lastInbound
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const explicitHumanRequest =
      /persona|humano|alguien|agente|asesor|hablar con|llamad/.test(
        normalizedMessage,
      );
    const humanOnlyRequest = topicHandoff(
      lastInbound,
      context.configuration?.configuration.rules ??
        defaultConfiguration().rules,
    );
    const contextUnavailable =
      /no se ha podido cargar|no hay copia local|pendiente de actualizacion|no se ha podido verificar|no hay conocimiento autorizado/.test(
        context.webContext
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''),
      );

    if (humanOnlyRequest || explicitHumanRequest || contextUnavailable) {
      return {
        ...decision,
        handoff: true,
        handoffReason: contextUnavailable
          ? 'Información comercial no verificable'
          : 'Gestión que requiere atención humana',
      };
    }

    if (
      decision.informationVerified !== true &&
      !decision.optOut &&
      !decision.handoff
    ) {
      return {
        ...decision,
        handoff: true,
        handoffReason:
          'La petición requiere información sin evidencia comercial suficiente',
      };
    }

    return decision;
  }
}
