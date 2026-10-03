export const FINDER_VERSION = 2;

export function foldName(text) {
  return String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/(\d)[,.\s](\d{3})\b/g, '$1$2')
    .replace(/(\d+)k\b/g, (_, n) => `${n}000`)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export const pageCount = (r) => {
  const n = Number(r?.articles);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function formatPages(n, lang = 'en') {
  const count = Math.floor(Number(n));
  if (!Number.isFinite(count) || count <= 0) return '?';
  const short = (v, unit) => {
    const text = v >= 10 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return `${lang === 'fr' ? text.replace('.', ',') : text}${unit}`;
  };
  if (count >= 999_500) return short(count / 1_000_000, 'M');
  if (count >= 1_000) return short(count / 1_000, 'k');
  return String(count);
}

export function biggestIndex(results) {
  let at = -1;
  let most = 0;
  (results ?? []).forEach((r, i) => {
    if (r?.topic) return;
    const n = pageCount(r);
    if (n > most) { most = n; at = i; }
  });
  return at;
}

export const findKey = (query, lang) => `v${FINDER_VERSION}|${lang}|${foldName(query)}`;
