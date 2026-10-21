import { testConfiguration } from '../bot-config/test-configuration';
import { WhatsAppStatusService } from './whatsapp-status.service';
import { Logger } from '@nestjs/common';
import { WhatsAppService, AutomaticDelivery } from './whatsapp.service';
import {
  WhatsAppDispatchService,
  DeliveryBlockedError,
  DeliveryHistoryError,
} from './whatsapp-dispatch.service';
import { ContactsService } from '../contacts/contacts.service';
import { InteractionsService } from '../interactions/interactions.service';
import { ConversationsService } from '../conversations/conversations.service';
import { AiQueueService } from '../ai/ai-queue.service';
import { AiGuidanceService } from '../ai/ai-guidance.service';
import { ConversationMessageActor } from '../conversations/entities/conversation-message.entity';

describe('WhatsApp delivery controls', () => {
  const contacts = { findOneByPhone: jest.fn() };
  const interactions = { createSystemInteraction: jest.fn() };
  const conversations = {
    findOrCreate: jest.fn(),
    findOne: jest.fn(),
    setMode: jest.fn(),
    recordMessage: jest.fn(),
    canAiReply: jest.fn(),
    withConversationLock: jest.fn(),
  };
  const guidance = { isPaused: jest.fn(), captureManualResponse: jest.fn() };
  const dispatches = { deliver: jest.fn(), recorded: jest.fn() };
  const automatic: AutomaticDelivery = {
    key: 'reply:inbound',
    conversationId: 'conversation',
    inboundMessageId: 'inbound',
    policy: 'reply',
  };
  const env = { ...process.env };
  let service: WhatsAppService;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    process.env.AI_RELIABLE_DELIVERY_ENABLED = 'true';
    process.env.AI_WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_API_TOKEN = 'synthetic-test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'synthetic-account';
    contacts.findOneByPhone.mockResolvedValue({ id: 'contact' });
    conversations.findOrCreate.mockResolvedValue({ id: 'conversation' });
    conversations.findOne.mockResolvedValue({
      id: 'conversation',
      externalContactKey: '000000001',
      status: 'open',
      aiMode: 'auto',
    });
    conversations.canAiReply.mockResolvedValue(true);
    conversations.withConversationLock.mockImplementation(
      (_id: string, callback: () => Promise<void>) => callback(),
    );
    interactions.createSystemInteraction.mockResolvedValue({
      id: 'interaction',
    });
    dispatches.deliver.mockResolvedValue('provider-test-id');
    service = new WhatsAppService(
      contacts as unknown as ContactsService,
      interactions as unknown as InteractionsService,
      conversations as unknown as ConversationsService,
      {} as AiQueueService,
      guidance as unknown as AiGuidanceService,
      dispatches as unknown as WhatsAppDispatchService,
      { record: jest.fn() } as unknown as WhatsAppStatusService,
      testConfiguration(),
    );
  });
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('takes human control before attempting a manual send', async () => {
    await service.sendText(
      '000000001',
      'Respuesta sintética',
      ConversationMessageActor.AGENT,
    );
    expect(conversations.setMode.mock.invocationCallOrder[0]).toBeLessThan(
      dispatches.deliver.mock.invocationCallOrder[0],
    );
    expect(interactions.createSystemInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ externalMessageId: 'provider-test-id' }),
    );
  });
  it('checks a human takeover again under the conversation lock', async () => {
    conversations.canAiReply.mockResolvedValue(false);
    await expect(
      service.sendText(
        '000000001',
        'Respuesta sintética',
        ConversationMessageActor.AI,
        undefined,
        automatic,
      ),
    ).rejects.toBeInstanceOf(DeliveryBlockedError);
    expect(dispatches.deliver).not.toHaveBeenCalled();
  });
  it('checks global pause at the last delivery boundary', async () => {
    guidance.isPaused.mockResolvedValue(true);
    await expect(
      service.sendText(
        '000000001',
        'Respuesta sintética',
        ConversationMessageActor.AI,
        undefined,
        automatic,
      ),
    ).rejects.toBeInstanceOf(DeliveryBlockedError);
    expect(dispatches.deliver).not.toHaveBeenCalled();
  });
  it('suppresses a late handoff notice after an operator takes over', async () => {
    conversations.findOne.mockResolvedValue({
      status: 'open',
      aiMode: 'human',
      handoffReason: 'Respuesta manual del equipo',
      lastInboundAt: new Date(),
      messages: [{ id: 'inbound' }],
    });
    await expect(
      service.sendText(
        '000000001',
        'Te paso con el equipo',
        ConversationMessageActor.AI,
        undefined,
        {
          ...automatic,
          policy: 'handoff',
          handoffReason: 'Solicita una persona',
        },
      ),
    ).rejects.toBeInstanceOf(DeliveryBlockedError);
    expect(dispatches.deliver).not.toHaveBeenCalled();
  });
  it('does not hide a history failure after Meta accepts a message', async () => {
    conversations.recordMessage.mockRejectedValue(
      new Error('database write failed'),
    );
    await expect(
      service.sendText(
        '000000001',
        'Respuesta sintética',
        ConversationMessageActor.AI,
        undefined,
        automatic,
      ),
    ).rejects.toBeInstanceOf(DeliveryHistoryError);
    expect(dispatches.recorded).not.toHaveBeenCalled();
  });
  it('uses the language actually approved by Meta for a configured follow-up', async () => {
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_D1 = 'synthetic_followup';
    jest
      .spyOn(service, 'getTemplates')
      .mockResolvedValue([
        { name: 'synthetic_followup', status: 'APPROVED', language: 'en' },
      ]);
    const send = jest
      .spyOn(service, 'sendTemplate')
      .mockResolvedValue(undefined);
    await service.sendConfiguredFollowUp({
      id: 'conversation',
      externalContactKey: '000000001',
      followUpStep: 0,
      nextFollowUpAt: new Date(),
      language: 'es',
      contact: { phone: 'different-contact-phone', name: 'Synthetic' },
    } as never);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'synthetic_followup',
        to: '000000001',
        languageCode: 'en',
      }),
      ConversationMessageActor.SYSTEM,
      undefined,
      expect.objectContaining({ policy: 'followup' }),
    );
  });
  it('does not choose another template or guess among multiple languages', async () => {
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_D1 = 'synthetic_followup';
    jest.spyOn(service, 'getTemplates').mockResolvedValue([
      { name: 'synthetic_followup', status: 'APPROVED', language: 'en' },
      { name: 'synthetic_followup', status: 'APPROVED', language: 'fr' },
    ]);
    const send = jest
      .spyOn(service, 'sendTemplate')
      .mockResolvedValue(undefined);
    await expect(
      service.sendConfiguredFollowUp({
        id: 'conversation',
        externalContactKey: '000000001',
        followUpStep: 0,
        language: 'es',
        contact: { phone: 'different-contact-phone', name: 'Synthetic' },
      } as never),
    ).rejects.toThrow('Meta rechazó');
    expect(send).not.toHaveBeenCalled();
  });
  it('does not claim success when credentials are absent', async () => {
    delete process.env.WHATSAPP_API_TOKEN;
    await expect(
      service.sendText('000000001', 'Respuesta sintética'),
    ).rejects.toThrow('Meta rechazó');
    expect(dispatches.deliver).not.toHaveBeenCalled();
  });
});
