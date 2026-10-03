import { fetchJson } from './core.js';
import { iconSvg } from '../data/icons.js';
import { nameScore, nameTokens } from './finder.js';

export const PICTURE_WIDTH = 640;
export const STEP_TIMEOUT_MS = 4500;
export const OPENVERSE_MAX = 3;
export const OPENVERSE = 'https://api.openverse.org/v1/images/';

let cache = null;

export function usePictureCache(next) {
  cache = next;
}

const memory = new Map();
const MEMORY_KEEP = 800;

export const pictureKey = (host, title) => `${String(host ?? '').toLowerCase()}|${title}`;

const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const colour = (c, fallback) => (/^#[0-9a-f]{3,8}$/i.test(String(c ?? '')) ? c : fallback);

export function wrapTitle(title, width = 16, most = 4) {
  const words = String(title ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const piece = word.length > width ? `${word.slice(0, width - 1)}…` : word;
    if (!line) line = piece;
    else if ((`${line} ${piece}`).length <= width) line = `${line} ${piece}`;
    else { lines.push(line); line = piece; }
  }
  if (line) lines.push(line);
  if (lines.length > most) {
    const kept = lines.slice(0, most);
    kept[most - 1] = `${kept[most - 1].replace(/…$/, '')}…`;
    return kept;
  }
  return lines;
}

export function textCardArt({ title, subject = '', icon = 'book', accent = '#6366f1', accent2 = '#1e1b4b' } = {}) {
  const a = colour(accent, '#6366f1');
  const b = colour(accent2, '#1e1b4b');
  const long = String(title ?? '').length;
  const size = long > 48 ? 40 : long > 30 ? 48 : long > 16 ? 56 : 66;
  const lines = wrapTitle(title, Math.round(560 / (size * 0.56)), 4);
  const lead = size * 1.12;
  const top = 210 - ((lines.length - 1) * lead) / 2;
  const glyph = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(iconSvg(icon))?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420" preserveAspectRatio="xMidYMid slice">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`
    + `<pattern id="p" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><rect width="9" height="26" fill="#fff" fill-opacity=".06"/></pattern></defs>`
    + `<rect width="640" height="420" fill="url(#g)"/><rect width="640" height="420" fill="#000" fill-opacity=".24"/><rect width="640" height="420" fill="url(#p)"/>`
    + `<svg x="404" y="-36" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`
    + `<text x="320" y="${Math.round(top)}" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="${size}" fill="#fff">`
    + lines.map((l, i) => `<tspan x="320" dy="${i ? Math.round(lead) : 0}">${xml(l)}</tspan>`).join('')
    + `</text>`
    + `<rect x="290" y="${Math.round(top + (lines.length - 1) * lead + size * 0.62)}" width="60" height="5" rx="2.5" fill="#fff" fill-opacity=".75"/>`
    + (subject ? `<text x="320" y="${Math.round(top + (lines.length - 1) * lead + size * 0.62 + 42)}" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="20" letter-spacing="3" fill="#fff" fill-opacity=".72">${xml(String(subject).toUpperCase().slice(0, 34))}</text>` : '')
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const isTextArt = (thumbnail) => String(thumbnail ?? '').startsWith('data:image/svg+xml');

const cleanThumb = (url) => (typeof url === 'string' ? url.replace(/[?&]utm_[^#]*$/, '') : null);

async function quietly(work) {
  try { return await work; } catch { return null; }
}

export async function wikidataPictures(items, get = fetchJson) {
  const found = new Map();
  const ids = [...new Set(items.map((it) => it.qid).filter((q) => /^Q\d+$/.test(String(q ?? ''))))].slice(0, 50);
  if (!ids.length) return found;
  const data = await get(`https://www.wikidata.org/w/api.php?${new URLSearchParams({
    action: 'query', prop: 'pageimages', titles: ids.join('|'), piprop: 'thumbnail|name',
    pithumbsize: String(PICTURE_WIDTH), pilimit: '50', format: 'json', origin: '*'
  })}`, { timeout: STEP_TIMEOUT_MS });
  const byQid = new Map(Object.values(data?.query?.pages ?? {}).map((p) => [p.title, p]));
  for (const it of items) {
    const page = byQid.get(it.qid);
    const src = cleanThumb(page?.thumbnail?.source);
    if (!src) continue;
    const file = String(page.pageimage ?? '').replace(/_/g, ' ');
    found.set(it.title, {
      thumbnail: src,
      picture: { source: 'wikidata', link: file ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}` : `https://www.wikidata.org/wiki/${it.qid}`, credit: 'Wikimedia Commons' }
    });
  }
  return found;
}

export function closestLink(title, links) {
  const own = nameTokens(title);
  let best = null;
  for (const link of links) {
    if (!link || link === title || /:/.test(link)) continue;
    const words = nameTokens(link);
    if (!words.length) continue;
    const inside = words.every((w) => own.includes(w));
    const score = nameScore(title, link) + (inside ? 0.3 : 0) - Math.max(0, words.length - own.length) * 0.1;
    if (score >= 0.55 && (!best || score > best.score)) best = { link, score };
  }
  return best?.link ?? null;
}

export async function linkedPictures(items, apiUrl, get = fetchJson) {
  const found = new Map();
  const titles = items.map((it) => it.title).slice(0, 20);
  if (!titles.length) return found;
  const data = await get(`${apiUrl}?${new URLSearchParams({
    action: 'query', titles: titles.join('|'), prop: 'links', plnamespace: '0', pllimit: 'max', redirects: '1', format: 'json', origin: '*'
  })}`, { timeout: STEP_TIMEOUT_MS });
  const redirected = new Map((data?.query?.redirects ?? []).map((r) => [r.from, r.to]));
  const linksOf = new Map(Object.values(data?.query?.pages ?? {}).map((p) => [p.title, (p.links ?? []).map((l) => l.title)]));
  const wanted = new Map();
  for (const title of titles) {
    const target = redirected.get(title);
    const pick = target && target !== title ? target : closestLink(title, linksOf.get(target ?? title) ?? []);
    if (pick) wanted.set(title, pick);
  }
  if (!wanted.size) return found;
  const imgs = await get(`${apiUrl}?${new URLSearchParams({
    action: 'query', titles: [...new Set(wanted.values())].join('|'), prop: 'pageimages|info', inprop: 'url',
    piprop: 'thumbnail', pithumbsize: String(PICTURE_WIDTH), pilimit: '50', redirects: '1', format: 'json', origin: '*'
  })}`, { timeout: STEP_TIMEOUT_MS });
  const hops = new Map((imgs?.query?.redirects ?? []).map((r) => [r.from, r.to]));
  const pages = new Map(Object.values(imgs?.query?.pages ?? {}).map((p) => [p.title, p]));
  for (const [title, link] of wanted) {
    const page = pages.get(hops.get(link) ?? link);
    const src = cleanThumb(page?.thumbnail?.source);
    if (!src || (Number(page.thumbnail.width) || PICTURE_WIDTH) < 120) continue;
    found.set(title, { thumbnail: src, picture: { source: 'linked', from: page.title, link: page.fullurl ?? null } });
  }
  return found;
}

export function openverseThumb(hit) {
  const url = String(hit?.url ?? '');
  if (/^https:\/\/live\.staticflickr\.com\/.+?(_[a-z])?\.jpg$/i.test(url)) return url.replace(/(_[a-z])?\.jpg$/i, '_z.jpg');
  const m = /^(https:\/\/upload\.wikimedia\.org\/[^/]+\/[^/]+)\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+\.(?:jpe?g|png|webp))$/i.exec(url);
  if (m && Number(hit.width) > PICTURE_WIDTH) return `${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${PICTURE_WIDTH}px-${m[4]}`;
  if (m) return url;
  return typeof hit?.thumbnail === 'string' && /^https:\/\//.test(hit.thumbnail) ? hit.thumbnail : null;
}

const LICENCE_NAMES = { by: 'CC BY', 'by-sa': 'CC BY-SA', 'by-nd': 'CC BY-ND', 'by-nc': 'CC BY-NC', 'by-nc-sa': 'CC BY-NC-SA', 'by-nc-nd': 'CC BY-NC-ND', cc0: 'CC0', pdm: 'Public Domain Mark' };

export function licenceName(hit) {
  const base = LICENCE_NAMES[String(hit?.license ?? '').toLowerCase()] ?? String(hit?.license ?? '').toUpperCase();
  const version = hit?.license_version && !['cc0', 'pdm'].includes(String(hit.license).toLowerCase()) ? ` ${hit.license_version}` : '';
  return `${base}${version}`.trim();
}

export async function openversePicture(title, { hint = null, allowMature = false, get = fetchJson } = {}) {
  const q = [title, hint].filter(Boolean).join(' ').slice(0, 120);
  const data = await get(`${OPENVERSE}?${new URLSearchParams({ q, page_size: '8', mature: allowMature ? 'true' : 'false' })}`, { timeout: STEP_TIMEOUT_MS });
  const words = nameTokens(title);
  for (const hit of data?.results ?? []) {
    if (!allowMature && hit.mature) continue;
    const said = nameTokens(`${hit.title ?? ''} ${(hit.tags ?? []).map((tag) => tag?.name ?? '').join(' ')}`);
    if (words.length && !words.some((w) => said.some((s) => s === w || (w.length > 4 && s.startsWith(w.slice(0, -1)))))) continue;
    const thumbnail = openverseThumb(hit);
    if (!thumbnail) continue;
    return {
      thumbnail,
      picture: {
        source: 'openverse',
        license: licenceName(hit),
        licenseUrl: typeof hit.license_url === 'string' ? hit.license_url : null,
        credit: hit.creator ? String(hit.creator).slice(0, 120) : null,
        link: typeof hit.foreign_landing_url === 'string' ? hit.foreign_landing_url : null
      }
    };
  }
  return null;
}

const toRow = (key, got) => ({
  key,
  image: got.picture.source === 'text' ? null : got.thumbnail,
  source: got.picture.source,
  license: got.picture.license ?? null,
  credit: got.picture.credit ?? null,
  link: got.picture.link ?? null,
  extra: { from: got.picture.from ?? null, licenseUrl: got.picture.licenseUrl ?? null }
});

const fromRow = (row, look, title) => {
  if (!row?.source) return null;
  if (row.source === 'text' || !row.image) return textPicture(title, look);
  return {
    thumbnail: row.image,
    picture: {
      source: row.source,
      ...(row.license ? { license: row.license } : {}),
      ...(row.credit ? { credit: row.credit } : {}),
      ...(row.link ? { link: row.link } : {}),
      ...(row.extra?.from ? { from: row.extra.from } : {}),
      ...(row.extra?.licenseUrl ? { licenseUrl: row.extra.licenseUrl } : {})
    }
  };
};

export function textPicture(title, look = null) {
  return {
    thumbnail: textCardArt({ title, subject: look?.subject ?? '', icon: look?.icon ?? 'book', accent: look?.accent, accent2: look?.accent2 }),
    picture: { source: 'text' }
  };
}

async function cachedRows(keys) {
  const out = new Map();
  const missing = [];
  for (const key of keys) {
    if (memory.has(key)) out.set(key, memory.get(key));
    else missing.push(key);
  }
  if (missing.length && cache?.get) {
    const rows = await quietly(cache.get(missing));
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.key) { out.set(row.key, row); memory.set(row.key, row); }
    }
  }
  return out;
}

function remember(rows) {
  if (!rows.length) return;
  for (const row of rows) memory.set(row.key, row);
  while (memory.size > MEMORY_KEEP) memory.delete(memory.keys().next().value);
  if (cache?.put) quietly(cache.put(rows));
}

export async function findPictures(pages, { apiUrl, host = null, hint = null, allowMature = false, look = null, get = fetchJson, deadline = Date.now() + 9000, openverse = OPENVERSE_MAX, steps = null } = {}) {
  const site = host ?? (() => { try { return new URL(apiUrl).hostname; } catch { return ''; } })();
  const items = pages.filter((p) => p?.title).map((p) => ({ title: p.title, qid: p.pageprops?.wikibase_item ?? p.qid ?? null, key: pictureKey(site, p.title) }));
  const result = new Map();
  if (!items.length) return result;
  const fresh = [];
  const held = await cachedRows(items.map((it) => it.key));
  let left = [];
  for (const it of items) {
    const got = fromRow(held.get(it.key), look, it.title);
    if (got) result.set(it.title, got);
    else left.push(it);
  }
  const late = () => Date.now() > deadline;
  const settle = (found) => {
    left = left.filter((it) => {
      const got = found?.get(it.title);
      if (!got) return true;
      result.set(it.title, got);
      fresh.push(toRow(it.key, got));
      return false;
    });
  };
  const run = steps ?? ['wikidata', 'linked', 'openverse'];
  if (left.length && !late() && run.includes('wikidata')) settle(await quietly(wikidataPictures(left, get)));
  if (left.length && !late() && run.includes('linked') && apiUrl) settle(await quietly(linkedPictures(left, apiUrl, get)));
  if (left.length && !late() && run.includes('openverse')) {
    const tries = left.slice(0, openverse);
    const found = new Map();
    await Promise.all(tries.map(async (it) => {
      it.tried = true;
      try {
        const got = await openversePicture(it.title, { hint, allowMature, get });
        if (got) found.set(it.title, got);
      } catch {
        it.shaky = true;
      }
    }));
    settle(found);
  }
  for (const it of left) {
    const got = textPicture(it.title, look);
    result.set(it.title, got);
    if (it.tried && !it.shaky && !late()) fresh.push(toRow(it.key, got));
  }
  remember(fresh);
  return result;
}
