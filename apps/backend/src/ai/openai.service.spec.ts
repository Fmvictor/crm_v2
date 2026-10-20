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
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            output_text: JSON.stringify({
              reply: 'Hola',
              language: 'es',
              stage: 'contacted',
              courseInterest: null,
              summary: null,
              optIn: false,
              optOut: false,
              informationVerified: true,
              handoff: false,
              handoffReason: null,
              followUpDays: null,
            }),
          }),
      } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await new OpenAiService().decide({
      messages: [{ direction: 'inbound', body: 'Hola' }],
      webContext: 'Contexto de prueba',
      currentStage: 'new',
    });

    const request = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(request.model).toBe('gpt-6-astra');
    expect(request.temperature).toBeUndefined();
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it('preserves the model handoff even for an informational price question', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            output_text: JSON.stringify({
              reply: 'El CMB1 cuesta 1.650 euros.',
              language: 'es',
              stage: 'offer_sent',
              courseInterest: 'CMB1',
              summary: null,
              optIn: false,
              optOut: false,
              informationVerified: true,
              handoff: true,
              handoffReason: 'respuesta conservadora',
              followUpDays: null,
            }),
          }),
      } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const decision = await new OpenAiService().decide({
      messages: [
        { direction: 'inbound', body: 'Quiero saber el precio del CMB1' },
      ],
      webContext: 'FUENTE: https://www.emeb.es/cursos/cmb1\nPRECIO 1.650,00€',
      currentStage: 'contacted',
    });

    expect(decision.handoff).toBe(true);
    expect(decision.handoffReason).toBe('respuesta conservadora');
  });

  it('includes approved guidance and examples without replacing the web source', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            output_text: JSON.stringify({
              reply: 'Hola',
              language: 'es',
              stage: 'contacted',
              courseInterest: null,
              summary: null,
              optIn: false,
              optOut: false,
              informationVerified: true,
              handoff: false,
              handoffReason: null,
              followUpDays: null,
            }),
          }),
      } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await new OpenAiService().decide({
      messages: [{ direction: 'inbound', body: 'Hola' }],
      webContext: 'FUENTE: https://www.emeb.es/fechas',
      currentStage: 'new',
      instructions: 'No uses emojis.',
      examples: ['Gracias por escribirnos.'],
    });

    const request = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as {
      input: Array<{ content: string }>;
    };
    expect(request.input[0].content).toContain('No uses emojis.');
    expect(request.input[0].content).toContain('Gracias por escribirnos.');
    expect(request.input[0].content).toContain(
      'nunca sustituyen el contexto web',
    );
  });

  it.each([false, undefined])(
    'deriva si falta evidencia aunque el modelo no pida derivar: %s',
    async (informationVerified) => {
      process.env.OPENAI_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            output_text: JSON.stringify({
              reply: 'Ese descuento no está publicado',
              language: 'es',
              informationVerified,
              handoff: false,
              optOut: false,
            }),
          }),
      }) as unknown as typeof fetch;
      const decision = await new OpenAiService().decide({
        messages: [
          { direction: 'inbound', body: 'Confirma el descuento futuro' },
        ],
        webContext: 'FUENTE: https://www.emeb.es/cursos/cmb1\nPrecio actual',
        currentStage: 'new',
      });
      expect(decision.handoff).toBe(true);
      expect(decision.handoffReason).toContain('sin evidencia');
    },
  );
});
