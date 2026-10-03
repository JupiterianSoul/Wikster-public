import { MATURE_WORDS } from '../data/wikis.js';
import { isMature, sexualName } from '../sensitive.js';

const LEET = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss' };

function folded(text, one) {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[034578@$!øæœß1|]/g, (ch) => (ch === '1' || ch === '|' ? one : LEET[ch] ?? ch))
    .replace(/[_.*+~^'`’-]+/g, ' ');
}

export const foldVariants = (text) => [...new Set([folded(text, 'i'), folded(text, 'l')])];

const MINORS_ALWAYS = new RegExp([
  '\\blol[iy]+cons?\\b', '\\bloli\\b', '\\bshota(?:cons?)?\\b', '\\btoddlercons?\\b', '\\bjail ?bait\\b',
  '\\bunder ?aged?\\b', '\\bpre ?teens?\\b',
  '\\bpa?edo(?:s|phil\\w*|filia\\w*|filo\\w*|bear\\w*|porn\\w*)?\\b', '\\bpederast\\w*', '\\bephebophil\\w*', '\\bhebephil\\w*',
  '\\b(?:child|children|kiddie|kiddy|kid|minor|infant|toddler|baby|underage)s? ?(?:porn\\w*|sex\\w*|erotic\\w*|nude\\w*|nudity|lewd|hentai|abuse material)\\b',
  '\\bcsam\\b', '\\bkinder ?porn\\w*', '\\bkinderpornografie\\b', '\\bpedopornogra\\w*',
  '\\bpornographie (?:infantile|juvenile|enfantine|de mineurs?)\\b', '\\bpornografia (?:infantil|minorile|de menores|infantile)\\b',
  '\\bdetskaya pornografiya\\b',
  'ロリコン', 'ショタコン', '児童ポルノ', '幼女', 'ペド', '萝莉', '正太', '儿童色情'
].join('|').normalize('NFKD'), 'i');

const MINORS_ADULT = new RegExp([
  '\\bcubs?\\b', '\\bteens?\\b', '\\bteenage\\w*', '\\bteeny\\w*', '\\bchild(?:ren|hood)?\\b', '\\bkids?\\b', '\\bkiddie\\w*',
  '\\bminors?\\b', '\\bschool ?(?:girl|boy)s?\\b', '\\blolita\\w*', '\\bnymphets?\\b', '\\bjailbait\\b', '\\bjk\\b', '\\bjc\\b',
  '\\byoung(?:er)? (?:girls?|boys?)\\b', '\\blittle (?:girls?|boys?)\\b', '\\bdaughters?\\b', '\\bpuberty\\b', '\\bprepubescent\\b', '\\btweens?\\b',
  '\\benfants?\\b', '\\bmineur(?:e|es|s)?\\b', '\\badolescent\\w*', '\\bados?\\b', '\\bfillette\\w*', '\\bgamin(?:e|es|s)?\\b', '\\bcollegien\\w*', '\\blyceen\\w*',
  '\\bnin[oa]s?\\b', '\\bmenores?\\b', '\\bbambin[ioe]\\b', '\\bragazzin[ioe]\\b', '\\bkinder\\b', '\\bjugendlich\\w*', '\\bmadchen\\b',
  'ロリ', 'ショタ', '少女', '女子高生', '中学生', '小学生', 'jailbait'
].join('|').normalize('NFKD'), 'i');

export function minorsText(text, { adult = false } = {}) {
  const variants = foldVariants(text);
  if (variants.some((v) => MINORS_ALWAYS.test(v))) return true;
  const grown = adult || variants.some((v) => MATURE_WORDS.test(v) || sexualName(v) || /p[o]+rn|\bpr[o]+n(?:[sz]|o)?\b/.test(v));
  return grown && variants.some((v) => MINORS_ADULT.test(v));
}

export function minorsCard(card) {
  if (!card || card.special) return false;
  const a = card.article ?? card;
  const text = [a.title, a.description, a.extract, a.sourceName, a.packName].filter(Boolean).join(' . ');
  return minorsText(text, { adult: a.mature === true || isMature(a) });
}

export function minorsWiki(wiki, extra = []) {
  if (!wiki) return false;
  let host = '';
  try { host = new URL(String(wiki.apiUrl ?? '')).hostname.replace(/[.-]+/g, ' '); } catch {}
  const text = [wiki.sitename, wiki.topic, wiki.description, wiki.name, host, ...extra].filter(Boolean).join(' . ');
  return minorsText(text, { adult: wiki.mature === true });
}

const ADULT_ALIAS = /^(?:p+[o]+r+n+[o]*[sz]?|p+r+[o]+n+[o]*[sz]?|pr[o]+n[o]?|p[o]+rn[o]?graph\w*|porn\w+)$/;

export function adultQuery(query) {
  const tokens = folded(query, 'i').split(/[^a-z]+/).filter(Boolean);
  const squashed = folded(query, 'i').replace(/[^a-z]+/g, '');
  return tokens.some((w) => ADULT_ALIAS.test(w)) || ADULT_ALIAS.test(squashed);
}

const canonWord = (f) => f.replace(/^p+r+o+n+/, 'porn').replace(/^p+o+r+n+/, 'porn');

export function adultCanon(query) {
  const raw = String(query ?? '').replace(/\s+/g, ' ').trim();
  if (!adultQuery(raw)) return raw;
  let matched = false;
  const words = raw.split(' ').map((w) => {
    const f = folded(w, 'i').replace(/[^a-z]+/g, '');
    if (!f || !ADULT_ALIAS.test(f)) return w;
    matched = true;
    const canon = canonWord(f);
    return canon === w.toLowerCase() ? w : canon;
  });
  if (matched) return words.join(' ');
  const squashed = folded(raw, 'i').replace(/[^a-z]+/g, '');
  return ADULT_ALIAS.test(squashed) && squashed !== raw.toLowerCase() ? canonWord(squashed) : raw;
}

export function cardAllowed(card, { safe = false } = {}) {
  if (!card) return false;
  if (minorsCard(card)) return false;
  if (safe && !card.special && isMature(card.article ?? card)) return false;
  return true;
}
