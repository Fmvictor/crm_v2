import { OpenAiService } from './openai.service';

describe('OpenAiService', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  });

  it('does not send temperature to gpt-6-astra', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-6-astra';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          reply: 'Hola',
          language: 'es',
          stage: 'contacted',
          courseInterest: null,
          summary: null,
          optIn: false,
          optOut: false,
          handoff: false,
          handoffReason: null,
          followUpDays: null,
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await new OpenAiService().decide({
      messages: [{ direction: 'inbound', body: 'Hola' }],
      webContext: 'Contexto de prueba',
      currentStage: 'new',
    });

    const request = JSON.parse(
      fetchMock.mock.calls[0][1].body as string,
    ) as Record<string, unknown>;
    expect(request.model).toBe('gpt-6-astra');
    expect(request.temperature).toBeUndefined();
  });

  it('does not hand off an informational price question when the context is available', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          reply: 'El CMB1 cuesta 1.650 euros.',
          language: 'es',
          stage: 'offer_sent',
          courseInterest: 'CMB1',
          summary: null,
          optIn: false,
          optOut: false,
          handoff: true,
          handoffReason: 'respuesta conservadora',
          followUpDays: null,
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const decision = await new OpenAiService().decide({
      messages: [
        { direction: 'inbound', body: 'Quiero saber el precio del CMB1' },
      ],
      webContext: 'FUENTE: https://www.emeb.es/cursos/cmb1\nPRECIO 1.650,00€',
      currentStage: 'contacted',
    });

    expect(decision.handoff).toBe(false);
    expect(decision.handoffReason).toBeNull();
  });

  it('includes approved guidance and examples without replacing the web source', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          reply: 'Hola',
          language: 'es',
          stage: 'contacted',
          courseInterest: null,
          summary: null,
          optIn: false,
          optOut: false,
          handoff: false,
          handoffReason: null,
          followUpDays: null,
        }),
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await new OpenAiService().decide({
      messages: [{ direction: 'inbound', body: 'Hola' }],
      webContext: 'FUENTE: https://www.emeb.es/fechas',
      currentStage: 'new',
      instructions: 'No uses emojis.',
      examples: ['Gracias por escribirnos.'],
    });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      input: Array<{ content: string }>;
    };
    expect(request.input[0].content).toContain('No uses emojis.');
    expect(request.input[0].content).toContain('Gracias por escribirnos.');
    expect(request.input[0].content).toContain(
      'nunca sustituyen el contexto web',
    );
  });
});
