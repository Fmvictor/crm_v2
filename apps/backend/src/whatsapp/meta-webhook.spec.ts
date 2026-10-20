import { parseMetaWebhook } from './meta-webhook';

describe('Meta webhook structure', () => {
  const webhook = (message: unknown) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [message] } }] }],
  });
  const message = {
    id: 'synthetic-id',
    from: '000000001',
    type: 'text',
    timestamp: '1700000000',
    text: { body: 'Prueba sintética' },
  };
  it('accepts messages and status-only notifications', () => {
    expect(parseMetaWebhook(webhook(message))).toBeDefined();
    expect(
      parseMetaWebhook({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: { statuses: [] } }] }],
      }),
    ).toBeDefined();
  });
  it.each([
    null,
    {},
    { entry: [] },
    { object: 'whatsapp_business_account', entry: 'invalid' },
  ])('rejects malformed envelopes', (body) => {
    expect(() => parseMetaWebhook(body)).toThrow('inválida');
  });
  it.each([
    { ...message, from: 123 },
    { ...message, id: '' },
    { ...message, timestamp: 'not-a-date' },
    { ...message, text: { body: {} } },
  ])('rejects malformed messages before persistence', (body) => {
    expect(() => parseMetaWebhook(webhook(body))).toThrow('inválida');
  });

  it.each([
    { id: 'test', recipient_id: 123, status: 'read', timestamp: '1700000000' },
    {
      id: 'test',
      recipient_id: '000000001',
      status: 'read',
      timestamp: 'not-time',
    },
    {
      id: 'test',
      recipient_id: '000000001',
      status: 'failed',
      timestamp: '1700000000',
      errors: [{ code: '131026' }],
    },
    {
      id: 'test',
      recipient_id: '000000001',
      status: 'failed',
      timestamp: '1700000000',
      errors: [{ code: 2147483648 }],
    },
  ])('rechaza confirmaciones inválidas antes de guardarlas', (status) => {
    expect(() =>
      parseMetaWebhook({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: { statuses: [status] } }] }],
      }),
    ).toThrow('inválida');
  });
  it('exige el canal configurado para una confirmación de entrega', () => {
    const previous = process.env.WHATSAPP_PHONE_NUMBER_ID;
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'channel-test';
    try {
      const status = {
        id: 'test',
        recipient_id: '000000001',
        status: 'read',
        timestamp: '1700000000',
      };
      expect(() =>
        parseMetaWebhook({
          object: 'whatsapp_business_account',
          entry: [{ changes: [{ value: { statuses: [status] } }] }],
        }),
      ).toThrow('inválida');
      expect(
        parseMetaWebhook({
          object: 'whatsapp_business_account',
          entry: [
            {
              changes: [
                {
                  value: {
                    metadata: { phone_number_id: 'channel-test' },
                    statuses: [status],
                  },
                },
              ],
            },
          ],
        }),
      ).toBeDefined();
    } finally {
      if (previous === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      else process.env.WHATSAPP_PHONE_NUMBER_ID = previous;
    }
  });
});
