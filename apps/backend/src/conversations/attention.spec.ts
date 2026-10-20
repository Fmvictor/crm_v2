import { Repository, EntityManager } from 'typeorm';
import { ConversationsService } from './conversations.service';
import {
  Conversation,
  ConversationAiMode,
} from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { PipelineEvent } from './entities/pipeline-event.entity';
import { KnowledgeDocument } from '../knowledge/entities/knowledge-document.entity';
import { ConversationsController } from './conversations.controller';
import { User, UserRole } from '../users/entities/user.entity';

describe('Atender una derivación conserva el control humano', () => {
  const state = Object.assign(new Conversation(), {
    id: 'conversation',
    aiMode: ConversationAiMode.HUMAN,
    attentionVersion: 2,
    attentionPending: true,
    nextFollowUpAt: null,
  });
  const manager = {
    query: jest.fn(),
    findOneOrFail: jest.fn(),
    save: jest.fn(),
  };
  const repo = {
    manager: {
      transaction: (action: (m: EntityManager) => Promise<unknown>) =>
        action(manager as unknown as EntityManager),
    },
  };
  const service = new ConversationsService(
    repo as unknown as Repository<Conversation>,
    {} as Repository<ConversationMessage>,
    {} as Repository<PipelineEvent>,
    {} as Repository<KnowledgeDocument>,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    state.aiMode = ConversationAiMode.HUMAN;
    state.attentionVersion = 2;
    state.attentionPending = true;
    manager.query.mockResolvedValue([]);
    manager.findOneOrFail.mockResolvedValue(state);
    manager.save.mockImplementation((value: Conversation) =>
      Promise.resolve(value),
    );
  });
  it('registra quién atiende y cuándo sin reactivar la IA', async () => {
    const result = await service.acknowledgeAttention(
      'conversation',
      2,
      'operator',
    );
    expect(result).toMatchObject({
      aiMode: 'human',
      attentionPending: false,
      attentionAcknowledgedBy: 'operator',
      nextFollowUpAt: null,
    });
    expect(result.attentionAcknowledgedAt).toBeInstanceOf(Date);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"resolvedBy"'),
      expect.arrayContaining(['conversation', 'operator']),
    );
  });
  it('rechaza cerrar una atención más reciente desde una pantalla antigua', async () => {
    await expect(
      service.acknowledgeAttention('conversation', 1, 'operator'),
    ).rejects.toThrow('más reciente');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it.each([undefined, null, '2', -1, 1.5])(
    'valida la versión de atención: %s',
    async (version) => {
      await expect(
        service.acknowledgeAttention('conversation', version, 'operator'),
      ).rejects.toThrow('inválida');
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
  it('no permite reactivar IA con una atención pendiente', async () => {
    await expect(
      service.setMode('conversation', ConversationAiMode.AUTO),
    ).rejects.toThrow('atendida');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('un lector no puede marcar atenciones atendidas', () => {
    const controller = new ConversationsController(service, {} as never);
    const request = {
      user: { id: 'viewer', role: UserRole.VIEWER } as User,
    } as unknown as Parameters<
      ConversationsController['acknowledgeAttention']
    >[1];
    expect(() =>
      controller.acknowledgeAttention('conversation', request, { version: 2 }),
    ).toThrow('permiso');
    expect(manager.save).not.toHaveBeenCalled();
  });
});
