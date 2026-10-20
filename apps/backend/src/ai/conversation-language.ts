const handoffNotices = {
  es: 'Te paso con alguien del equipo para que te ayude lo antes posible.',
  en: "I'll connect you with someone from our team so they can help you as soon as possible.",
  fr: 'Je vous mets en relation avec une personne de notre équipe pour vous aider dès que possible.',
  ca: "Et passo amb algú de l'equip perquè t'ajudi al més aviat possible.",
  de: 'Ich leite dich an unser Team weiter, damit dir so schnell wie möglich jemand helfen kann.',
  it: 'Ti metto in contatto con una persona del nostro team per aiutarti il prima possibile.',
  pt: 'Vou encaminhar você para uma pessoa da nossa equipe para ajudar o mais breve possível.',
} as const;

export type HandoffLanguage = keyof typeof handoffNotices;

export function conversationLanguage(
  text: string,
  fallback?: string | null,
): HandoffLanguage {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const markers: [HandoffLanguage, RegExp][] = [
    ['fr', /\b(bonjour|souhaite|parler|conseiller|equipe|s'il vous plait)\b/],
    ['en', /\b(hello|please|want|speak|someone|human|agent|i need)\b/],
    ['ca', /\b(vull|parlar|equip|si us plau)\b/],
    ['de', /\b(hallo|bitte|sprechen|mitarbeiter)\b/],
    ['it', /\b(buongiorno|vorrei|parlare|consulente)\b/],
    ['pt', /\b(ola|gostaria|falar|atendente)\b/],
    ['es', /\b(hola|quiero|hablar|alguien|humano|persona)\b/],
  ];
  const detected = markers.find(([, expression]) =>
    expression.test(normalized),
  );
  if (detected) return detected[0];
  const locale = fallback?.toLowerCase().split(/[-_]/)[0];
  return locale && Object.hasOwn(handoffNotices, locale)
    ? (locale as HandoffLanguage)
    : 'es';
}

export function humanRequest(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    /\b(persona|humano|hablar con alguien|human|agent|speak to someone)\b/.test(
      normalized,
    ) ||
    /\b(?:parler|contacter|joindre)\b.*\b(?:conseiller|personne|equipe|humain)\b/.test(
      normalized,
    )
  );
}

export function handoffNotice(language: HandoffLanguage): string {
  return handoffNotices[language];
}
