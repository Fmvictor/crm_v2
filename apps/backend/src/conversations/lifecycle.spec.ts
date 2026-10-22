import { EntityManager, Repository } from 'typeorm';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import {
  Conversation,
  ConversationAiMode,
  ConversationStatus,
} from './entities/conversation.entity';
import { UserRole } from '../users/entities/user.entity';

describe('Cierre y reactivación voluntaria', () => {
  let state: Conversation;
  const manager = {
    query: jest.fn(),
    findOneOrFail: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const repo = {
    manager: {
      transaction: (fn: (m: EntityManager) => Promise<unknown>) =>
        fn(manager as unknown as EntityManager),
    },
  };
  const service = new ConversationsService(
    repo as unknown as Repository<Conversation>,
    {} as never,
    {} as never,
    {} as never,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    state = Object.assign(new Conversation(), {
      id: 'conversation',
      status: ConversationStatus.OPEN,
      aiMode: ConversationAiMode.AUTO,
      lifecycleVersion: 3,
      attentionPending: false,
      nextFollowUpAt: new Date(),
      pipelineStage: 'new',
      optOutAt: null,
    });
    manager.query.mockResolvedValue([]);
    manager.findOneOrFail.mockResolvedValue(state);
    manager.save.mockImplementation((...args: unknown[]) =>
      Promise.resolve(args.at(-1)),
    );
    manager.create.mockImplementation((_type, value: unknown) => value);
  });
  it('cierra sin borrar historial, detiene seguimientos y registra al operador', async () => {
    await service.setStatus(state.id, ConversationStatus.CLOSED, 3, 'operator');
    expect(state).toMatchObject({
      status: 'closed',
      aiMode: 'human',
      nextFollowUpAt: null,
      lifecycleVersion: 4,
    });
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: {
          action: 'conversation_closed',
          actorUserId: 'operator',
          lifecycleVersion: 4,
        },
      }),
    );
  });
  it('reabre manteniendo control humano y la baja', async () => {
    state.status = ConversationStatus.CLOSED;
    state.optOutAt = new Date();
    await service.setStatus(state.id, ConversationStatus.OPEN, 3, 'operator');
    expect(state).toMatchObject({
      status: 'open',
      aiMode: 'human',
      nextFollowUpAt: null,
    });
    expect(state.optOutAt).toBeInstanceOf(Date);
  });
  it('una pantalla antigua no puede cerrar mensajes nuevos', async () => {
    await expect(
      service.setStatus(state.id, ConversationStatus.CLOSED, 2, 'operator'),
    ).rejects.toThrow('ha cambiado');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('una atención pendiente debe resolverse antes del cierre', async () => {
    state.attentionPending = true;
    await expect(
      service.setStatus(state.id, ConversationStatus.CLOSED, 3, 'operator'),
    ).rejects.toThrow('atendida');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it.each([undefined, null, -1, '3', 1.1])(
    'valida la versión %s',
    async (version) => {
      await expect(
        service.setStatus(
          state.id,
          ConversationStatus.CLOSED,
          version,
          'operator',
        ),
      ).rejects.toThrow('inválidos');
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
  it('valida el estado', async () => {
    await expect(
      service.setStatus(state.id, 'lost' as ConversationStatus, 3, 'operator'),
    ).rejects.toThrow('inválidos');
  });
  it.each(['closed', 'opt-out'])(
    'impide activar IA si está %s',
    async (guard) => {
      if (guard === 'closed') state.status = ConversationStatus.CLOSED;
      else state.optOutAt = new Date();
      await expect(
        service.setMode(state.id, ConversationAiMode.AUTO),
      ).rejects.toThrow();
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
  it('la activación expresa registra su fecha y autor', async () => {
    await service.setMode(
      state.id,
      ConversationAiMode.AUTO,
      undefined,
      undefined,
      'operator',
    );
    expect(state.aiActivatedAt).toBeInstanceOf(Date);
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          action: 'ai_mode_changed',
          actorUserId: 'operator',
        }) as unknown,
      }),
    );
  });
  it('un lector no puede cerrar o reabrir', () => {
    const controller = new ConversationsController(service, {} as never);
    const request = { user: { role: UserRole.VIEWER } } as Parameters<
      ConversationsController['setStatus']
    >[1];
    expect(() =>
      controller.setStatus(state.id, request, {
        status: ConversationStatus.CLOSED,
        version: 3,
      }),
    ).toThrow('permiso');
  });
  it('un agente no puede reactivar IA', () => {
    const controller = new ConversationsController(service, {} as never);
    const request = { user: { role: UserRole.AGENT } } as Parameters<
      ConversationsController['setMode']
    >[1];
    expect(() =>
      controller.setMode(state.id, request, {
        aiMode: ConversationAiMode.AUTO,
      }),
    ).toThrow('administrador');
  });
});
