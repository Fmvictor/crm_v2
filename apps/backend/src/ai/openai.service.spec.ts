import { defaultConfiguration } from '../bot-config/config-schema';
import { AiUsageService } from './ai-usage.service';
import { OpenAiService } from './openai.service';

describe('OpenAiService', () => {
  const usage = {
    assertAvailable: jest.fn(),
    reserve: jest.fn().mockResolvedValue('reservation'),
    settle: jest.fn(),
    uncertain: jest.fn(),
    rejected: jest.fn(),
  } as unknown as AiUsageService;
  const withCount =
    (transport: typeof fetch): typeof fetch =>
    (url: Parameters<typeof fetch>[0], init?: RequestInit) =>
      (typeof url === 'string'
        ? url
        : url instanceof URL
          ? url.href
          : url.url
      ).endsWith('/input_tokens')
        ? Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ input_tokens: 100 }),
          } as Response)
        : transport(url, init);
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

    global.fetch = withCount(global.fetch);
    await new OpenAiService(usage).decide({
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

    global.fetch = withCount(global.fetch);
    const decision = await new OpenAiService(usage).decide({
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

    global.fetch = withCount(global.fetch);
    await new OpenAiService(usage).decide({
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
      global.fetch = withCount(global.fetch);
      const decision = await new OpenAiService(usage).decide({
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

describe('Control de consumo antes y después de OpenAI', () => {
  const transport = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  const context = {
    messages: [{ direction: 'inbound', body: 'Hola' }],
    webContext: 'Contexto sintético',
    currentStage: 'new',
  };
  const accounting = () => ({
    assertAvailable: jest.fn().mockResolvedValue(undefined),
    reserve: jest.fn().mockResolvedValue('reserved'),
    settle: jest.fn().mockResolvedValue(undefined),
    uncertain: jest.fn().mockResolvedValue(undefined),
    rejected: jest.fn().mockResolvedValue(undefined),
  });
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'synthetic-test-key';
  });
  afterEach(() => {
    global.fetch = transport;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  });
  it('no hace peticiones al proveedor si el presupuesto está bloqueado', async () => {
    const usage = accounting();
    usage.assertAvailable.mockRejectedValue(new Error('blocked'));
    global.fetch = jest.fn();
    await expect(
      new OpenAiService(usage as unknown as AiUsageService).decide(context),
    ).rejects.toThrow('blocked');
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('no genera sin conteo válido o sin reserva disponible', async () => {
    const usage = accounting();
    const fetcher = jest
      .fn<Promise<unknown>, [string, RequestInit]>()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 123 }),
      });
    global.fetch = fetcher as unknown as typeof fetch;
    usage.reserve.mockRejectedValue(new Error('no funds'));
    await expect(
      new OpenAiService(usage as unknown as AiUsageService).decide(context),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(usage.reserve).toHaveBeenCalledWith(
      expect.any(String),
      123,
      undefined,
    );
  });
  it.each([400, 429, 500])(
    'contabiliza el resultado HTTP %s sin reintentar',
    async (status) => {
      const usage = accounting();
      const fetcher = jest
        .fn<Promise<unknown>, [string, RequestInit]>()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ input_tokens: 123 }),
        })
        .mockResolvedValueOnce({ ok: false, status });
      global.fetch = fetcher as unknown as typeof fetch;
      await expect(
        new OpenAiService(usage as unknown as AiUsageService).decide(context),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(2);
      if (status < 500)
        expect(usage.rejected).toHaveBeenCalledWith(
          'reserved',
          status,
          expect.any(Number),
        );
      else expect(usage.rejected).not.toHaveBeenCalled();
      const count = JSON.parse(fetcher.mock.calls[0][1].body as string) as {
        input: unknown;
        text: unknown;
      };
      const generated = JSON.parse(fetcher.mock.calls[1][1].body as string) as {
        input: unknown;
        text: unknown;
        max_output_tokens: number;
        service_tier: string;
      };
      expect(count.input).toEqual(generated.input);
      expect(count.text).toEqual(generated.text);
      expect(generated.max_output_tokens).toBe(8192);
      expect(generated.service_tier).toBe('default');
    },
  );
  it('conserva la reserva tras un timeout y no intenta otra generación', async () => {
    const usage = accounting();
    const fetcher = jest
      .fn<Promise<unknown>, [string, RequestInit]>()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 123 }),
      })
      .mockRejectedValueOnce(new Error('timeout'));
    global.fetch = fetcher as unknown as typeof fetch;
    await expect(
      new OpenAiService(usage as unknown as AiUsageService).decide(context),
    ).rejects.toThrow('sin confirmar');
    expect(usage.uncertain).toHaveBeenCalledWith(
      'reserved',
      undefined,
      expect.any(Number),
    );
    expect(usage.rejected).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('registra el consumo aunque el texto generado no sea JSON válido', async () => {
    const usage = accounting();
    const fetcher = jest
      .fn<Promise<unknown>, [string, RequestInit]>()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 123 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            usage: { input_tokens: 123, output_tokens: 1 },
            output_text: 'invalid json',
          }),
      });
    global.fetch = fetcher as unknown as typeof fetch;
    await expect(
      new OpenAiService(usage as unknown as AiUsageService).decide(context),
    ).rejects.toThrow('consumo registrado');
    expect(usage.settle).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('Configuración publicada en la petición a OpenAI', () => {
  const originalFetch = global.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  afterEach(() => {
    global.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  it('envía las instrucciones de la revisión probada y registra su huella antes de generar', async () => {
    process.env.OPENAI_API_KEY = 'synthetic';
    const configuration = defaultConfiguration();
    configuration.assistant = '# Identidad sintética de prueba';
    configuration.rules.humanTopics = [];
    const usage = {
      assertAvailable: jest.fn(),
      reserve: jest.fn().mockResolvedValue('call-id'),
      annotateConfiguration: jest.fn(),
      settle: jest.fn(),
      uncertain: jest.fn(),
      rejected: jest.fn(),
    };
    const fetcher = jest
      .fn<Promise<unknown>, [string, RequestInit]>()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 200 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            model: 'gpt-6-astra',
            service_tier: 'default',
            usage: { input_tokens: 200, output_tokens: 10 },
            output_text: JSON.stringify({
              reply: 'Información de prueba.',
              informationVerified: true,
              handoff: false,
              optIn: false,
              optOut: false,
            }),
          }),
      });
    global.fetch = fetcher as unknown as typeof fetch;
    const sources = [
      { id: 'synthetic-doc', name: 'datos.md', hash: 'a'.repeat(64) },
    ];
    await new OpenAiService(usage as unknown as AiUsageService).decide({
      configuration: {
        version: 3,
        configuration,
        hash: 'b'.repeat(64),
        createdAt: '',
        createdBy: null,
      },
      preview: { revision: 4, hash: 'c'.repeat(64) },
      sources,
      webContext: 'Datos autorizados de prueba.',
      currentStage: 'new',
      messages: [{ direction: 'inbound', body: 'Información de prueba' }],
    });
    const request = JSON.parse(fetcher.mock.calls[1][1].body as string) as {
      store: boolean;
      input: { content: string }[];
    };
    expect(request.input[0].content).toContain('Identidad sintética de prueba');
    expect(request.input[0].content).toContain(
      'Los documentos publicados son la fuente principal',
    );
    expect(request.input[1].content).toContain('Datos autorizados de prueba');
    expect(request.store).toBe(false);
    expect(usage.annotateConfiguration).toHaveBeenCalledWith(
      'call-id',
      3,
      sources,
      { revision: 4, hash: 'c'.repeat(64) },
    );
    expect(
      usage.annotateConfiguration.mock.invocationCallOrder[0],
    ).toBeLessThan(fetcher.mock.invocationCallOrder[1]);
    expect(usage.settle).toHaveBeenCalledTimes(1);
  });
});
