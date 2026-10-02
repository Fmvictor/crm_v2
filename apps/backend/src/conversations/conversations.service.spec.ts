import { ContactStatus } from '../contacts/entities/contact.entity';
import {
  ConversationAiMode,
  ConversationChannel,
} from './entities/conversation.entity';
import { PipelineStage } from '../pipeline/pipeline-stage.enum';
import { ConversationsService } from './conversations.service';

describe('ConversationsService', () => {
  it('crea conversaciones de WhatsApp pausadas hasta que un agente las active', async () => {
    const conversations = {
      findOne: jest.fn<Promise<null>, []>().mockResolvedValue(null),
      create: jest.fn(
        (value: Record<string, unknown>): Record<string, unknown> => value,
      ),
      save: jest.fn(
        (value: Record<string, unknown>): Promise<Record<string, unknown>> =>
          Promise.resolve({ id: 'conversation-id', ...value }),
      ),
      manager: { save: jest.fn((): Promise<void> => Promise.resolve()) },
    };
    const events = {
      create: jest.fn(
        (value: Record<string, unknown>): Record<string, unknown> => value,
      ),
      save: jest.fn((): Promise<void> => Promise.resolve()),
    };
    const service = new ConversationsService(
      conversations as never,
      {} as never,
      events as never,
    );

    await service.findOrCreate(
      {
        id: 'contact-id',
        status: ContactStatus.NEW,
        pipelineStage: PipelineStage.NEW,
      } as never,
      '34600000000',
    );

    expect(conversations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: ConversationChannel.WHATSAPP,
        aiMode: ConversationAiMode.PAUSED,
        pipelineStage: PipelineStage.NEW,
      }),
    );
  });
});
