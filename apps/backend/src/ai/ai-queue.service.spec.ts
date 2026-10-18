import { Logger } from '@nestjs/common';
import { AiQueueService } from './ai-queue.service';
import { AiConversationProcessor } from './ai-conversation.processor';
import { AiGuidanceService } from './ai-guidance.service';
import { ConversationsService } from '../conversations/conversations.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { ConversationAiMode } from '../conversations/entities/conversation.entity';

describe('AiQueueService follow-ups', () => {
  const conversations = {
    findDueFollowUps: jest.fn(),
    markFollowUpSent: jest.fn(),
  };
  const whatsapp = { sendConfiguredFollowUp: jest.fn() };
  const guidance = { isPaused: jest.fn() };
  let service: AiQueueService;
  let originalPhones: string | undefined;
  const due = (id: string) => ({
    id,
    aiMode: ConversationAiMode.AUTO,
    optInAt: new Date(),
    contact: { phone: '000000000' },
  });
  const processFollowUps = () =>
    (
      service as unknown as { processFollowUps(): Promise<void> }
    ).processFollowUps();

  beforeEach(() => {
    jest.resetAllMocks();
    originalPhones = process.env.AI_WHATSAPP_TEST_PHONES;
    delete process.env.AI_WHATSAPP_TEST_PHONES;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    guidance.isPaused.mockResolvedValue(false);
    conversations.findDueFollowUps.mockResolvedValue([
      due('first'),
      due('second'),
    ]);
    whatsapp.sendConfiguredFollowUp.mockResolvedValue(true);
    service = new AiQueueService(
      {} as AiConversationProcessor,
      conversations as unknown as ConversationsService,
      whatsapp as unknown as WhatsAppService,
      guidance as unknown as AiGuidanceService,
    );
  });

  afterEach(() => {
    if (originalPhones === undefined)
      delete process.env.AI_WHATSAPP_TEST_PHONES;
    else process.env.AI_WHATSAPP_TEST_PHONES = originalPhones;
    jest.restoreAllMocks();
  });

  it('contains a provider failure and continues without marking the failed send', async () => {
    whatsapp.sendConfiguredFollowUp.mockRejectedValueOnce(
      new Error('template unavailable'),
    );
    await expect(processFollowUps()).resolves.toBeUndefined();
    expect(whatsapp.sendConfiguredFollowUp).toHaveBeenCalledTimes(2);
    expect(conversations.markFollowUpSent).toHaveBeenCalledTimes(1);
    expect(conversations.markFollowUpSent).toHaveBeenCalledWith('second');
  });

  it('contains database failures and allows the next scheduled pass', async () => {
    conversations.findDueFollowUps.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(processFollowUps()).resolves.toBeUndefined();
    await processFollowUps();
    expect(whatsapp.sendConfiguredFollowUp).toHaveBeenCalledTimes(2);
  });

  it('does not send or read due conversations while globally paused', async () => {
    guidance.isPaused.mockResolvedValue(true);
    await processFollowUps();
    expect(conversations.findDueFollowUps).not.toHaveBeenCalled();
    expect(whatsapp.sendConfiguredFollowUp).not.toHaveBeenCalled();
  });

  it('stops the batch when the global pause is enabled between sends', async () => {
    guidance.isPaused
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    await processFollowUps();
    expect(whatsapp.sendConfiguredFollowUp).toHaveBeenCalledTimes(1);
  });

  it('does not run overlapping batches', async () => {
    let release!: (value: unknown[]) => void;
    conversations.findDueFollowUps.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = processFollowUps();
    await Promise.resolve();
    await processFollowUps();
    expect(conversations.findDueFollowUps).toHaveBeenCalledTimes(1);
    release([]);
    await first;
  });
});
