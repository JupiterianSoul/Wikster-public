import { MATURE_CATEGORIES, MATURE_HOSTS, MATURE_INNER, MATURE_WORDS } from '../data/wikis.js';
import { isSensitive, sexualName } from '../sensitive.js';

export function hostOf(url) {
  try { return new URL(String(url ?? '')).hostname.toLowerCase(); } catch { return ''; }
}

export function matureHost(host) {
  const h = String(host ?? '').toLowerCase();
  if (!h) return false;
  if (MATURE_HOSTS.some((b) => h === b || h.endsWith(`.${b}`))) return true;
  if (MATURE_INNER.test(h)) return true;
  return MATURE_WORDS.test(h.replace(/[.-]+/g, ' '));
}

const SEXUAL_TOPICS = /\b(sexuality|sexualite|eroti[cs]\w*|masturbat\w*|orgasm\w*|ejaculat\w*|semen|sperme|libido|aphrodisiac\w*|sexual fetish\w*|nudity|nudite|nude|nudes|nu artistique|naturism|naturisme|nudism|nudisme|prostitut\w*|brothels?|bordels?|strip ?(?:clubs?|tease)|striptease|sex work\w*|sex industry|sexual intercourse|rapport sexuel|coit\w*|fellatio|cunnilingus|anal sex|oral sex|sodomy|bdsm|bondage)\b/;
const BARE_TOPICS = /^(?:human )?(?:breasts?|seins?|nipples?|tetons?|anus|buttocks|fesses|pubic hair|pilosite pubienne|genitals?|genitalia)$/;

export function matureTopic(title) {
  const text = String(title ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_\s]+/g, ' ').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!text) return false;
  return MATURE_WORDS.test(text) || MATURE_INNER.test(text) || sexualName(text) || SEXUAL_TOPICS.test(text) || BARE_TOPICS.test(text)
    || isSensitive({ title: text });
}

export function matureFlag(raw) {
  if (!raw || typeof raw !== 'object') return false;
  return [raw.isAdult, raw.adult, raw.mature, raw.isMature, raw.nsfw].some((v) => v === true || v === 1 || v === '1' || v === 'true');
}

export function matureSite({ host = '', sitename = '', description = '', flags = null } = {}) {
  if (matureFlag(flags)) return true;
  if (matureHost(host)) return true;
  return MATURE_WORDS.test(`${sitename} ${description}`) || MATURE_INNER.test(String(sitename ?? ''));
}

export function matureCategories(categories) {
  return (categories ?? []).some((c) => MATURE_CATEGORIES.test(String(c?.title ?? c ?? '')));
}

export function maturePage(page, extract = page?.extract) {
  if (!page) return false;
  if (matureCategories(page.categories)) return true;
  return isSensitive({ title: page.title, description: page.description, extract });
}
