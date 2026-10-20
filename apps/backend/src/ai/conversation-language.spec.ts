import {
  conversationLanguage,
  handoffNotice,
  humanRequest,
} from './conversation-language';

describe('Idioma de la derivación', () => {
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
