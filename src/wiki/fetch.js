import { wikiLang } from '../i18n.js';
import { ACTION, MAX_SEARCH_OFFSET, PAGEVIEWS, deadQueries, encodeTitle, fetchJson, querySizeCache, thumbSize } from './core.js';
import { isUsableText, toCard } from './filter.js';
import { dayBefore } from '../days.js';

export const POOL_LIMIT = 20;

export const PAGE_PROPS = {
  prop: 'extracts|pageimages|categories|info|description|revisions|pageprops',
  ppprop: 'wikibase_item|disambiguation',
  rvprop: 'timestamp|user|tags',
  exintro: '1', explaintext: '1', exchars: '600', exlimit: String(POOL_LIMIT),
  piprop: 'thumbnail|original', pilimit: String(POOL_LIMIT),
  pilicense: 'any',
  cllimit: '500', clshow: '!hidden',
  inprop: 'url'
};

export function pageProps() {
  return ({ ...PAGE_PROPS, pithumbsize: thumbSize() });
}

export function pagesOf(data) {
  return (Object.values(data?.query?.pages ?? {}).filter((page) => page?.title));
}

export async function searchPool(query, { preferBig = false, at = null } = {}) {
  const cacheKey = `${wikiLang()}|${query}`;
  let offset = 0;
  const known = querySizeCache.get(cacheKey);
  const roam = preferBig ? 300 : MAX_SEARCH_OFFSET;
  if (Number.isFinite(at) && at >= 0) offset = Math.floor(at);
  else if (known && known > POOL_LIMIT) {
    const ceiling = Math.min(known, roam) - POOL_LIMIT;
    if (ceiling > 0) offset = Math.max(0, Math.floor(Math.random() * ceiling));
  }

  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: query,
    gsrnamespace: '0', gsrlimit: String(POOL_LIMIT), gsroffset: String(offset),
    gsrinfo: 'totalhits', gsrprop: 'wordcount',
    ...pageProps(), format: 'json', origin: '*'
  });
  const data = await fetchJson(`${ACTION()}?${params}`);
  const totalHits = data?.query?.searchinfo?.totalhits;
  if (Number.isFinite(totalHits)) {
    querySizeCache.set(cacheKey, totalHits);
    if (totalHits === 0) deadQueries.add(cacheKey);
  }
  return pagesOf(data);
}

export async function randomPool() {
  const params = new URLSearchParams({
    action: 'query', generator: 'random',
    grnnamespace: '0', grnlimit: String(POOL_LIMIT),
    ...pageProps(), format: 'json', origin: '*'
  });
  return pagesOf(await fetchJson(`${ACTION()}?${params}`));
}

export async function pagesByTitle(titles) {
  if (!titles.length) return [];
  const params = new URLSearchParams({
    action: 'query', titles: titles.slice(0, POOL_LIMIT).join('|'),
    ...pageProps(), format: 'json', origin: '*'
  });
  return pagesOf(await fetchJson(`${ACTION()}?${params}`));
}

export function subjectScore(pack, page) {
  const terms = pack.match ?? [];
  if (!terms.length) return 2;
  const strong = [page.title, page.description, ...(page.categories ?? []).map((c) => c.title)]
    .join(' ').toLowerCase();
  if (terms.some((term) => strong.includes(term))) return 2;
  return terms.some((term) => String(page.extract ?? '').toLowerCase().includes(term)) ? 1 : 0;
}

export const THUMB_WIDTH = 640;

export function sizedOriginal(original, width = THUMB_WIDTH) {
  const src = original?.source;
  if (typeof src !== 'string' || !src) return null;
  const m = /^(https:\/\/upload\.wikimedia\.org\/[^/]+\/[^/]+)\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/.exec(src);
  if (!m || !(Number(original.width) > width)) return src;
  const [, base, a, ab, file] = m;
  if (/\.(jpe?g|png|gif|webp)$/i.test(file)) return `${base}/thumb/${a}/${ab}/${file}/${width}px-${file}`;
  if (/\.svg$/i.test(file)) return `${base}/thumb/${a}/${ab}/${file}/${width}px-${file}.png`;
  return src;
}

export function bestImage(page) {
  return (page.thumbnail?.source ?? sizedOriginal(page.original) ?? null);
}

export const FRESH_EDIT_MS = 60 * 60 * 1000;

const RISKY_TAGS = ['mw-blank', 'mw-replace', 'mw-new-redirect', 'mw-changed-redirect-target'];

export function freshlyVandalised(page, now = Date.now()) {
  const rev = page?.revisions?.[0];
  if (!rev?.timestamp) return false;
  const at = Date.parse(rev.timestamp);
  if (!Number.isFinite(at) || now - at > FRESH_EDIT_MS) return false;
  const tags = rev.tags ?? [];
  if (tags.some((tag) => RISKY_TAGS.includes(tag))) return true;
  const user = String(rev.user ?? '');
  return 'anon' in rev || 'temp' in rev || user.startsWith('~') || /^[\d.:a-f]+$/i.test(user);
}

export const isDisambiguation = (page) => page?.pageprops?.disambiguation !== undefined;

export function pageToCard(page, views, art = null) {
  const thumbnail = art?.thumbnail ?? bestImage(page);
  if (!thumbnail) return null;
  if (freshlyVandalised(page)) return null;
  if (!isUsableText(page.title, page.extract)) return null;
  const lang = wikiLang();
  const card = toCard({
    sourceId: `wikipedia:${lang}`,
    sourceName: 'Wikipedia',
    pageId: page.pageid,
    title: page.title,
    description: page.description,
    extract: page.extract,
    thumbnail,
    url: page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeTitle(page.title)}`,
    views,
    wordCount: page.wordcount ?? null
  });
  if (art?.picture) card.picture = art.picture;
  return card;
}

export function pageviewRange() {
  const now = new Date();
  const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}0100`;
  return [
    fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))),
    fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
  ];
}

export function viewsOf(page) {
  const days = page?.pageviews;
  if (!days || typeof days !== 'object') return null;
  const counts = Object.values(days).filter((n) => Number.isFinite(n));
  if (!counts.length) return null;
  return Math.round(counts.reduce((sum, n) => sum + n, 0));
}

export const VIEW_LANES = 6;

export async function fetchViewsFor(titles, lang = wikiLang()) {
  const found = new Map();
  const chunks = [];
  for (let i = 0; i < titles.length; i += POOL_LIMIT) chunks.push(titles.slice(i, i + POOL_LIMIT));
  const one = async (chunk) => {
    const params = new URLSearchParams({
      action: 'query', titles: chunk.join('|'), redirects: '1',
      prop: 'pageviews', pvipdays: '30', format: 'json', origin: '*'
    });
    const data = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    const back = new Map((data?.query?.redirects ?? []).map((r) => [r.to, r.from]));
    for (const page of pagesOf(data)) {
      const views = viewsOf(page);
      if (views == null) continue;
      found.set(page.title, views);
      if (back.has(page.title)) found.set(back.get(page.title), views);
    }
  };
  let next = 0;
  const lane = async () => { while (next < chunks.length) await one(chunks[next++]); };
  await Promise.all(Array.from({ length: Math.min(VIEW_LANES, chunks.length) }, lane));
  return found;
}

export async function fetchMonthlyViews(title) {
  try {
    const [start, end] = pageviewRange();
    const url = `${PAGEVIEWS}/${wikiLang()}.wikipedia/all-access/user/${encodeTitle(title)}/monthly/${start}/${end}`;
    const items = (await fetchJson(url))?.items ?? [];
    if (!items.length) return null;
    return Math.round(items.reduce((sum, item) => sum + (item.views ?? 0), 0) / items.length);
  } catch {
    return null;
  }
}

export const readDayBefore = (now = Date.now()) => dayBefore(now);

export async function fetchTopRead(day = readDayBefore(), lang = wikiLang(), limit = 300) {
  const [y, m, d] = String(day).split('-');
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${m}/${d}`;
  const data = await fetchJson(url);
  const rows = data?.items?.[0]?.articles ?? [];
  const out = [];
  for (const row of rows) {
    const raw = String(row.article ?? '');
    if (!raw || raw === '-' || raw === 'Main_Page' || raw.includes(':')) continue;
    out.push({ title: raw.replace(/_/g, ' '), views: Number(row.views) || 0, rank: out.length + 1 });
    if (out.length >= limit) break;
  }
  return out;
}
