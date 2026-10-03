import { FILTER_TERMS } from './data/filterterms.js';

export const NORM_FROM = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ0134578@$!|';
export const NORM_TO = 'aaaaaaceeeeiiiinooooouuuuyyoaoieastbasii';

const TABLE = new Map([...NORM_FROM].map((ch, i) => [ch, NORM_TO[i]]));

export const SCOPES = {
  chat: ['slur', 'sexual', 'contact'],
  name: ['slur', 'sexual', 'profanity', 'reserved'],
  guild: ['slur', 'sexual', 'profanity', 'reserved'],
  pack: ['slur', 'sexual', 'profanity'],
  adultPack: ['slur', 'profanity']
};

export const LINK_PATTERNS = [
  '(https?://|www\\.)',
  '[a-z0-9-]+\\.(com|net|org|io|gg|fr|ru|xyz|app|ly|me|tv|co|be|de|uk|us|info|biz|link|site|online|shop)([^a-z0-9]|$)'
];
export const CONTACT_PATTERNS = [
  '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
  '(\\+[0-9][0-9 .-]{7,}[0-9]|0[1-9]([ .-]?[0-9]{2}){4})'
];

const LINKS = LINK_PATTERNS.map((p) => new RegExp(p));
const CONTACTS = CONTACT_PATTERNS.map((p) => new RegExp(p));

export function normText(text) {
  const lower = String(text ?? '').toLowerCase();
  let out = '';
  for (const ch of lower) out += TABLE.get(ch) ?? ch;
  return out.replace(/(.)\1\1+/g, '$1$1');
}

export function screenText(text, scope = 'chat') {
  const tiers = SCOPES[scope] ?? SCOPES.chat;
  const raw = String(text ?? '').toLowerCase();
  if (tiers.includes('contact')) {
    if (LINKS.some((re) => re.test(raw))) return 'LINK';
    if (CONTACTS.some((re) => re.test(raw))) return 'CONTACT';
  }
  const n = normText(raw);
  const single = n.replace(/(.)\1+/g, '$1');
  const variants = [n, single].map((v) => ({
    tokens: v.split(/[^a-z]+/).filter(Boolean),
    collapsed: v.replace(/[^a-z]/g, '')
  }));
  const hit = new Set();
  for (const [term, tier, mode] of FILTER_TERMS) {
    if (!tiers.includes(tier) || hit.has(tier)) continue;
    const pool = /(.)\1/.test(term) ? variants.slice(0, 1) : variants;
    const found = pool.some(({ tokens, collapsed }) => (mode === 'any'
      ? collapsed.includes(term)
      : tokens.some((w) => w === term || (mode === 'word' && term.length >= 5 && w.startsWith(term)))));
    if (found) hit.add(tier);
  }
  if (hit.has('slur') || hit.has('sexual') || hit.has('profanity')) return 'WORD';
  if (hit.has('reserved')) return 'RESERVED';
  if (hit.has('contact')) return 'CONTACT';
  return null;
}
