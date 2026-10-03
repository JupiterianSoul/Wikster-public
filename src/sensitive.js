const TERMS = [
  'pornograph', 'pornstar', 'porn film', 'porn actor', 'porn actress',
  'hardcore porn', 'softcore', 'erotica', 'erotic film', 'erotic art',
  'sexual intercourse', 'sexual position', 'sex position', 'oral sex',
  'anal sex', 'group sex', 'sexual act', 'sex act', 'sex toy', 'sex doll',
  'sex worker', 'sex industry', 'sex shop', 'prostitut', 'brothel',
  'strip club', 'stripper', 'nudity', 'nude photograph', 'nude model',
  'topless', 'full frontal', 'fetish', 'bdsm', 'bondage', 'sadomasochis',
  'masturbat', 'orgasm', 'ejaculat', 'genital', 'nsfw', 'adult film',
  'adult video', 'adult magazine', 'adult entertainment', 'playboy playmate',
  'penthouse pet', 'hentai', 'lingerie model', 'glamour model',
  'burlesque dancer', 'obscen', 'lewd', 'aphrodisiac'
];

const PATTERN = new RegExp(TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

const SEXUAL_NAMES = /\b(penis|penises|penile|vaginas?|vagins?|vulvas?|vulves?|clitoris|clitoral|labia|scrotum|testicles?|testicules?|foreskin|prepuce|sex organs?|organes? sexuels?|sexual (?:organs?|anatomy|arousal|stimulation|intercourse|pleasure|fantas(?:y|ies)|desire|activit(?:y|ies)|practices?|positions?|acts?)|human sexuality|sexualite humaine|kama ?sutra|dildos?|godemiches?|sex toys?|jouets? sexuels?)\b/;

const fold = (text) => String(text ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const sexualName = (text) => SEXUAL_NAMES.test(fold(text));

export function isSensitive(card) {
  if (!card) return false;
  const text = [card.title, card.description, card.sourceName, card.extract]
    .filter(Boolean).join(' · ');
  return PATTERN.test(text) || sexualName([card.title, card.description].filter(Boolean).join(' · '));
}

export function isMature(card) {
  return Boolean(card && (card.mature === true || card.article?.mature === true || isSensitive(card)));
}
