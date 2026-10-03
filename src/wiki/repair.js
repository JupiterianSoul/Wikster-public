import { fetchJson } from './core.js';
import { pageProps, pageToCard, pagesOf } from './fetch.js';

export const REPAIR_EVERY = 7 * 24 * 3600 * 1000;

export async function repairCard(entry) {
  if (!entry?.key || !entry.title || entry.special) return null;
  if (String(entry.sourceId ?? '').startsWith('wiki:')) return null;
  if (entry.checkedAt && Date.now() - entry.checkedAt < REPAIR_EVERY) return null;
  const lang = entry.lang ?? String(entry.key).split(':')[0];
  if (!/^[a-z-]{2,12}$/.test(lang)) return null;
  const params = new URLSearchParams({
    action: 'query', titles: entry.title, redirects: '1', ...pageProps(), format: 'json', origin: '*'
  });
  let data;
  try { data = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`); } catch { return null; }
  const pages = pagesOf(data ?? {});
  const page = pages.find((p) => p.pageid && !p.missing);
  if (!page) return pages.some((p) => p.missing !== undefined || p.invalid !== undefined) ? { gone: true } : null;
  page.lang = lang;
  const fresh = pageToCard(page, entry.views);
  const fix = { gone: false };
  for (const field of ['title', 'description', 'extract']) {
    if (fresh?.[field] && fresh[field] !== entry[field]) fix[field] = fresh[field];
  }
  if (!entry.thumbnail && fresh?.thumbnail) fix.thumbnail = fresh.thumbnail;
  return fix;
}
