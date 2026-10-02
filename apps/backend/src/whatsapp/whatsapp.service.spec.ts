import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

describe('WhatsAppService webhook', () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;
  const originalMode = process.env.BOT_MODE;
  const contacts = {
    findOneByPhone: jest.fn(),
    create: jest.fn(),
    findOrCreateWhatsApp: jest.fn(),
  };
  const interactions = {
    createIncomingOnce: jest.fn(),
    updateDeliveryStatus: jest.fn(),
  };
  const jobs = { enqueue: jest.fn() };
  let service: WhatsAppService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
    process.env.BOT_MODE = 'auto';
    service = new WhatsAppService(
      contacts as any,
      interactions as any,
      jobs as any,
    );
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = originalSecret;
    if (originalMode === undefined) delete process.env.BOT_MODE;
    else process.env.BOT_MODE = originalMode;
  });

  it('acepta una firma calculada sobre el cuerpo sin modificar', () => {
    const rawBody = Buffer.from('{"entry":[]}');
    const signature = `sha256=${createHmac('sha256', 'test-app-secret').update(rawBody).digest('hex')}`;
    expect(() =>
      service.verifyWebhookSignature(rawBody, signature),
    ).not.toThrow();
  });

  it('rechaza una firma inválida y la falta del secreto', () => {
    const rawBody = Buffer.from('{"entry":[]}');
    expect(() =>
      service.verifyWebhookSignature(rawBody, `sha256=${'0'.repeat(64)}`),
    ).toThrow(UnauthorizedException);
    delete process.env.WHATSAPP_APP_SECRET;
    expect(() => service.verifyWebhookSignature(rawBody, '')).toThrow(
      UnauthorizedException,
    );
  });

  it('registra el ID de Meta y su marca temporal para deduplicar', async () => {
    contacts.findOrCreateWhatsApp.mockResolvedValue({ id: 'contact-1' });
    interactions.createIncomingOnce.mockResolvedValue('interaction-1');
    await service.handleWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.123',
                    from: '+34 600 111 222',
                    type: 'text',
                    text: { body: 'Hola' },
                    timestamp: '1760000000',
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(interactions.createIncomingOnce).toHaveBeenCalledWith({
      contactId: 'contact-1',
      notes: 'Hola',
      externalMessageId: 'wamid.123',
      messageTimestamp: new Date(1760000000 * 1000),
    });
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
  });

  it('no crea otro trabajo cuando Meta repite el mensaje', async () => {
    contacts.findOrCreateWhatsApp.mockResolvedValue({ id: 'contact-1' });
    interactions.createIncomingOnce
      .mockResolvedValueOnce('interaction-1')
      .mockResolvedValueOnce(null);
    const webhook = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.123',
                    from: '34600111222',
                    type: 'text',
                    text: { body: 'Hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await service.handleWebhook(webhook);
    await service.handleWebhook(webhook);
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
  });

  it('envía una imagen directamente a revisión humana', async () => {
    contacts.findOrCreateWhatsApp.mockResolvedValue({ id: 'contact-1' });
    interactions.createIncomingOnce.mockResolvedValue('interaction-1');
    await service.handleWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'wamid.img', from: '34600111222', type: 'image' },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'needs_human',
        reason: 'Mensaje no textual: requiere atención humana',
      }),
    );
  });
});
