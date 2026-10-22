import { testConfiguration } from '../bot-config/test-configuration';
import { AiBudgetBlockedError } from './ai-usage.service';
import { ConversationsService } from '../conversations/conversations.service';
import { OpenAiService } from './openai.service';
import { WebKnowledgeService } from './web-knowledge.service';
import { AiGuidanceService } from './ai-guidance.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { DeliveryRejectedError } from '../whatsapp/whatsapp-dispatch.service';
import { AiConversationProcessor } from './ai-conversation.processor';
import { ConversationAiMode } from '../conversations/entities/conversation.entity';
import { ConversationMessageDirection } from '../conversations/entities/conversation-message.entity';
import { PipelineStage } from '../pipeline/pipeline-stage.enum';

function createProcessor(
  conversations: unknown,
  openai: unknown,
  knowledge: unknown,
  guidance: unknown,
  whatsapp: unknown,
) {
  return new AiConversationProcessor(
    conversations as ConversationsService,
    openai as OpenAiService,
    knowledge as WebKnowledgeService,
    guidance as AiGuidanceService,
    whatsapp as WhatsAppService,
    testConfiguration(),
  );
}
const alertFor = (processor: AiConversationProcessor) =>
  processor as unknown as {
    notifyHumanAttention(conversation: unknown, reason: string): Promise<void>;
  };

describe('AiConversationProcessor', () => {
  const humanAttentionPhone = '+34600000000';
  const previousHumanAttentionPhone =
    process.env.HUMAN_ATTENTION_WHATSAPP_PHONE;
  const previousHumanAttentionTemplate =
    process.env.HUMAN_ATTENTION_WHATSAPP_TEMPLATE;

  beforeEach(() => {
    process.env.HUMAN_ATTENTION_WHATSAPP_PHONE = humanAttentionPhone;
    delete process.env.HUMAN_ATTENTION_WHATSAPP_TEMPLATE;
  });

  it.each([
    ['I want to speak to a human, please.', "I'll connect"],
    ['Je souhaite parler à un conseiller de votre équipe.', 'Je vous mets'],
  ])(
    'deriva en el idioma de la petición sin depender del modelo',
    async (body, notice) => {
      const conversation = {
        aiMode: 'auto',
        status: 'open',
        pipelineStage: 'new',
        externalContactKey: 'synthetic',
        language: 'es',
      };
      const conversations = {
        findOne: jest.fn().mockResolvedValue(conversation),
        getRecentMessages: jest
          .fn()
          .mockResolvedValue([{ id: 'inbound', direction: 'inbound', body }]),
        canAiReply: jest.fn().mockResolvedValue(true),
        setMode: jest.fn(),
      };
      const model = { decide: jest.fn() };
      const whatsapp = { sendText: jest.fn() };
      await createProcessor(
        conversations,
        model,
        {},
        { isPaused: jest.fn().mockResolvedValue(false) },
        whatsapp,
      ).process('conversation', 'inbound');
      expect(model.decide).not.toHaveBeenCalled();
      expect(whatsapp.sendText).toHaveBeenNthCalledWith(
        1,
        'synthetic',
        expect.stringContaining(notice),
        'ai',
        undefined,
        expect.objectContaining({ policy: 'handoff' }),
      );
      expect(conversations.setMode.mock.invocationCallOrder[0]).toBeLessThan(
        whatsapp.sendText.mock.invocationCallOrder[0],
      );
    },
  );

  it('pasa el curso guardado y los mensajes anteriores al recuperador', async () => {
    const conversation = {
      aiMode: 'auto',
      status: 'open',
      pipelineStage: 'contacted',
      externalContactKey: 'synthetic',
      contact: { courseInterest: 'CMB1' },
    };
    const previous = [
      { id: 'first', direction: 'inbound', body: 'Me interesa CMB1' },
      { id: 'reply', direction: 'outbound', body: 'Tiene modalidad híbrida' },
    ];
    const conversations = {
      findOne: jest.fn().mockResolvedValue(conversation),
      getRecentMessages: jest
        .fn()
        .mockResolvedValue([
          ...previous,
          { id: 'last', direction: 'inbound', body: '¿Y cuánto cuesta?' },
        ]),
      canAiReply: jest.fn().mockResolvedValue(true),
      updateLead: jest.fn(),
    };
    const knowledge = {
      getContext: jest.fn().mockResolvedValue('Precio oficial'),
    };
    const model = {
      decide: jest.fn().mockResolvedValue({
        reply: 'Precio publicado',
        informationVerified: true,
        optIn: false,
        handoff: false,
      }),
    };
    await createProcessor(
      conversations,
      model,
      knowledge,
      {
        isPaused: jest.fn().mockResolvedValue(false),
        getLatestInstruction: jest.fn(),
        getApprovedExamples: jest.fn(),
      },
      { sendText: jest.fn() },
    ).process('conversation', 'last');
    expect(knowledge.getContext).toHaveBeenCalledWith('¿Y cuánto cuesta?', {
      previousMessages: previous.map(({ direction, body }) => ({
        direction,
        body,
      })),
      courseInterest: 'CMB1',
    });
  });

  it('tras reactivar excluye la derivación y la respuesta humana antiguas sin perder el curso guardado', async () => {
    const activatedAt = new Date('2026-10-22T09:35:00Z');
    const latest = {
      id: 'new-inbound',
      direction: 'inbound',
      body: '¿El CMB1 incluye campus y soporte después del curso?',
      createdAt: new Date('2026-10-22T09:36:00Z'),
    };
    const conversation = {
      aiMode: 'auto',
      status: 'open',
      aiActivatedAt: activatedAt,
      pipelineStage: 'contacted',
      externalContactKey: 'synthetic',
      contact: { courseInterest: 'CMB1' },
    };
    const conversations = {
      findOne: jest.fn().mockResolvedValue(conversation),
      getRecentMessages: jest.fn().mockResolvedValue([
        {
          direction: 'inbound',
          body: 'Quiero hablar con Víctor',
          createdAt: new Date('2026-10-22T09:20:00Z'),
        },
        {
          direction: 'outbound',
          body: 'Te paso con Víctor',
          createdAt: new Date('2026-10-22T09:21:00Z'),
        },
        {
          direction: 'outbound',
          actor: 'system',
          body: 'Atención humana activa',
          createdAt: new Date('2026-10-22T09:22:00Z'),
        },
        {
          direction: 'outbound',
          actor: 'agent',
          body: 'Soy Víctor y te atiendo personalmente',
          createdAt: new Date('2026-10-22T09:24:00Z'),
        },
        latest,
      ]),
      canAiReply: jest.fn().mockResolvedValue(true),
      updateLead: jest.fn(),
    };
    const knowledge = {
      getContext: jest
        .fn()
        .mockResolvedValue(
          'El CMB1 incluye campus y soporte durante 12 meses.',
        ),
    };
    const model = {
      decide: jest.fn().mockResolvedValue({
        reply: 'Incluye campus y soporte de 12 meses.',
        informationVerified: true,
        handoff: false,
      }),
    };
    const whatsapp = { sendText: jest.fn() };
    await createProcessor(
      conversations,
      model,
      knowledge,
      { isPaused: jest.fn().mockResolvedValue(false) },
      whatsapp,
    ).process('conversation', latest.id);
    expect(model.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ direction: 'inbound', body: latest.body }],
      }),
    );
    expect(knowledge.getContext).toHaveBeenCalledWith(latest.body, {
      previousMessages: [],
      courseInterest: 'CMB1',
    });
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      'synthetic',
      'Incluye campus y soporte de 12 meses.',
      'ai',
      undefined,
      expect.objectContaining({ policy: 'reply' }),
    );
  });

  it('conserva los turnos posteriores a la activación durante la nueva atención', async () => {
    const before = {
      direction: 'outbound',
      body: 'Atención humana antigua',
      createdAt: new Date('2026-10-22T09:20:00Z'),
    };
    const first = {
      direction: 'inbound',
      body: 'Me interesa CMB1',
      createdAt: new Date('2026-10-22T09:36:00Z'),
    };
    const reply = {
      direction: 'outbound',
      body: 'Tiene modalidad híbrida',
      createdAt: new Date('2026-10-22T09:36:10Z'),
    };
    const latest = {
      id: 'latest',
      direction: 'inbound',
      body: '¿Qué incluye?',
      createdAt: new Date('2026-10-22T09:37:00Z'),
    };
    const conversations = {
      findOne: jest.fn().mockResolvedValue({
        aiMode: 'auto',
        status: 'open',
        aiActivatedAt: new Date('2026-10-22T09:35:00Z'),
        pipelineStage: 'contacted',
      }),
      getRecentMessages: jest
        .fn()
        .mockResolvedValue([before, first, reply, latest]),
      canAiReply: jest.fn().mockResolvedValue(true),
      updateLead: jest.fn(),
    };
    const model = {
      decide: jest.fn().mockResolvedValue({
        reply: 'Respuesta con evidencia',
        handoff: false,
      }),
    };
    await createProcessor(
      conversations,
      model,
      { getContext: jest.fn().mockResolvedValue('Conocimiento autorizado') },
      { isPaused: jest.fn().mockResolvedValue(false) },
      { sendText: jest.fn() },
    ).process('conversation', latest.id);
    expect(model.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [first, reply, latest].map(({ direction, body }) => ({
          direction,
          body,
        })),
      }),
    );
  });

  it('no genera ni deriva por mensajes que preceden a la activación', async () => {
    const conversations = {
      findOne: jest.fn().mockResolvedValue({
        aiMode: 'auto',
        status: 'open',
        aiActivatedAt: new Date('2026-10-22T09:35:00Z'),
      }),
      getRecentMessages: jest.fn().mockResolvedValue([
        {
          id: 'old',
          direction: 'inbound',
          body: 'Quiero hablar con una persona',
          createdAt: new Date('2026-10-22T09:20:00Z'),
        },
      ]),
      canAiReply: jest.fn(),
      setMode: jest.fn(),
    };
    const model = { decide: jest.fn() };
    await createProcessor(conversations, model, {}, {}, {}).process(
      'conversation',
      'old',
    );
    expect(model.decide).not.toHaveBeenCalled();
    expect(conversations.setMode).not.toHaveBeenCalled();
  });

  afterAll(() => {
    if (previousHumanAttentionPhone === undefined)
      delete process.env.HUMAN_ATTENTION_WHATSAPP_PHONE;
    else
      process.env.HUMAN_ATTENTION_WHATSAPP_PHONE = previousHumanAttentionPhone;
    if (previousHumanAttentionTemplate === undefined)
      delete process.env.HUMAN_ATTENTION_WHATSAPP_TEMPLATE;
    else
      process.env.HUMAN_ATTENTION_WHATSAPP_TEMPLATE =
        previousHumanAttentionTemplate;
  });

  it('pauses before sending a handoff message, without depending on the AI provider', async () => {
    const conversation = {
      aiMode: ConversationAiMode.AUTO,
      status: 'open',
      optOutAt: null,
      pipelineStage: PipelineStage.NEW,
      externalContactKey: '34600000000',
      contact: { name: 'Lead de prueba' },
    };
    const conversationsService = {
      findOne: jest.fn().mockResolvedValue(conversation),
      getRecentMessages: jest.fn().mockResolvedValue([
        {
          id: 'inbound-id',
          direction: ConversationMessageDirection.INBOUND,
          body: 'Necesito hablar con alguien',
        },
      ]),
      updateLead: jest.fn().mockResolvedValue(conversation),
      moveStage: jest.fn().mockResolvedValue(conversation),
      setMode: jest.fn().mockResolvedValue(conversation),
      scheduleFollowUp: jest.fn().mockResolvedValue(conversation),
      canAiReply: jest.fn().mockResolvedValue(true),
    };
    const openAiService = {
      decide: jest.fn().mockResolvedValue({
        reply: '¿Quieres que te ayude con algo más?',
        language: 'es',
        stage: 'contacted',
        courseInterest: null,
        summary: null,
        optIn: false,
        optOut: false,
        handoff: true,
        handoffReason: 'Solicita una persona',
        followUpDays: null,
      }),
    };
    const webKnowledgeService = {
      getContext: jest.fn().mockResolvedValue('Contexto de prueba'),
    };
    const guidanceService = {
      isPaused: jest.fn().mockResolvedValue(false),
      getLatestInstruction: jest.fn().mockResolvedValue('Usa un tono cercano.'),
      getApprovedExamples: jest.fn().mockResolvedValue(['Claro, te ayudo.']),
    };
    const whatsAppService = {
      sendText: jest.fn().mockResolvedValue(undefined),
    };
    const processor = createProcessor(
      conversationsService,
      openAiService,
      webKnowledgeService,
      guidanceService,
      whatsAppService,
    );

    await processor.process('conversation-id');

    expect(whatsAppService.sendText).toHaveBeenCalledWith(
      '34600000000',
      expect.stringContaining(
        'Víctor atiende lunes, martes, miércoles, jueves, viernes, de 08:00 a 20:00',
      ),
      'ai',
      undefined,
      expect.objectContaining({ key: 'handoff:inbound-id', policy: 'handoff' }),
    );
    expect(conversationsService.setMode).toHaveBeenCalledWith(
      'conversation-id',
      ConversationAiMode.HUMAN,
      'Solicita una persona',
      'handoff:inbound-id',
    );
    expect(whatsAppService.sendText).toHaveBeenNthCalledWith(
      2,
      '34600000000',
      '⚠️ Un lead requiere atención humana.\nLead: Lead de prueba (…0000)\nMotivo: Solicita una persona\nAbre el Pipeline de WhatsApp en el CRM.',
      'system',
    );
    expect(
      conversationsService.setMode.mock.invocationCallOrder[0],
    ).toBeLessThan(whatsAppService.sendText.mock.invocationCallOrder[0]);
    expect(openAiService.decide).not.toHaveBeenCalled();
    expect(
      conversationsService.setMode.mock.invocationCallOrder[0],
    ).toBeLessThan(whatsAppService.sendText.mock.invocationCallOrder[1]);
  });

  it('alerts the team when the AI pauses a conversation after an opt-out request', async () => {
    const conversation = {
      aiMode: ConversationAiMode.AUTO,
      status: 'open',
      optOutAt: null,
      pipelineStage: PipelineStage.NEW,
      externalContactKey: '34600000001',
      contact: { name: 'Ana Cliente' },
    };
    const conversationsService = {
      findOne: jest.fn().mockResolvedValue(conversation),
      getRecentMessages: jest.fn().mockResolvedValue([
        {
          id: 'inbound-id',
          direction: ConversationMessageDirection.INBOUND,
          body: 'Quiero darme de baja',
        },
      ]),
      updateLead: jest.fn().mockResolvedValue(conversation),
      canAiReply: jest.fn().mockResolvedValue(true),
    };
    const whatsAppService = {
      sendText: jest.fn().mockResolvedValue(undefined),
    };
    const processor = createProcessor(
      conversationsService,
      {},
      {},
      {},
      whatsAppService,
    );

    await processor.process('conversation-id');

    expect(conversationsService.updateLead).toHaveBeenCalledWith(
      'conversation-id',
      { optOut: true },
    );
    expect(whatsAppService.sendText).toHaveBeenCalledWith(
      '34600000000',
      '⚠️ Un lead requiere atención humana.\nLead: Ana Cliente (…0001)\nMotivo: El lead ha pedido que se detengan los mensajes.\nAbre el Pipeline de WhatsApp en el CRM.',
      'system',
    );
  });

  it('does not send an alert without a valid recipient configuration', async () => {
    delete process.env.HUMAN_ATTENTION_WHATSAPP_PHONE;
    const whatsAppService = {
      sendText: jest.fn().mockResolvedValue(undefined),
    };
    const processor = createProcessor({}, {}, {}, {}, whatsAppService);

    await alertFor(processor).notifyHumanAttention(
      { externalContactKey: '34600000002', contact: { name: 'Otro lead' } },
      'Solicita una persona',
    );
    process.env.HUMAN_ATTENTION_WHATSAPP_PHONE = '000000001';
    await alertFor(processor).notifyHumanAttention(
      { externalContactKey: '34600000002', contact: { name: 'Otro lead' } },
      'Solicita una persona',
    );

    expect(whatsAppService.sendText).not.toHaveBeenCalled();
  });

  it('keeps the human handoff when the alert delivery fails', async () => {
    const conversation = {
      aiMode: ConversationAiMode.AUTO,
      status: 'open',
      optOutAt: null,
      pipelineStage: PipelineStage.NEW,
      externalContactKey: '34600000003',
      contact: { name: 'Lead con alerta fallida' },
    };
    const conversationsService = {
      findOne: jest.fn().mockResolvedValue(conversation),
      getRecentMessages: jest.fn().mockResolvedValue([
        {
          id: 'inbound-id',
          direction: ConversationMessageDirection.INBOUND,
          body: 'Necesito hablar con alguien',
        },
      ]),
      updateLead: jest.fn().mockResolvedValue(conversation),
      moveStage: jest.fn().mockResolvedValue(conversation),
      setMode: jest.fn().mockResolvedValue(conversation),
      canAiReply: jest.fn().mockResolvedValue(true),
    };
    const openAiService = {
      decide: jest.fn().mockResolvedValue({
        reply: 'Respuesta del equipo.',
        optIn: false,
        handoff: true,
        handoffReason: 'Solicita una persona',
      }),
    };
    const guidanceService = {
      isPaused: jest.fn().mockResolvedValue(false),
      getLatestInstruction: jest.fn().mockResolvedValue(''),
      getApprovedExamples: jest.fn().mockResolvedValue([]),
    };
    const whatsAppService = {
      sendText: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Fallo temporal de Meta')),
    };
    const processor = createProcessor(
      conversationsService,
      openAiService,
      { getContext: jest.fn().mockResolvedValue('') },
      guidanceService,
      whatsAppService,
    );

    await expect(processor.process('conversation-id')).resolves.toBeUndefined();

    expect(conversationsService.setMode).toHaveBeenCalledWith(
      'conversation-id',
      ConversationAiMode.HUMAN,
      'Solicita una persona',
      'handoff:inbound-id',
    );
  });

  it('keeps human mode and alerts the team even when the customer notice fails', async () => {
    const conversation = {
      aiMode: 'auto',
      status: 'open',
      pipelineStage: 'new',
      externalContactKey: '000000001',
    };
    const conversations = {
      findOne: jest.fn().mockResolvedValue(conversation),
      getRecentMessages: jest.fn().mockResolvedValue([
        {
          id: 'inbound',
          direction: 'inbound',
          body: 'Quiero hablar con una persona',
        },
      ]),
      canAiReply: jest.fn().mockResolvedValue(true),
      setMode: jest.fn(),
    };
    const whatsapp = {
      sendText: jest
        .fn()
        .mockRejectedValueOnce(new Error('network unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const processor = createProcessor(
      conversations,
      {},
      {},
      { isPaused: jest.fn().mockResolvedValue(false) },
      whatsapp,
    );
    await expect(
      processor.process('conversation', 'inbound'),
    ).resolves.toBeUndefined();
    expect(conversations.setMode).toHaveBeenCalledWith(
      'conversation',
      'human',
      'Solicita una persona',
      'handoff:inbound',
    );
    expect(whatsapp.sendText).toHaveBeenCalledTimes(2);
  });

  it('does not fall back to a second alert after an uncertain template send', async () => {
    process.env.HUMAN_ATTENTION_WHATSAPP_TEMPLATE = 'test_template';
    const whatsapp = {
      sendTemplate: jest.fn().mockRejectedValue(new Error('network timeout')),
      sendText: jest.fn(),
    };
    const processor = createProcessor({}, {}, {}, {}, whatsapp);
    await alertFor(processor).notifyHumanAttention(
      { externalContactKey: '000000001' },
      'Prueba',
    );
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('uses the configured Meta template for an alert', async () => {
    process.env.HUMAN_ATTENTION_WHATSAPP_TEMPLATE = 'alerta_atencion_humana';
    const whatsAppService = {
      sendText: jest.fn(),
      sendTemplate: jest.fn().mockResolvedValue(undefined),
    };
    const processor = createProcessor({}, {}, {}, {}, whatsAppService);

    await alertFor(processor).notifyHumanAttention(
      {
        externalContactKey: '34600000004',
        contact: { name: 'Lead plantilla' },
      },
      'Solicita una persona',
    );

    expect(whatsAppService.sendTemplate).toHaveBeenCalledWith(
      {
        to: '34600000000',
        templateName: 'alerta_atencion_humana',
        params: ['Lead plantilla', '0004', 'Solicita una persona'],
      },
      'system',
    );
    expect(whatsAppService.sendText).not.toHaveBeenCalled();
  });

  it('falls back to text while the Meta template cannot be used', async () => {
    process.env.HUMAN_ATTENTION_WHATSAPP_TEMPLATE = 'alerta_atencion_humana';
    const whatsAppService = {
      sendText: jest.fn().mockResolvedValue(undefined),
      sendTemplate: jest.fn().mockRejectedValue(new DeliveryRejectedError(400)),
    };
    const processor = createProcessor({}, {}, {}, {}, whatsAppService);

    await alertFor(processor).notifyHumanAttention(
      { externalContactKey: '34600000005', contact: { name: 'Lead respaldo' } },
      'Solicita una persona',
    );

    expect(whatsAppService.sendText).toHaveBeenCalledWith(
      '34600000000',
      '⚠️ Un lead requiere atención humana.\nLead: Lead respaldo (…0005)\nMotivo: Solicita una persona\nAbre el Pipeline de WhatsApp en el CRM.',
      'system',
    );
  });
});

describe('Derivación por control de consumo', () => {
  it('deja atención persistente sin repetir la llamada ni enviar WhatsApp', async () => {
    const conversations = {
      findOne: jest.fn().mockResolvedValue({
        aiMode: 'auto',
        status: 'open',
        pipelineStage: 'new',
        externalContactKey: 'synthetic',
      }),
      getRecentMessages: jest
        .fn()
        .mockResolvedValue([
          { id: 'inbound', direction: 'inbound', body: 'Hola' },
        ]),
      canAiReply: jest.fn().mockResolvedValue(true),
      setMode: jest.fn(),
    };
    const model = {
      decide: jest
        .fn()
        .mockRejectedValue(new AiBudgetBlockedError('Límite alcanzado')),
    };
    const whatsapp = { sendText: jest.fn(), sendTemplate: jest.fn() };
    await createProcessor(
      conversations,
      model,
      { getContext: jest.fn() },
      {
        isPaused: jest.fn().mockResolvedValue(false),
        getLatestInstruction: jest.fn(),
        getApprovedExamples: jest.fn(),
      },
      whatsapp,
    ).process('conversation', 'inbound');
    expect(model.decide).toHaveBeenCalledTimes(1);
    expect(conversations.setMode).toHaveBeenCalledWith(
      'conversation',
      'human',
      'Límite alcanzado',
      'budget:inbound',
    );
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
  });
});
