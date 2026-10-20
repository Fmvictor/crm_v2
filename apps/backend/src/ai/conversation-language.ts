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
  const name = process.env.HUMAN_ATTENTION_AGENT_NAME?.trim()
    .replace(/[\r\n]/g, ' ')
    .slice(0, 80);
  const start = process.env.HUMAN_ATTENTION_START;
  const end = process.env.HUMAN_ATTENTION_END;
  // Sólo se anuncian calendarios configurados y validados, sin prometer plazos.
  const knownCalendar =
    process.env.HUMAN_ATTENTION_DAYS === '1,2,3,4,5' &&
    process.env.HUMAN_ATTENTION_TIMEZONE === 'Europe/Madrid';
  const validTime = (value?: string): value is string =>
    !!value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (
    !name ||
    !knownCalendar ||
    !validTime(start) ||
    !validTime(end) ||
    start >= end
  )
    return handoffNotices[language];
  const schedule = {
    es: `${name} atiende de lunes a viernes, de ${start} a ${end}, hora de Madrid.`,
    en: `${name}'s support hours are Monday to Friday, ${start}–${end}, Madrid time.`,
    fr: `${name} vous répond du lundi au vendredi, de ${start} à ${end}, heure de Madrid.`,
    ca: `${name} atén de dilluns a divendres, de ${start} a ${end}, hora de Madrid.`,
    de: `${name} ist montags bis freitags von ${start} bis ${end} Uhr (Ortszeit Madrid) erreichbar.`,
    it: `${name} è disponibile dal lunedì al venerdì, dalle ${start} alle ${end}, ora di Madrid.`,
    pt: `${name} atende de segunda a sexta-feira, das ${start} às ${end}, horário de Madrid.`,
  };
  return `${handoffNotices[language]} ${schedule[language]}`;
}
