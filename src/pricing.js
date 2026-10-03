const VIEWS_LOG_CEILING = 6.3;
const WORDS_LOG_CEILING = Math.log10(20000);

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function popularityFromViews(views) {
  if (!Number.isFinite(views) || views <= 0) return 0;
  return clamp01(Math.log10(views + 1) / VIEWS_LOG_CEILING);
}

export function popularityFromWordCount(words) {
  if (!Number.isFinite(words) || words <= 0) return 0.25;
  return clamp01(Math.pow(Math.log10(words + 1) / WORDS_LOG_CEILING, 1.15));
}

export function basePrice(popularity) {
  return 20 + 480 * Math.pow(clamp01(popularity), 1.5);
}

export function priceFor(popularity, rarity) {
  return Math.round(basePrice(popularity) * (1 + rarity.bonusPct / 100));
}

export const CURRENCY_NAME = 'Buckarooz';

const AMOUNTS = new Intl.NumberFormat('en-US');

export function formatAmount(price) {
  return AMOUNTS.format(Math.round(price));
}

export function formatViews(views) {
  if (!Number.isFinite(views) || views <= 0) return '?';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(views >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(views));
}

export const POPULARITY_BANDS = [
  { id: 'obscure', name: 'Obscure', min: 0,    max: 0.35 },
  { id: 'known',   name: 'Known',   min: 0.35, max: 0.55 },
  { id: 'popular', name: 'Popular', min: 0.55, max: 0.75 },
  { id: 'famous',  name: 'Famous',  min: 0.75, max: 1.01 }
];

export const bandFor = (popularity) =>
  POPULARITY_BANDS.find((b) => popularity >= b.min && popularity < b.max) ?? POPULARITY_BANDS[0];
