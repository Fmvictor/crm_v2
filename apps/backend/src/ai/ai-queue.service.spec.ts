import { Logger } from '@nestjs/common';
import { AiQueueService } from './ai-queue.service';
import { AiConversationProcessor } from './ai-conversation.processor';
import { AiGuidanceService } from './ai-guidance.service';
import { AiJobStore } from './ai-job.store';
import { ConversationsService } from '../conversations/conversations.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { DeliveryUncertainError } from '../whatsapp/whatsapp-dispatch.service';

describe('Persistent AI queue', () => {
  const conversations = {
    findOne: jest.fn(),
    findDueFollowUps: jest.fn(),
    markFollowUpSent: jest.fn(),
    setMode: jest.fn(),
  };
  const whatsapp = { sendConfiguredFollowUp: jest.fn() };
  const guidance = { isPaused: jest.fn() };
  const jobs = {
    claim: jest.fn(),
    finish: jest.fn(),
    fail: jest.fn(),
    renew: jest.fn(),
    needsDeliveryReview: jest.fn(),
  };
  const processor = { process: jest.fn() };
  const job = {
    id: 'job',
    conversationId: 'conversation',
    inboundMessageId: 'inbound',
    leaseToken: 'lease',
    attempts: 1,
  };
  let service: AiQueueService;
  const env = { ...process.env };
  const consume = () =>
    (service as unknown as { consume(): Promise<void> }).consume();
  const followUps = () =>
    (
      service as unknown as { processFollowUps(): Promise<void> }
    ).processFollowUps();

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    process.env.AI_WHATSAPP_ENABLED = 'true';
    process.env.AI_RELIABLE_DELIVERY_ENABLED = 'true';
    process.env.AI_WHATSAPP_TEST_PHONES = '*';
    guidance.isPaused.mockResolvedValue(false);
    jobs.claim.mockResolvedValue(job);
    jobs.needsDeliveryReview.mockResolvedValue(false);
    conversations.findOne.mockResolvedValue({
      externalContactKey: '000000001',
      contact: { phone: '000000001' },
    });
    service = new AiQueueService(
      processor as unknown as AiConversationProcessor,
      conversations as unknown as ConversationsService,
      whatsapp as unknown as WhatsAppService,
      guidance as unknown as AiGuidanceService,
      jobs as unknown as AiJobStore,
    );
  });
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('requires explicit activation and an audience', () => {
    delete process.env.AI_RELIABLE_DELIVERY_ENABLED;
    expect(service.acceptsPhone('000000001')).toBe(false);
    process.env.AI_RELIABLE_DELIVERY_ENABLED = 'true';
    delete process.env.AI_WHATSAPP_TEST_PHONES;
    expect(service.acceptsPhone('000000001')).toBe(false);
    process.env.AI_WHATSAPP_TEST_PHONES = '000000002';
    expect(service.acceptsPhone('000000001')).toBe(false);
    expect(service.acceptsPhone('000000002')).toBe(true);
  });
  it('acknowledges only after processing the specific inbound message', async () => {
    await consume();
    expect(processor.process).toHaveBeenCalledWith('conversation', 'inbound');
    expect(jobs.finish).toHaveBeenCalledWith(job);
    expect(jobs.finish.mock.invocationCallOrder[0]).toBeGreaterThan(
      processor.process.mock.invocationCallOrder[0],
    );
  });
  it('authorizes the WhatsApp sender even when the CRM contact has a different phone representation', async () => {
    process.env.AI_WHATSAPP_TEST_PHONES = '000000001';
    conversations.findOne.mockResolvedValue({
      externalContactKey: '000000001',
      contact: { phone: 'different-contact-phone' },
    });
    await consume();
    expect(processor.process).toHaveBeenCalledWith('conversation', 'inbound');
  });
  it('does not authorize another WhatsApp conversation through an allowed contact phone', async () => {
    process.env.AI_WHATSAPP_TEST_PHONES = '000000001';
    conversations.findOne.mockResolvedValue({
      externalContactKey: '000000002',
      contact: { phone: '000000001' },
    });
    await consume();
    expect(processor.process).not.toHaveBeenCalled();
  });
  it('retains a generation failure for a bounded retry', async () => {
    processor.process.mockRejectedValue(new Error('provider unavailable'));
    await consume();
    expect(jobs.fail).toHaveBeenCalledWith(job, false);
    expect(jobs.finish).not.toHaveBeenCalled();
  });
  it('hands off after the last attempt', async () => {
    jobs.claim.mockResolvedValue({ ...job, attempts: 3 });
    processor.process.mockRejectedValue(new Error('provider unavailable'));
    await consume();
    expect(conversations.setMode).toHaveBeenCalledWith(
      'conversation',
      'human',
      expect.any(String),
      'job:job',
    );
    expect(jobs.fail).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 3 }),
      true,
    );
  });
  it('never retries an uncertain external send', async () => {
    processor.process.mockRejectedValue(new DeliveryUncertainError());
    await consume();
    expect(jobs.fail).toHaveBeenCalledWith(job, true);
    expect(conversations.setMode).toHaveBeenCalledWith(
      'conversation',
      'human',
      expect.stringContaining('incierto'),
      'job:job',
    );
  });
  it('detects a send left by a crashed worker before invoking the model again', async () => {
    jobs.needsDeliveryReview.mockResolvedValue(true);
    await consume();
    expect(processor.process).not.toHaveBeenCalled();
    expect(jobs.fail).toHaveBeenCalledWith(job, true);
  });
  it('does not claim work during a global pause', async () => {
    guidance.isPaused.mockResolvedValue(true);
    await consume();
    expect(jobs.claim).not.toHaveBeenCalled();
  });
  it('stops failed follow-ups instead of trying again every minute', async () => {
    conversations.findDueFollowUps.mockResolvedValue([
      {
        id: 'due',
        aiMode: 'auto',
        optInAt: new Date(),
        contact: { phone: '000000001' },
      },
    ]);
    whatsapp.sendConfiguredFollowUp.mockRejectedValue(
      new Error('template unavailable'),
    );
    await followUps();
    expect(conversations.setMode).toHaveBeenCalledWith(
      'due',
      'human',
      expect.stringContaining('plantilla'),
      expect.stringContaining('followup:due:'),
    );
    expect(conversations.markFollowUpSent).not.toHaveBeenCalled();
  });
  it('keeps the lease recoverable if persisting the failure handoff fails', async () => {
    processor.process.mockRejectedValue(new DeliveryUncertainError());
    conversations.setMode.mockRejectedValue(new Error('database unavailable'));
    await consume();
    expect(jobs.fail).not.toHaveBeenCalled();
    expect(jobs.finish).not.toHaveBeenCalled();
  });
});
