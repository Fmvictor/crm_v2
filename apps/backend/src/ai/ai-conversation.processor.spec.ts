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
      'Te paso con alguien del equipo para que te ayude lo antes posible.',
      'ai',
      undefined,
      expect.objectContaining({ key: 'handoff:inbound-id', policy: 'handoff' }),
    );
    expect(conversationsService.setMode).toHaveBeenCalledWith(
      'conversation-id',
      ConversationAiMode.HUMAN,
      'Solicita una persona',
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
