import {
  conversationLanguage,
  handoffNotice,
  humanRequest,
} from './conversation-language';

describe('Idioma de la derivación', () => {
  it('comunica el horario configurado en el idioma del cliente sin prometer un plazo', () => {
    const previous = { ...process.env };
    try {
      Object.assign(process.env, {
        HUMAN_ATTENTION_AGENT_NAME: 'Víctor',
        HUMAN_ATTENTION_START: '08:00',
        HUMAN_ATTENTION_END: '20:00',
        HUMAN_ATTENTION_DAYS: '1,2,3,4,5',
        HUMAN_ATTENTION_TIMEZONE: 'Europe/Madrid',
      });
      expect(handoffNotice('es')).toContain(
        'Víctor atiende de lunes a viernes, de 08:00 a 20:00, hora de Madrid.',
      );
      expect(handoffNotice('en')).toContain(
        'Monday to Friday, 08:00–20:00, Madrid time',
      );
      process.env.HUMAN_ATTENTION_START = '25:00';
      expect(handoffNotice('es')).not.toContain('25:00');
    } finally {
      process.env = previous;
    }
  });
  it.each([
    ['I want to speak to a human, please.', 'es', 'en', 'connect'],
    [
      "Je souhaite parler à un conseiller de votre équipe, s'il vous plaît.",
      'es',
      'fr',
      'relation',
    ],
    ['Quiero hablar con una persona', 'en', 'es', 'Te paso'],
    ['Hola', 'fr', 'es', 'Te paso'],
    ['CMB1?', 'fr-FR', 'fr', 'relation'],
    ['CMB1?', 'en_US', 'en', 'connect'],
    ['CMB1?', '__proto__', 'es', 'Te paso'],
  ])(
    'usa el idioma observado y valida el idioma guardado',
    (message, previous, expected, fragment) => {
      const language = conversationLanguage(message, previous);
      expect(language).toBe(expected);
      expect(handoffNotice(language)).toContain(fragment);
    },
  );

  it('reconoce una petición humana francesa sin necesitar al proveedor', () => {
    expect(humanRequest('Je souhaite parler à un conseiller')).toBe(true);
    expect(humanRequest('¿Cuántas personas asisten al curso?')).toBe(false);
  });
});
