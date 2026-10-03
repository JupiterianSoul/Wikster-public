import { wikiLang } from '../i18n.js';
import { PAGEVIEWS, encodeTitle, fetchJson, fetchJsonRetry } from './core.js';
import { customLeadImage, customLeadText, customPageDetail, customPageImage, probeWiki, resolveCustomWiki, upgradeImageUrl, usableThumb } from './custom.js';
import { shuffled } from './draw.js';
import { POOL_LIMIT, bestImage, fetchMonthlyViews, pageProps, pageToCard, pagesByTitle, pagesOf, pageviewRange, viewsOf } from './fetch.js';
import { isUsableText, toCard } from './filter.js';
import { redactText } from '../codedefs.js';

export function apiForEntry(entry) {
  const source = String(entry.sourceId ?? '');
  if (source.startsWith('wikipedia:')) {
    return `https://${source.slice('wikipedia:'.length) || 'en'}.wikipedia.org/w/api.php`;
  }
  if (source.startsWith('wiki:')) return `https://${source.slice('wiki:'.length)}/api.php`;
  return null;
}

export async function translateCard(entry, targetLang) {
  const api = apiForEntry(entry);
  if (!api || !entry.title) return null;

  const params = new URLSearchParams({
    action: 'query', titles: entry.title, prop: 'langlinks',
    lllang: targetLang, llprop: 'url', lllimit: '1', format: 'json', origin: '*'
  });
  const page = pagesOf(await fetchJson(`${api}?${params}`))[0];
  const link = page?.langlinks?.[0];
  const title = link?.['*'];
  if (!title) return null;

  if (api.includes('.wikipedia.org')) {
    const [detail] = await pagesByTitle([title]);
    if (!detail) return null;
    return pageToCard(detail, viewsOf(detail) ?? await fetchMonthlyViews(title).catch(() => null));
  }

  let twinApi = null;
  try {
    const url = new URL(link.url);
    twinApi = `${url.origin}${url.pathname.split('/wiki/')[0]}/api.php`;
  } catch {
    return null;
  }
  const wiki = { apiUrl: twinApi, sitename: entry.sourceName ?? '', server: null, articlePath: '/wiki/$1' };
  const params2 = new URLSearchParams({
    action: 'query', titles: title,
    prop: 'extracts|pageimages|info', exintro: '1', explaintext: '1', exchars: '600',
    piprop: 'thumbnail|original', pithumbsize: '640', inprop: 'url',
    format: 'json', origin: '*'
  });
  const detail = pagesOf(await fetchJson(`${twinApi}?${params2}`))[0];
  if (!detail) return null;
  let extract = detail.extract?.trim();
  if (!extract || extract.length < 80) extract = await customLeadText(wiki, detail.pageid);
  if (!isUsableText(detail.title, extract)) return null;
  const thumbnail = usableThumb(detail, 640)
    ?? (detail.original?.source ? upgradeImageUrl(detail.original.source, 640) : null)
    ?? await customLeadImage(wiki, detail.pageid)
    ?? await customPageImage(wiki, detail.pageid, detail.title);
  if (!thumbnail) return null;
  const host = new URL(twinApi);
  return toCard({
    sourceId: `wiki:${host.host}${host.pathname.replace('/api.php', '')}`,
    sourceName: entry.sourceName ?? host.host,
    pageId: detail.pageid,
    title: detail.title,
    description: entry.description ?? '',
    extract,
    thumbnail,
    url: detail.fullurl ?? link.url,
    views: null,
    wordCount: detail.length ? Math.round(detail.length / 6) : null
  });
}

export async function drawTitleSet(pack) {
  let wanted = (pack.titles ?? []).slice();
  if (pack.pick) wanted = shuffled(wanted).slice(0, pack.pick);
  wanted = wanted.slice(0, POOL_LIMIT);
  const out = await titleCards(wanted, pack);
  for (const extra of pack.extra ?? []) out.push({ ...extra });
  return out;
}

export const FANDOM_TRIES = 3;

const keyOf = (title) => String(title ?? '').trim().replace(/_/g, ' ');

function mergePages(into, data) {
  for (const page of pagesOf(data)) {
    const id = page.pageid ?? `t:${page.title}`;
    const held = into.get(id);
    if (!held) { into.set(id, page); continue; }
    for (const [k, v] of Object.entries(page)) {
      if (Array.isArray(v) && Array.isArray(held[k])) held[k] = held[k].concat(v);
      else if (v && typeof v === 'object' && !Array.isArray(v) && held[k] && typeof held[k] === 'object') held[k] = { ...held[k], ...v };
      else if (held[k] === undefined) held[k] = v;
    }
  }
}

export async function resolveTitles(titles, lang) {
  const found = new Map();
  const unique = [...new Set(titles.map(keyOf).filter(Boolean))];
  for (let i = 0; i < unique.length; i += POOL_LIMIT) {
    const chunk = unique.slice(i, i + POOL_LIMIT);
    const base = {
      action: 'query', titles: chunk.join('|'), redirects: '1',
      ...pageProps(), prop: `${pageProps().prop}|pageviews`, pvipdays: '30',
      format: 'json', formatversion: '1', origin: '*'
    };
    const pages = new Map();
    const hops = new Map();
    let more = null;
    for (let round = 0; round < 4; round++) {
      const params = new URLSearchParams({ ...base, ...(more ?? {}) });
      const data = await fetchJsonRetry(`https://${lang}.wikipedia.org/w/api.php?${params}`);
      if (!data?.query) throw Object.assign(new Error('NO_QUERY'), { transient: true });
      for (const hop of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) {
        if (hop?.from && hop?.to) hops.set(keyOf(hop.from), keyOf(hop.to));
      }
      mergePages(pages, data);
      more = data.continue && typeof data.continue === 'object' ? data.continue : null;
      if (!more) break;
    }
    const byTitle = new Map([...pages.values()].map((page) => [keyOf(page.title), page]));
    for (const title of chunk) {
      let at = title;
      for (let n = 0; n < 4 && hops.has(at) && hops.get(at) !== at; n++) at = hops.get(at);
      const page = byTitle.get(at);
      const real = page && page.pageid && page.missing === undefined && page.invalid === undefined;
      if (real) page.lang = lang;
      found.set(title, real ? page : null);
    }
  }
  return found;
}

async function settle(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const lane = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, lane));
  return out;
}

export async function titleCards(wanted, pack = {}) {
  const lang = pack.lang ?? wikiLang();
  const plain = wanted.filter((want) => !(want.wiki || want.wikiUrls));
  const pages = plain.length ? await resolveTitles(plain.map((want) => want.title), lang) : new Map();
  const pageOf = (want) => pages.get(keyOf(want.title)) ?? null;
  const fallbacks = plain.filter((want) => !pageOf(want) && want.fallback && want.fallback !== want.title);
  const twins = fallbacks.length ? await resolveTitles(fallbacks.map((want) => want.fallback), 'en') : new Map();
  const pageFor = (want) => pageOf(want) ?? (want.fallback && want.fallback !== want.title ? twins.get(keyOf(want.fallback)) ?? null : null);
  const pictureAsk = new Map();
  for (const want of plain) {
    const page = pageFor(want);
    if (!want.pictureLang || want.image || !page || page.lang === want.pictureLang) continue;
    if (!pictureAsk.has(want.pictureLang)) pictureAsk.set(want.pictureLang, []);
    pictureAsk.get(want.pictureLang).push(want.fallback ?? want.title);
  }
  const pictureTwins = new Map();
  for (const [pictureLang, titles] of pictureAsk) pictureTwins.set(pictureLang, await resolveTitles(titles, pictureLang));
  return settle(wanted, 4, async (want) => {
    let card;
    if (want.wiki || want.wikiUrls) {
      card = await fandomWithRetries(want, pack) ?? placeholderCard(want, pack);
    } else {
      const page = pageFor(want);
      card = page ? await namedCard(page, want, pack) : placeholderCard(want, pack);
    }
    const twin = want.pictureLang ? pictureTwins.get(want.pictureLang)?.get(keyOf(want.fallback ?? want.title)) ?? null : null;
    return finishTitleCard(card, want, pack, twin);
  });
}

async function fandomWithRetries(want, pack) {
  for (let attempt = 0; attempt < FANDOM_TRIES; attempt++) {
    const card = await fandomCard(want, pack).catch(() => null);
    if (card) return card;
    if (attempt < FANDOM_TRIES - 1) await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }
  return null;
}

async function finishTitleCard(card, want, pack, twin) {
  if (want.pictureLang && !want.image && card.pageId && card.lang && card.lang !== want.pictureLang && twin) {
    const picture = bestImage(twin) ?? await restImage(twin.title, want.pictureLang);
    if (picture) card.thumbnail = picture;
  }
  if (typeof want.art === 'function') { const drawn = want.art(); if (drawn) card.thumbnail = drawn; }
  if (want.redact) card.extract = redactText(card.extract);
  if (want.image?.url) {
    card.thumbnail = want.image.url;
    card.picture = {
      source: 'commons',
      credit: want.image.credit ?? null,
      license: want.image.license ?? null,
      licenseUrl: want.image.licenseUrl ?? null,
      link: want.image.link ?? null
    };
  }
  card.special = pack.special ?? null;
  if (card.special && pack.skin) card.skin = pack.skin;
  if (want.slot && card.key) card.key = `${card.key}#${want.slot}`;
  if (card.special && card.key) card.key = `special:${card.special}:${card.key}`;
  return card;
}

export async function titleCard(want, pack) {
  const [card] = await titleCards([want], pack);
  return card;
}

export async function refreshTitleCard(want, pack = {}) {
  const card = await titleCard(want, pack);
  if (!card) return null;
  if ((want.wiki || want.wikiUrls) && !String(card.sourceId ?? '').startsWith('wiki:')) return null;
  return card;
}

export async function fandomCard(want, pack) {
  let wiki = null;
  for (const apiUrl of want.wikiUrls ?? []) {
    wiki = await probeWiki(apiUrl).catch(() => null);
    if (wiki) break;
  }
  if (!wiki && want.wiki) wiki = await resolveCustomWiki(want.wiki).catch(() => null);
  if (!wiki) return null;
  let hit = want.page ? await pageByTitle(wiki, want.page) : null;
  if (!hit) {
    const queries = Array.isArray(want.search) ? want.search : [want.search ?? want.title];
    for (const q of queries) {
      const params = new URLSearchParams({
        action: 'query', list: 'search', srsearch: q, srnamespace: '0', srlimit: '5', format: 'json', origin: '*'
      });
      const rows = (await fetchJson(`${wiki.apiUrl}?${params}`).catch(() => null))?.query?.search ?? [];
      hit = rows.find((r) => r.pageid && !/\/|disambiguation/i.test(r.title)) ?? null;
      if (hit) break;
    }
  }
  if (!hit) return null;
  const detail = await customPageDetail(wiki, hit.pageid);
  if (!detail) return null;
  let extract = String(detail.extract ?? '').trim();
  if (extract.length < 40) extract = (await customLeadText(wiki, hit.pageid).catch(() => null)) ?? extract;
  if (extract.length < 40 && want.text) extract = want.text;
  const thumbnail = bestImage(detail)
    ?? await firstPhotoOn(wiki.apiUrl, hit.pageid)
    ?? platePicture(pack.fallbackArt ?? '#94a3b8', want.name ?? detail.title);
  const host = new URL(wiki.apiUrl);
  const card = toCard({
    sourceId: `wiki:${host.host}${host.pathname.replace('/api.php', '')}`,
    sourceName: wiki.sitename ?? host.host,
    pageId: detail.pageid,
    title: detail.title,
    description: want.name ? detail.title : (wiki.sitename ?? ''),
    extract: extract || detail.title,
    thumbnail,
    url: detail.fullurl ?? `${wiki.server ?? 'https://' + host.host}${(wiki.articlePath ?? '/wiki/$1').replace('$1', encodeTitle(detail.title))}`,
    views: null,
    wordCount: detail.length ? Math.round(detail.length / 6) : null
  });
  if (want.name) { card.article = card.title; card.title = want.name; }
  return card;
}

export const CHROME_FILE = /(commons-logo|wikimedia|wikipedia|wiktionary|wikisource|wikiquote|wikidata|ambox|question_book|padlock|lock-|edit-icon|nuvola|crystal_|folder|disambig|portal|symbol_|_icon|icon_|arrow|stub|magnify|sound-icon|speaker|red_pencil|text_document|office-book|gnome-)/i;

export async function firstPhotoOn(apiUrl, pageId) {
  try {
    const params = new URLSearchParams({
      action: 'query', pageids: String(pageId), generator: 'images', gimlimit: '30',
      prop: 'imageinfo', iiprop: 'url|mime|size', iiurlwidth: '640', format: 'json', origin: '*'
    });
    const files = pagesOf(await fetchJson(`${apiUrl}?${params}`));
    const usable = files
      .map((f) => ({ name: String(f.title ?? '').replace(/^[^:]*:/, ''), info: f.imageinfo?.[0] }))
      .filter((f) => f.info && /image\/(jpeg|png|webp|svg)/.test(f.info.mime ?? '') && (f.info.width ?? 0) >= 160)
      .filter((f) => !CHROME_FILE.test(f.name));
    usable.sort((a, b) => ((b.info.width ?? 0) * (b.info.height ?? 0)) - ((a.info.width ?? 0) * (a.info.height ?? 0)));
    const photo = usable[0]?.info;
    return photo?.thumburl ?? photo?.url ?? null;
  } catch {
    return null;
  }
}

export async function pageByTitle(wiki, title) {
  const params = new URLSearchParams({
    action: 'query', titles: title, redirects: '1', format: 'json', origin: '*'
  });
  const page = pagesOf(await fetchJson(`${wiki.apiUrl}?${params}`).catch(() => null) ?? {})
    .find((p) => p.pageid && !p.missing);
  return page ?? null;
}

export async function restImage(title, lang) {
  try {
    const data = await fetchJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeTitle(title)}`);
    return data?.thumbnail?.source ?? data?.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

export async function resolveTitle(title, lang) {
  const params = new URLSearchParams({
    action: 'query', titles: title, redirects: '1',
    ...pageProps(), format: 'json', origin: '*'
  });
  try {
    const page = pagesOf(await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`))
      .find((p) => p.pageid && !p.missing);
    if (!page) return null;
    page.lang = lang;
    return page;
  } catch {
    return null;
  }
}

export async function firstPhoto(page, lang) {
  return firstPhotoOn(`https://${lang}.wikipedia.org/w/api.php`, page.pageid);
}

export function platePicture(colour, title) {
  return ('data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
  + `<stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="#0b0d18"/></linearGradient></defs>`
  + `<rect width="640" height="400" fill="url(#g)"/><text x="320" y="216" text-anchor="middle" font-family="system-ui,sans-serif" `
  + `font-size="44" font-weight="800" fill="rgba(255,255,255,0.86)">${String(title).replace(/[<>&]/g, ' ').slice(0, 26)}</text></svg>`));
}

export async function articlePicture(page, want, lang) {
  const found = bestImage(page) ?? await restImage(page.title, lang) ?? await firstPhoto(page, lang);
  if (found) return found;
  if (lang === 'en') return null;
  const title = want.fallback ?? want.title ?? page.title;
  const twin = await resolveTitle(title, 'en');
  if (!twin) return await restImage(title, 'en');
  return bestImage(twin) ?? await restImage(twin.title, 'en') ?? await firstPhoto(twin, 'en');
}

export async function namedCard(page, want, pack) {
  const lang = page.lang ?? wikiLang();
  const views = viewsOf(page) ?? await fetchMonthlyViewsOn(page.title, lang).catch(() => null);
  const thumbnail = await articlePicture(page, want, lang).catch(() => null)
    ?? platePicture(pack.fallbackArt ?? '#94a3b8', want.name ?? page.title);
  const extract = String(page.extract ?? '').trim() || String(page.description ?? '').trim()
    || want.text || (want.name ?? page.title);
  const card = toCard({
    sourceId: `wikipedia:${lang}`,
    sourceName: 'Wikipedia',
    pageId: page.pageid,
    title: page.title,
    description: page.description,
    extract,
    thumbnail,
    url: page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeTitle(page.title)}`,
    views,
    wordCount: null
  });
  if (want.name) { card.article = card.title; card.title = want.name; }
  card.lang = lang;
  return card;
}

export function placeholderCard(want, pack) {
  const title = want.name ?? want.title;
  return toCard({
    sourceId: `wikipedia:${wikiLang()}`,
    sourceName: 'Wikipedia',
    pageId: null,
    title,
    description: '',
    extract: want.text || title,
    thumbnail: platePicture(pack.fallbackArt ?? '#94a3b8', title),
    url: want.link
      ?? (want.wikiUrls?.[0]
        ? want.wikiUrls[0].replace(/\/api\.php$/, `/wiki/${encodeTitle(want.page ?? want.fallback ?? want.title)}`)
        : `https://${wikiLang()}.wikipedia.org/wiki/${encodeTitle(want.title)}`),
    views: null,
    wordCount: null
  });
}

export async function fetchMonthlyViewsOn(title, lang) {
  const [start, end] = pageviewRange();
  const url = `${PAGEVIEWS}/${lang}.wikipedia/all-access/user/${encodeTitle(title)}/monthly/${start}/${end}`;
  const items = (await fetchJson(url))?.items ?? [];
  if (!items.length) return null;
  return Math.round(items.reduce((sum, item) => sum + (item.views ?? 0), 0) / items.length);
}
