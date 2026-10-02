import { AiConversationProcessor } from './ai-conversation.processor';
import { ConversationAiMode } from '../conversations/entities/conversation.entity';
import { ConversationMessageDirection } from '../conversations/entities/conversation-message.entity';
import { PipelineStage } from '../pipeline/pipeline-stage.enum';

describe('AiConversationProcessor', () => {
  const humanAttentionPhone = '+34600000000';
  const previousHumanAttentionPhone =
    process.env.HUMAN_ATTENTION_WHATSAPP_PHONE;

  beforeEach(() => {
    process.env.HUMAN_ATTENTION_WHATSAPP_PHONE = humanAttentionPhone;
  });

  afterAll(() => {
    if (previousHumanAttentionPhone === undefined)
      delete process.env.HUMAN_ATTENTION_WHATSAPP_PHONE;
    else
      process.env.HUMAN_ATTENTION_WHATSAPP_PHONE = previousHumanAttentionPhone;
  });

  it('sends a handoff message before pausing the conversation for a person', async () => {
    const conversation = {
      aiMode: ConversationAiMode.AUTO,
      status: 'open',
      optOutAt: null,
      pipelineStage: PipelineStage.NEW,
      externalContactKey: '34600000000',
      contact: { name: 'Lead de prueba' },
    } as any;
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
    const processor = new AiConversationProcessor(
      conversationsService as any,
      openAiService as any,
      webKnowledgeService as any,
      guidanceService as any,
      whatsAppService as any,
    );

    await processor.process('conversation-id');

    expect(whatsAppService.sendText).toHaveBeenCalledWith(
      '34600000000',
      'Te paso con alguien del equipo para que te ayude lo antes posible.',
      'ai',
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
    expect(whatsAppService.sendText.mock.invocationCallOrder[0]).toBeLessThan(
      conversationsService.setMode.mock.invocationCallOrder[0],
    );
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
    } as any;
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
    };
    const whatsAppService = {
      sendText: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new AiConversationProcessor(
      conversationsService as any,
      {} as any,
      {} as any,
      {} as any,
      whatsAppService as any,
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
    const processor = new AiConversationProcessor(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      whatsAppService as any,
    );

    await (processor as any).notifyHumanAttention(
      { externalContactKey: '34600000002', contact: { name: 'Otro lead' } },
      'Solicita una persona',
    );
    process.env.HUMAN_ATTENTION_WHATSAPP_PHONE = '617668489';
    await (processor as any).notifyHumanAttention(
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
    } as any;
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
    const processor = new AiConversationProcessor(
      conversationsService as any,
      openAiService as any,
      { getContext: jest.fn().mockResolvedValue('') } as any,
      guidanceService as any,
      whatsAppService as any,
    );

    await expect(processor.process('conversation-id')).resolves.toBeUndefined();

    expect(conversationsService.setMode).toHaveBeenCalledWith(
      'conversation-id',
      ConversationAiMode.HUMAN,
      'Solicita una persona',
    );
  });
});
