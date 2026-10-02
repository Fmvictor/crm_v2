import { AiConversationProcessor } from './ai-conversation.processor';
import { ConversationAiMode } from '../conversations/entities/conversation.entity';
import { ConversationMessageDirection } from '../conversations/entities/conversation-message.entity';
import { PipelineStage } from '../pipeline/pipeline-stage.enum';

describe('AiConversationProcessor', () => {
  it('sends a handoff message before pausing the conversation for a person', async () => {
    const conversation = {
      aiMode: ConversationAiMode.AUTO,
      status: 'open',
      optOutAt: null,
      pipelineStage: PipelineStage.NEW,
      externalContactKey: '34600000000',
    } as any;
    const conversationsService = {
      findOne: jest.fn().mockResolvedValue(conversation),
      getRecentMessages: jest.fn().mockResolvedValue([{ direction: ConversationMessageDirection.INBOUND, body: 'Necesito hablar con alguien' }]),
      updateLead: jest.fn().mockResolvedValue(conversation),
      moveStage: jest.fn().mockResolvedValue(conversation),
      setMode: jest.fn().mockResolvedValue(conversation),
      scheduleFollowUp: jest.fn().mockResolvedValue(conversation),
    };
    const openAiService = {
      decide: jest.fn().mockResolvedValue({
        reply: '¿Quieres que te ayude con algo más?', language: 'es', stage: 'contacted', courseInterest: null, summary: null,
        optIn: false, optOut: false, handoff: true, handoffReason: 'Solicita una persona', followUpDays: null,
      }),
    };
    const webKnowledgeService = { getContext: jest.fn().mockResolvedValue('Contexto de prueba') };
    const whatsAppService = { sendText: jest.fn().mockResolvedValue(undefined) };
    const processor = new AiConversationProcessor(
      conversationsService as any,
      openAiService as any,
      webKnowledgeService as any,
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
    expect(whatsAppService.sendText.mock.invocationCallOrder[0]).toBeLessThan(
      conversationsService.setMode.mock.invocationCallOrder[0],
    );
  });
});
