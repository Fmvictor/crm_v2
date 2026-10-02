import { BotModelService } from './bot-model.service';

describe('BotModelService', () => {
  const fetchOriginal = global.fetch;
  const keyOriginal = process.env.OPENAI_API_KEY;
  const evidence = [
    {
      url: 'https://www.emeb.es/cursos/bikefitting',
      text: 'Bikefitting. Duración: 7 horas. Modalidad presencial.',
      fetchedAt: new Date('2026-10-02T10:00:00Z'),
    },
  ];

  afterEach(() => {
    global.fetch = fetchOriginal;
    if (keyOriginal === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = keyOriginal;
  });

  it('deriva reclamaciones sin llamar al modelo', async () => {
    global.fetch = jest.fn() as typeof fetch;
    const result = await new BotModelService().decide({
      question: 'Tengo una reclamación',
      evidence,
      instructions: '',
      memory: null,
      history: '',
    });
    expect(result.action).toBe('handoff');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('deriva si la cita no existe en la página consultada', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      action: 'answer',
                      answer: 'Cuesta 10 euros',
                      quote: 'Precio 10 euros',
                      sourceUrl: evidence[0].url,
                      reason: '',
                      memoryUpdate: '',
                    }),
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    ) as typeof fetch;
    const result = await new BotModelService().decide({
      question: '¿Cuánto cuesta Bikefitting?',
      evidence,
      instructions: '',
      memory: null,
      history: '',
    });
    expect(result.action).toBe('handoff');
  });

  it('acepta una respuesta respaldada por la página y sin guardar datos de cursos en memoria', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      action: 'answer',
                      answer: 'La duración indicada es de 7 horas.',
                      quote: 'Duración: 7 horas',
                      sourceUrl: evidence[0].url,
                      reason: '',
                      memoryUpdate: 'Precio 200 €',
                    }),
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    ) as typeof fetch;
    const result = await new BotModelService().decide({
      question: '¿Cuánto dura Bikefitting?',
      evidence,
      instructions: '',
      memory: null,
      history: '',
    });
    expect(result.action).toBe('answer');
    expect(result.sourceUrl).toBe(evidence[0].url);
    expect(result.memoryUpdate).toBe('');
  });
});
