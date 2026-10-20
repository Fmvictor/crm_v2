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
});
