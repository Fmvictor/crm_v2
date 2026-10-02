import { BotWorkerService } from './bot-worker.service';
import type { BotJob } from '../whatsapp/entities/bot-job.entity';
import type { BotJobsService } from '../whatsapp/bot-jobs.service';
import type { ContactsService } from '../contacts/contacts.service';
import type { InteractionsService } from '../interactions/interactions.service';
import type { CourseWebsiteService } from './course-website.service';
import type { BotModelService } from './bot-model.service';
import type { WhatsAppService } from '../whatsapp/whatsapp.service';

describe('BotWorkerService', () => {
  const mode = process.env.BOT_MODE;
  const job = {
    id: 'job-1',
    contactId: 'contact-1',
    phone: '34600111222',
    question: '¿Cuánto dura Bikefitting?',
    inboundInteractionId: 'incoming-1',
    createdAt: new Date('2026-10-02T10:00:00Z'),
  };
  const jobs = {
    complete: jest.fn(),
    isGloballyPaused: jest.fn().mockResolvedValue(false),
    getCurrentInstructions: jest.fn().mockResolvedValue(''),
    getApprovedExamples: jest.fn().mockResolvedValue([]),
  };
  const contacts = { findOne: jest.fn(), setBotMemory: jest.fn() };
  const interactions = {
    findLatestHumanOutbound: jest.fn(),
    findLatestIncoming: jest.fn().mockResolvedValue({ id: 'incoming-1' }),
    findAll: jest.fn().mockResolvedValue({ data: [] }),
  };
  const website = {
    findEvidence: jest.fn().mockResolvedValue([
      {
        url: 'https://www.emeb.es/cursos/bikefitting',
        text: 'Duración: 7 horas',
        fetchedAt: new Date(),
      },
    ]),
  };
  const model = {
    decide: jest.fn().mockResolvedValue({
      action: 'answer',
      answer: 'Dura 7 horas.',
      quote: 'Duración: 7 horas',
      sourceUrl: 'https://www.emeb.es/cursos/bikefitting',
      memoryUpdate: '',
    }),
  };
  const whatsapp = { sendText: jest.fn() };
  let worker: BotWorkerService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BOT_MODE = 'auto';
    contacts.findOne.mockResolvedValue({ botPaused: false, botMemory: null });
    interactions.findLatestHumanOutbound.mockResolvedValue(null);
    interactions.findLatestIncoming.mockResolvedValue({ id: 'incoming-1' });
    worker = new BotWorkerService(
      jobs as unknown as BotJobsService,
      contacts as unknown as ContactsService,
      interactions as unknown as InteractionsService,
      website as unknown as CourseWebsiteService,
      model as unknown as BotModelService,
      whatsapp as unknown as WhatsAppService,
    );
  });

  afterAll(() => {
    if (mode === undefined) delete process.env.BOT_MODE;
    else process.env.BOT_MODE = mode;
  });

  it('deriva sin consultar la web si el agente pausó el bot', async () => {
    contacts.findOne.mockResolvedValue({ botPaused: true });
    await worker['process'](job as BotJob);
    expect(jobs.complete).toHaveBeenCalledWith('job-1', 'needs_human', {
      reason: 'Bot pausado por un agente',
    });
    expect(website.findEvidence).not.toHaveBeenCalled();
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

  it('no envía si un agente respondió mientras se generaba el borrador', async () => {
    interactions.findLatestHumanOutbound
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ createdAt: new Date('2026-10-02T10:01:00Z') });
    await worker['process'](job as BotJob);
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(jobs.complete).toHaveBeenCalledWith('job-1', 'needs_human', {
      reason: 'El bot se pausó o un agente tomó el control antes del envío',
    });
  });

  it('descarta una respuesta antigua si llegó otra pregunta', async () => {
    interactions.findLatestIncoming.mockResolvedValue({ id: 'incoming-2' });
    await worker['process'](job as BotJob);
    expect(website.findEvidence).not.toHaveBeenCalled();
    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(jobs.complete).toHaveBeenCalledWith('job-1', 'resolved', {
      reason: 'Hay un mensaje más reciente del cliente',
    });
  });
});
