/* Ejecutar desde el directorio de la imagen actual, con dist/ y node_modules/.
 * No inicia NestJS, no conecta a PostgreSQL/Redis y no instancia WhatsAppService.
 * Sólo permite GET a www.emeb.es, conteo de entrada y hasta 16 generaciones.
 * Requiere un presupuesto de evaluación explícito, separado del registro del bot.
 * Estado, envíos e historial de cada caso son sintéticos y viven en memoria.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const runtimeRequire = require('node:module').createRequire(
  path.resolve('package.json'),
);
const { Logger } = runtimeRequire('@nestjs/common');
Logger.overrideLogger(false);
const compiled = path.resolve(process.env.BOT_COMMERCIAL_EVAL_DIST || 'dist');
const { OpenAiService } = require(path.join(compiled, 'ai/openai.service.js'));
const { WebKnowledgeService } = require(
  path.join(compiled, 'ai/web-knowledge.service.js'),
);
const { AiConversationProcessor } = require(
  path.join(compiled, 'ai/ai-conversation.processor.js'),
);
if (process.env.BOT_COMMERCIAL_EVAL_ENABLED !== 'true')
  throw Error(
    'Se requiere autorización explícita para las llamadas de evaluación',
  );
const { AI_PRICING, reserveCost, usageCost, parseUsage } = require(
  path.join(compiled, 'ai/ai-pricing.js'),
);
const evaluationLimit = Number(process.env.BOT_COMMERCIAL_EVAL_BUDGET_EUR);
if (
  !Number.isFinite(evaluationLimit) ||
  evaluationLimit <= 0 ||
  evaluationLimit > 100
)
  throw Error(
    'Configurar BOT_COMMERCIAL_EVAL_BUDGET_EUR (máximo 100) para esta evaluación aislada',
  );
const reservations = new Map();
let evaluationCharged = 0;
const accounting = {
  annotateConfiguration: () => Promise.resolve(),
  assertAvailable: async () => {
    if (evaluationCharged >= evaluationLimit * 1e6)
      throw Error('Presupuesto de evaluación agotado');
  },
  reserve: async (model, input) => {
    if (model !== AI_PRICING.model) throw Error('Tarifa no verificada');
    const amount = reserveCost(input);
    if (evaluationCharged + amount > evaluationLimit * 1e6)
      throw Error('Saldo de evaluación insuficiente');
    const id = String(reservations.size);
    reservations.set(id, amount);
    evaluationCharged += amount;
    return id;
  },
  settle: async (id, payload) => {
    const usage = parseUsage(payload.usage);
    if (!usage) throw Error('Consumo de evaluación incierto');
    evaluationCharged += usageCost(usage).eurMicros - reservations.get(id);
    reservations.set(id, 0);
  },
  uncertain: async () => {},
  rejected: async (id) => {
    evaluationCharged -= reservations.get(id);
    reservations.set(id, 0);
  },
};
const cases = JSON.parse(
  fs.readFileSync(
    process.argv[2] || path.join(__dirname, 'fixtures/commercial-cases.json'),
    'utf8',
  ),
);
if (cases.length !== 18 || !process.env.OPENAI_API_KEY)
  throw Error('Precondiciones de evaluación');
const realFetch = global.fetch;
const cache = new Map();
const sources = new Map();
let unavailable = false,
  modelCalls = 0,
  activeUsage = null;
global.fetch = async (url, options) => {
  const u = new URL(String(url));
  if (
    u.origin === 'https://www.emeb.es' &&
    (!options?.method || options.method === 'GET')
  ) {
    if (unavailable) return new Response('', { status: 503 });
    if (!cache.has(u.href)) {
      const r = await realFetch(u, options);
      const html = await r.text();
      cache.set(u.href, { html, status: r.status });
      sources.set(u.href, {
        url: u.href,
        status: r.status,
        fetchedAt: new Date().toISOString(),
        sha256: createHash('sha256').update(html).digest('hex'),
      });
    }
    const snapshot = cache.get(u.href);
    return new Response(snapshot.html, { status: snapshot.status });
  }
  if (
    [
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/responses/input_tokens',
    ].includes(u.href) &&
    options?.method === 'POST'
  ) {
    if (u.pathname.endsWith('/input_tokens')) return realFetch(u, options);
    if (++modelCalls > 16) throw Error('Límite de llamadas de evaluación');
    const r = await realFetch(u, options);
    if (r.ok) activeUsage = (await r.clone().json()).usage ?? null;
    return r;
  }
  throw Error('Salida de red no permitida en evaluación');
};

(async () => {
  for (const test of cases) {
    unavailable = Boolean(test.webNoDisponible);
    activeUsage = null;
    const beforeCalls = modelCalls,
      started = Date.now();
    const documents = new Map(),
      sent = [],
      updates = [];
    let decision = null,
      webContext = '',
      followup = null,
      error = null;
    const conversation = {
      id: test.id,
      aiMode: test.modo || 'auto',
      status: 'open',
      optOutAt: null,
      pipelineStage: 'new',
      externalContactKey: 'synthetic-evaluation',
      contact: { name: 'Prueba sintética' },
    };
    const messages = [
      ...(test.historial || []),
      { direction: 'inbound', body: test.pregunta },
    ].map((m, i) => ({ ...m, id: `${test.id}-${i}` }));
    const repository = {
      findOne: async ({ where }) => documents.get(where.slug) ?? null,
      create: (doc) => ({ ...doc }),
      save: async (doc) => {
        documents.set(doc.slug, { ...doc });
        return doc;
      },
    };
    const knowledge = new WebKnowledgeService(repository);
    const model = new OpenAiService(accounting);
    const processor = new AiConversationProcessor(
      {
        findOne: async () => conversation,
        getRecentMessages: async () => messages,
        canAiReply: async () =>
          conversation.aiMode === 'auto' && !conversation.optOutAt,
        updateLead: async (_, patch) => {
          updates.push(patch);
          if (patch.optOut) {
            conversation.optOutAt = new Date();
            conversation.aiMode = 'paused';
          }
          return conversation;
        },
        moveStage: async (_, stage) => {
          conversation.pipelineStage = stage;
          return conversation;
        },
        setMode: async (_, mode) => {
          conversation.aiMode = mode;
          return conversation;
        },
        scheduleFollowUp: async (_, days) => {
          followup = days;
        },
      },
      {
        decide: async (context) => {
          decision = await model.decide(context);
          return decision;
        },
      },
      {
        getContext: async (query, conversationContext) => {
          webContext = await knowledge.getContext(query, conversationContext);
          return webContext;
        },
      },
      {
        isPaused: async () => false,
        getLatestInstruction: async () => null,
        getApprovedExamples: async () => [],
      },
      {
        sendText: async (_, text, actor) => {
          sent.push({ type: 'text', actor, text });
        },
        sendTemplate: async (request, actor) => {
          sent.push({
            type: 'template',
            actor,
            template: request.templateName,
          });
        },
      },
      require('../dist/bot-config/test-configuration').testConfiguration(),
    );
    try {
      await processor.process(test.id, messages.at(-1).id);
    } catch (err) {
      error =
        err?.name === 'TimeoutError' ? 'Tiempo agotado' : 'Error de ejecución';
    }
    const result = {
      id: test.id,
      pregunta: test.pregunta,
      criterio: test.criterio,
      durationMs: Date.now() - started,
      modelCalls: modelCalls - beforeCalls,
      sources: [...webContext.matchAll(/FUENTE: (https:\/\/[^\s]+)/g)].map(
        (m) => m[1],
      ),
      contextWarning: webContext.includes('SISTEMA:'),
      contextLength: webContext.length,
      decision,
      sent,
      mode: conversation.aiMode,
      optedOut: Boolean(conversation.optOutAt),
      followup,
      usage: activeUsage,
      error,
      contextHash: createHash('sha256').update(webContext).digest('hex'),
    };
    process.stdout.write(`CASE ${JSON.stringify(result)}\n`);
  }
  process.stdout.write(`SOURCES ${JSON.stringify([...sources.values()])}\n`);
  process.stdout.write(
    `TOTAL ${JSON.stringify({ modelCalls, cases: cases.length, liveWhatsAppSends: 0, databaseConnections: 0 })}\n`,
  );
})()
  .catch(() => {
    process.stderr.write('Evaluación detenida\n');
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = realFetch;
  });
