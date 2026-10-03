import { getLanguage } from '../i18n.js';
import { popularityFromWordCount } from '../pricing.js';
import { ACTION, DRAW_BUDGET_MS, encodeTitle, fetchJson, offline, pick, thumbSize } from './core.js';
import { cappedWishes, rollWishes, settleWishes, stampPrints } from './draw.js';
import { POOL_LIMIT, pagesOf } from './fetch.js';
import { BAD_SUFFIX, BAD_TITLE, isUsableText, toCard } from './filter.js';
import { MIN_ARTICLES, farmOf, findWikis, foldName, probeSite, slugsFor } from './finder.js';
import { findPictures, textPicture } from './art.js';
import { maturePage } from './mature.js';

export const candidateSlugs = slugsFor;

export async function probeWiki(apiUrl) {
  const info = await probeSite(apiUrl);
  if (!info || info.articles < MIN_ARTICLES) return null;
  return info;
}

export async function resolveCustomWiki(name, { allowMature = false, fandom = typeof document === 'undefined' } = {}) {
  const found = await findWikis(name, { lang: getLanguage(), allowMature, fandom });
  const best = (found.results ?? []).find((r) => !r.topic) ?? found.results?.[0];
  if (!best) throw new Error('NO_WIKI');
  return best;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (all, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

export function stripHtml(html) {
  return decodeEntities(String(html ?? '')
    .replace(/<(table|style|script|sup)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(a|b|i|u|s|em|strong|span|small|abbr|cite|code|bdi)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+([,.])/g, '$1');
}

export function htmlToText(html) {
  if (typeof DOMParser === 'undefined') {
    const clean = String(html ?? '').replace(/<(table|style|script|sup)\b[\s\S]*?<\/\1>/gi, '');
    const paras = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripHtml(m[1]).replace(/\s+/g, ' ').trim());
    return (paras.find((t) => t.length > 80) ?? stripHtml(clean)).replace(/\s+/g, ' ').trim().slice(0, 600);
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('table, style, script, sup, .infobox, .navbox').forEach((n) => n.remove());
  const p = [...doc.querySelectorAll('p')].map((n) => n.textContent.trim()).find((t) => t.length > 80);
  return (p ?? doc.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
}

export function imagesIn(html) {
  if (typeof DOMParser === 'undefined') {
    const attr = (tag, name) => decodeEntities(tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1]
      ?? tag.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, 'i'))?.[1] ?? '');
    return [...String(html ?? '').matchAll(/<img\b[^>]*>/gi)].map(([tag]) => ({
      src: attr(tag, 'data-src') || attr(tag, 'src'),
      width: Number(attr(tag, 'width')) || 0,
      height: Number(attr(tag, 'height')) || 0
    }));
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('img')].map((img) => ({
    src: img.getAttribute('data-src') || img.getAttribute('src') || '',
    width: Number(img.getAttribute('width')) || 0,
    height: Number(img.getAttribute('height')) || 0
  }));
}

export const JUNK_IMAGE =
  /(icon|logo|wiki-wordmark|favicon|badge|stub|placeholder|button|sprite|ui[-_]|site-?background|community|discord|twitter|facebook|edit|arrow|bullet|spacer|blank|transparent|nav|banner|header|footer)/i;

export const MIN_IMAGE_EDGE = 180;

export const MIN_IMAGE_AREA = 60000;

export function upgradeImageUrl(url, width = 640) {
  if (typeof url !== 'string' || !url) return url;
  if (!/static\.wikia\.nocookie\.net|\/revision\/latest/.test(url)) return url;
  return url
    .replace(/\/scale-to-width-down\/\d+/, `/scale-to-width-down/${width}`)
    .replace(/\/scale-to-width\/\d+/, `/scale-to-width/${width}`)
    .replace(/\/smart\/width\/\d+\/height\/\d+/, `/scale-to-width-down/${width}`)
    .replace(/\/window-crop\/width\/\d+\/[^?]*/, `/scale-to-width-down/${width}`);
}

export function usableThumb(page, width = 640) {
  const thumb = page?.thumbnail;
  if (!thumb?.source) return null;
  if (Number.isFinite(thumb.width) && thumb.width < MIN_IMAGE_EDGE) {
    const bigger = upgradeImageUrl(thumb.source, width);
    return bigger !== thumb.source ? bigger : null;
  }
  return upgradeImageUrl(thumb.source, width);
}

export function titleWords(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9À-ſ\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

export async function customLeadHtml(wiki, pageId) {
  const params = new URLSearchParams({
    action: 'parse', pageid: String(pageId), prop: 'text', section: '0',
    format: 'json', origin: '*'
  });
  return (await fetchJson(`${wiki.apiUrl}?${params}`))?.parse?.text?.['*'] ?? null;
}

export function leadImageIn(html) {
  if (!html) return null;
  for (const { src, width, height } of imagesIn(html)) {
    if (!src || src.startsWith('data:')) continue;
    let name = src.split('?')[0];
    try { name = decodeURIComponent(name); } catch {}
    if (JUNK_IMAGE.test(name)) continue;
    if (width && width < 80) continue;
    if (height && height < 60) continue;
    return upgradeImageUrl(src.startsWith('//') ? `https:${src}` : src, 640);
  }
  return null;
}

export async function customLeadImage(wiki, pageId) {
  try {
    return leadImageIn(await customLeadHtml(wiki, pageId));
  } catch {
    return null;
  }
}

export async function customPageImage(wiki, pageId, title = '') {
  try {
    const params = new URLSearchParams({
      action: 'query', pageids: String(pageId), generator: 'images', gimlimit: '24',
      prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '640',
      format: 'json', origin: '*'
    });
    const pages = Object.values((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.pages ?? {});
    const words = titleWords(title);
    const usable = pages
      .map((p) => ({ title: p.title ?? '', info: p.imageinfo?.[0] }))
      .filter(({ title: name, info }) => info && name && !JUNK_IMAGE.test(name))
      .filter(({ title: name, info }) =>
        /^image\/(jpeg|png|webp)$/i.test(info.mime ?? '') || /\.(jpe?g|png|webp)$/i.test(name))
      .filter(({ info }) => {
        const w = info.width ?? 0;
        const h = info.height ?? 0;
        if (!w || !h) return true;
        if (w < MIN_IMAGE_EDGE || h < MIN_IMAGE_EDGE * 0.6) return false;
        if (w / h > 4 || h / w > 4) return false;
        return w * h >= MIN_IMAGE_AREA;
      })
      .map((candidate) => {
        const name = candidate.title.toLowerCase();
        const hits = words.filter((word) => name.includes(word)).length;
        const area = (candidate.info.width ?? 0) * (candidate.info.height ?? 0);
        return { ...candidate, hits, area };
      })
      .sort((a, b) => b.hits - a.hits || b.area - a.area);

    const best = usable[0]?.info;
    if (!best) return null;
    return upgradeImageUrl(best.thumburl ?? best.url, 640);
  } catch {
    return null;
  }
}

export function detailProps(limit = POOL_LIMIT) {
  return {
    prop: 'extracts|pageimages|info|categories|pageprops',
    exintro: '1', explaintext: '1', exchars: '600', exlimit: String(limit),
    piprop: 'thumbnail|original', pithumbsize: thumbSize(), pilimit: String(limit),
    cllimit: 'max', ppprop: 'wikibase_item',
    inprop: 'url', format: 'json', origin: '*'
  };
}

export async function customPageDetail(wiki, pageId) {
  const params = new URLSearchParams({ action: 'query', pageids: String(pageId), ...detailProps(1) });
  return (await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.pages?.[pageId] ?? null;
}

export async function customLeadText(wiki, pageId) {
  const html = await customLeadHtml(wiki, pageId);
  return html ? htmlToText(html) : null;
}

export const langTwinCache = new Map();

export async function wikiForLanguage(wiki) {
  const lang = getLanguage();
  if (wiki.topic) return wiki;
  const farm = wiki.farm ?? farmOf(wiki.apiUrl);
  if (farm !== 'fandom' && farm !== 'wikigg') return wiki;
  if ((wiki.lang ?? 'en') === lang) return wiki;
  const base = wiki.apiUrl.replace(/\/[a-z]{2}\/api\.php$/, '/api.php');
  const twinUrl = lang === 'en' ? base : base.replace(/\/api\.php$/, `/${lang}/api.php`);
  if (twinUrl === wiki.apiUrl) return wiki;
  const keep = (twin) => (twin ? { ...twin, mature: Boolean(wiki.mature || twin.mature) } : wiki);
  if (langTwinCache.has(twinUrl)) return keep(langTwinCache.get(twinUrl));
  try {
    const twin = await probeWiki(twinUrl);
    langTwinCache.set(twinUrl, twin);
    return keep(twin);
  } catch {
    langTwinCache.set(twinUrl, null);
    return wiki;
  }
}

export async function randomIds(wiki, limit = 20) {
  const params = new URLSearchParams({
    action: 'query', list: 'random', rnnamespace: '0', rnlimit: String(limit),
    format: 'json', origin: '*'
  });
  return ((await fetchJson(`${wiki.apiUrl}?${params}`))?.query?.random ?? [])
    .filter((r) => r.id).map((r) => r.id);
}

export async function customPagesDetail(wiki, ids) {
  const params = new URLSearchParams({ action: 'query', pageids: ids.slice(0, POOL_LIMIT).join('|'), ...detailProps() });
  return pagesOf(await fetchJson(`${wiki.apiUrl}?${params}`));
}

const WIKIPEDIA_HOST = /^([a-z-]{2,12})\.wikipedia\.org$/;

export function wikiSourceId(wiki) {
  const host = new URL(wiki.apiUrl);
  const wikipedia = WIKIPEDIA_HOST.exec(host.hostname);
  if (wikipedia) return `wikipedia:${wikipedia[1]}`;
  return `wiki:${host.host}${host.pathname.replace('/api.php', '')}`;
}

export const poolKey = (wiki) => (wiki?.topic ? `${wiki.apiUrl}#${foldName(wiki.topic)}` : wiki?.apiUrl);

export const SUBPAGE = /\/(gallery|quotes?|trivia|history|transcripts?|script|synopsis|appearances?|gameplay|images?|navigation|relationships?|abilities|archive ?\d*|drafts?|sandbox|development|credits|changelog|sounds?|music|dialogues?|navbox|doc|strategy|guide|walkthrough|cosmetics|skins|versions|patch notes|data|overview|galerie|citations|histoire|anecdotes|apparitions)$/i;

export function protoCard(page) {
  if (!page?.pageid || BAD_TITLE.test(page.title) || BAD_SUFFIX.test(page.title) || SUBPAGE.test(page.title)) return null;
  const wordCount = page.length ? Math.round(page.length / 6) : null;
  return { page, popularity: popularityFromWordCount(wordCount), wordCount, text: null, file: null };
}

export const pageText = (page) => {
  const extract = String(page?.extract ?? '').replace(/\s+/g, ' ').trim();
  return extract.length >= 80 ? extract : null;
};

const noTracking = (url) => (typeof url === 'string' ? url.replace(/[?&]utm_source=[^#]*$/, '') : url);

export const pageImage = (page) => noTracking(usableThumb(page, 640) ?? (page?.original?.source ? upgradeImageUrl(page.original.source, 640) : null));

export function isFreeCard(proto) {
  const page = proto.page;
  const extract = pageText(page);
  return Boolean(extract && isUsableText(page.title, extract) && pageImage(page));
}

const FILE_PREFIX = /^\[\[\s*(file|image|fichier|datei|archivo|imagen|immagine|bestand|ficheiro|plik|файл|ファイル|画像|文件)\s*:/i;

function skipBalanced(text, at, open, close) {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    if (text.startsWith(open, i)) { depth++; i += open.length - 1; continue; }
    if (text.startsWith(close, i)) {
      depth--;
      i += close.length - 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

export function leadWikitext(text) {
  let s = String(text ?? '');
  const cut = s.search(/\n==[^=\n][^\n]*==[ \t]*\n/);
  if (cut >= 0) s = s.slice(0, cut);
  s = s.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref\b[^>]*\/>/gi, '')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<gallery\b[\s\S]*?<\/gallery>/gi, '')
    .replace(/__[A-Z]+__/g, '');
  let out = '';
  let lineStart = true;
  for (let i = 0; i < s.length;) {
    if (lineStart && s.startsWith('{{', i)) {
      const end = skipBalanced(s, i, '{{', '}}');
      const next = s.indexOf('\n', end);
      const rest = s.slice(end, next < 0 ? s.length : next);
      if (!rest.trim()) { i = end; continue; }
    }
    if (lineStart && s.startsWith('{|', i)) { i = skipBalanced(s, i, '{|', '|}'); continue; }
    if (s.startsWith('[[', i) && FILE_PREFIX.test(s.slice(i, i + 24))) { i = skipBalanced(s, i, '[[', ']]'); continue; }
    const ch = s[i];
    out += ch;
    if (ch === '\n') lineStart = true;
    else if (ch !== ' ' && ch !== '\t') lineStart = false;
    i++;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

const CUT = (n) => `WKSTCUT${n}X`;

export async function leadTexts(wiki, pages) {
  const found = new Map();
  const list = pages.filter((p) => p?.pageid).slice(0, POOL_LIMIT);
  if (!list.length) return found;
  const params = new URLSearchParams({
    action: 'query', pageids: list.map((p) => p.pageid).join('|'), prop: 'revisions', rvprop: 'content', rvslots: 'main',
    format: 'json', formatversion: '2', origin: '*'
  });
  const data = await fetchJson(`${wiki.apiUrl}?${params}`);
  const leads = [];
  for (const page of Object.values(data?.query?.pages ?? {})) {
    const rev = page?.revisions?.[0];
    const content = rev?.slots?.main?.content ?? rev?.slots?.main?.['*'] ?? rev?.content ?? rev?.['*'] ?? '';
    const name = String(page.title ?? '');
    const lead = leadWikitext(content)
      .replace(/\{\{\s*(FULLPAGENAME|PAGENAME|BASEPAGENAME|ROOTPAGENAME|ARTICLEPAGENAME)E?\s*\}\}/g, name)
      .replace(/\{\{\s*SUBPAGENAME\s*\}\}/g, name.split('/').pop());
    if (lead.length >= 40 && !/^#redirect/i.test(lead)) leads.push({ id: page.pageid, lead });
  }
  if (!leads.length) return found;
  const text = `${leads.map(({ id, lead }) => `${CUT(id)}\n\n${lead}`).join('\n\n')}\n\n${CUT(0)}\n\n<references />`;
  const parsed = await fetchJson(`${wiki.apiUrl}?origin=*`, {
    form: {
      action: 'parse', format: 'json', formatversion: '2', prop: 'text', contentmodel: 'wikitext',
      disablelimitreport: '1', disableeditsection: '1', disabletoc: '1', title: 'Wikster', text
    }
  });
  const html = typeof parsed?.parse?.text === 'string' ? parsed.parse.text : parsed?.parse?.text?.['*'] ?? '';
  const parts = String(html).split(/WKSTCUT(\d+)X/);
  for (let i = 1; i < parts.length; i += 2) {
    const id = Number(parts[i]);
    if (!id) continue;
    const body = htmlToText(String(parts[i + 1] ?? '').replace(/<(strong|span|div|p|sup)\b[^>]*class="[^"]*\b(error|reference)\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, ''));
    if (body) found.set(id, body);
  }
  return found;
}

export async function pageFiles(wiki, pages) {
  const found = new Map();
  const list = pages.filter((p) => p?.pageid).slice(0, POOL_LIMIT);
  if (!list.length) return found;
  const data = await fetchJson(`${wiki.apiUrl}?${new URLSearchParams({
    action: 'query', pageids: list.map((p) => p.pageid).join('|'), prop: 'images', imlimit: 'max', format: 'json', origin: '*'
  })}`);
  const picks = new Map();
  for (const page of Object.values(data?.query?.pages ?? {})) {
    const words = titleWords(page.title);
    const files = (page.images ?? []).map((f) => f.title).filter((name) => name && !JUNK_IMAGE.test(name) && /\.(jpe?g|png|webp)$/i.test(name))
      .map((name) => ({ name, hits: words.filter((w) => name.toLowerCase().includes(w)).length }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 2);
    if (files.length) picks.set(page.pageid, files.map((f) => f.name));
  }
  const names = [...new Set([...picks.values()].flat())].slice(0, 50);
  if (!names.length) return found;
  const info = await fetchJson(`${wiki.apiUrl}?${new URLSearchParams({
    action: 'query', titles: names.join('|'), prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '640', format: 'json', origin: '*'
  })}`);
  const normal = new Map((info?.query?.normalized ?? []).map((n) => [n.from, n.to]));
  const byName = new Map(Object.values(info?.query?.pages ?? {}).map((p) => [p.title, p.imageinfo?.[0]]));
  for (const [id, files] of picks) {
    for (const name of files) {
      const meta = byName.get(normal.get(name) ?? name);
      if (!meta) continue;
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w && h && (w < MIN_IMAGE_EDGE || h < MIN_IMAGE_EDGE * 0.6 || w / h > 4 || h / w > 4 || w * h < MIN_IMAGE_AREA)) continue;
      const src = meta.thumburl ?? meta.url;
      if (src) { found.set(id, upgradeImageUrl(src.startsWith('//') ? `https:${src}` : src, 640)); break; }
    }
  }
  return found;
}

export function customCard(wiki, proto, pack, extract, art) {
  const { page } = proto;
  const wikipedia = WIKIPEDIA_HOST.test(new URL(wiki.apiUrl).hostname);
  const card = toCard({
    sourceId: wikiSourceId(wiki),
    sourceName: wikipedia ? 'Wikipedia' : wiki.sitename,
    pageId: page.pageid,
    title: page.title,
    description: pack.name,
    extract,
    thumbnail: art.thumbnail,
    url: page.fullurl ?? `${wiki.server ?? new URL(wiki.apiUrl).origin}${(wiki.articlePath ?? '/wiki/$1').replace('$1', encodeTitle(page.title))}`,
    views: null,
    wordCount: proto.wordCount
  });
  if (art.picture) card.picture = art.picture;
  if (wiki.mature) card.mature = true;
  return card;
}

const lookOf = (pack, wiki) => ({ subject: pack.name ?? wiki.sitename ?? '', icon: pack.look?.icon ?? 'wand', accent: pack.look?.accent, accent2: pack.look?.accent2 });

export async function finishCustomCard(wiki, proto, pack) {
  const { page } = proto;
  let lead;
  const leadHtml = () => (lead ??= customLeadHtml(wiki, page.pageid).catch(() => null));
  let extract = pageText(page) ?? proto.text;
  if (!extract) {
    const html = await leadHtml();
    extract = html ? htmlToText(html) : null;
  }
  if (!isUsableText(page.title, extract)) throw new Error('NO_TEXT');
  if (!wiki.mature && maturePage(page, extract)) throw new Error('MATURE');
  const own = pageImage(page) ?? proto.file ?? leadImageIn(await leadHtml()) ?? await customPageImage(wiki, page.pageid, page.title);
  const look = lookOf(pack, wiki);
  const art = own ? { thumbnail: own }
    : (await findPictures([page], { apiUrl: wiki.apiUrl, hint: wiki.topic ?? pack.name, allowMature: Boolean(wiki.mature), look, deadline: Date.now() + 6000 }).catch(() => null))?.get(page.title)
      ?? textPicture(page.title, look);
  return customCard(wiki, proto, pack, extract, art);
}

export async function huntCustomCard(wiki, pack, seen, deadline, tally) {
  for (let attempt = 0; attempt < 8 && Date.now() < deadline && !offline(); attempt++) {
    const rows = wiki.topic
      ? (await randomDetailed(wiki).catch(() => [])).map((p) => ({ id: p.pageid, title: p.title }))
      : ((await fetchJson(`${wiki.apiUrl}?${new URLSearchParams({
        action: 'query', list: 'random', rnnamespace: '0', rnlimit: '6', format: 'json', origin: '*'
      })}`).catch(() => null))?.query?.random ?? []);
    const fresh = rows.filter((r) => r.id && !seen.has(r.title));
    if (!fresh.length) continue;
    const choice = pick(fresh);
    seen.add(choice.title);
    const page = await customPageDetail(wiki, choice.id).catch(() => null);
    const proto = protoCard(page);
    if (!proto) { tally.other++; continue; }
    try {
      return await finishCustomCard(wiki, proto, pack);
    } catch (err) {
      tallyMiss(tally, err?.message);
    }
  }
  return null;
}

export function tallyMiss(tally, reason) {
  const slot = reason === 'NO_TEXT' ? 'noText' : reason === 'NO_IMAGE' ? 'noImage' : reason === 'MATURE' ? 'mature' : 'other';
  tally[slot] = (tally[slot] ?? 0) + 1;
}

const topicHits = new Map();

export async function topicDetailed(wiki) {
  const key = poolKey(wiki);
  const known = topicHits.get(key) ?? 0;
  const roam = Math.min(known, 400) - POOL_LIMIT;
  const offset = roam > 0 ? Math.floor(Math.random() * roam) : 0;
  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `"${String(wiki.topic).replace(/"/g, '')}"`, gsrnamespace: '0',
    gsrlimit: String(POOL_LIMIT), gsroffset: String(offset), gsrinfo: 'totalhits', ...detailProps()
  });
  const data = await fetchJson(`${wiki.apiUrl}?${params}`);
  const hits = Number(data?.query?.searchinfo?.totalhits);
  if (Number.isFinite(hits)) topicHits.set(key, hits);
  return pagesOf(data);
}

export async function randomDetailed(wiki) {
  if (wiki.topic) return topicDetailed(wiki);
  const params = new URLSearchParams({
    action: 'query', generator: 'random', grnnamespace: '0', grnlimit: String(POOL_LIMIT), ...detailProps()
  });
  return pagesOf(await fetchJson(`${wiki.apiUrl}?${params}`));
}

export async function pageBatch(wiki) {
  const direct = await randomDetailed(wiki).catch(() => []);
  if (direct.length || wiki.topic) return direct;
  const ids = await randomIds(wiki, 20).catch(() => []);
  if (!ids.length) return [];
  const details = await customPagesDetail(wiki, ids).catch(() => []);
  if (details.length) return details;
  return (await Promise.all(ids.slice(0, 10).map((id) => customPageDetail(wiki, id).catch(() => null)))).filter(Boolean);
}

export const CUSTOM_ROUNDS = 6;

export const CUSTOM_LANES = 2;

const beforeDeadline = (promise, deadline) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(() => resolve(null), Math.max(0, deadline - Date.now())))
]);

export async function gatherCustom(wiki, pack, wanted, seen, deadline, tally, { width = CUSTOM_LANES, rounds = CUSTOM_ROUNDS } = {}) {
  const out = [];
  const late = () => Date.now() > deadline || offline();
  const look = lookOf(pack, wiki);
  for (let round = 0; out.length < wanted && round < rounds && !late();) {
    const lanes = Math.min(width, rounds - round);
    round += lanes;
    const batches = await beforeDeadline(Promise.all(Array.from({ length: lanes }, () => pageBatch(wiki))), deadline) ?? [];
    const protos = batches.flat().map(protoCard).filter((proto) => proto && !seen.has(proto.page.title));
    for (const proto of protos) seen.add(proto.page.title);

    const short = protos.filter((proto) => !pageText(proto.page));
    if (short.length && !late()) {
      const texts = await beforeDeadline(leadTexts(wiki, short.map((p) => p.page)).catch(() => null), deadline);
      for (const proto of short) proto.text = texts?.get(proto.page.pageid) ?? null;
    }
    const ready = [];
    const later = [];
    for (const proto of protos) {
      const text = pageText(proto.page) ?? proto.text;
      if (!text) { later.push(proto); continue; }
      if (!isUsableText(proto.page.title, text)) { tally.noText++; continue; }
      if (!wiki.mature && maturePage(proto.page, text)) { tallyMiss(tally, 'MATURE'); continue; }
      proto.text = text;
      ready.push(proto);
    }
    const bare = ready.filter((proto) => !pageImage(proto.page));
    if (bare.length && !late() && out.length + ready.length - bare.length < wanted) {
      const files = await beforeDeadline(pageFiles(wiki, bare.map((p) => p.page)).catch(() => null), deadline);
      for (const proto of bare) proto.file = files?.get(proto.page.pageid) ?? null;
    }
    for (const proto of ready) {
      const own = pageImage(proto.page) ?? proto.file;
      if (own) out.push(customCard(wiki, proto, pack, proto.text, { thumbnail: own }));
    }
    const need = wanted - out.length;
    const still = ready.filter((proto) => !pageImage(proto.page) && !proto.file);
    if (need > 0 && still.length && !late()) {
      const picks = still.slice(0, need + 2);
      const arts = await beforeDeadline(findPictures(picks.map((p) => p.page), {
        apiUrl: wiki.apiUrl, hint: wiki.topic ?? pack.name, allowMature: Boolean(wiki.mature), look, deadline
      }).catch(() => null), deadline);
      const made = picks.map((proto) => customCard(wiki, proto, pack, proto.text, arts?.get(proto.page.title) ?? textPicture(proto.page.title, look)));
      out.push(...made.sort((a, b) => (a.picture?.source === 'text' ? 1 : 0) - (b.picture?.source === 'text' ? 1 : 0)));
    }
    const missing = wanted - out.length;
    if (missing > 0 && later.length && !late()) {
      const built = await Promise.all(later.slice(0, missing + 2).map((proto) =>
        beforeDeadline(finishCustomCard(wiki, proto, pack).catch((err) => { tallyMiss(tally, err?.message); return null; }), deadline)));
      for (const card of built) if (card) out.push(card);
    }
    console.info(`Wikster custom draw "${pack.name}" on ${wiki.apiUrl}: round ${round}, ${protos.length} candidates, ${out.length} cards; turned away: ${tally.noText} without text, ${tally.mature ?? 0} mature, ${tally.other} other`);
    if (batches.every((batch) => !batch.length)) break;
  }
  return out;
}

let customPool = null;

export function useCustomPool(pool) {
  customPool = pool;
}

export const POOL_LOW = 30;

export const POOL_HARVEST = 40;

export const HARVEST_BUDGET_MS = 40000;

const harvesting = new Set();

async function harvest(wiki, pack) {
  if (!customPool || harvesting.has(poolKey(wiki))) return;
  harvesting.add(poolKey(wiki));
  try {
    const tally = { noText: 0, noImage: 0, other: 0 };
    const cards = await gatherCustom(wiki, pack, POOL_HARVEST, new Set(), Date.now() + HARVEST_BUDGET_MS, tally);
    if (cards.length) await customPool.put(poolKey(wiki), cards);
  } finally {
    harvesting.delete(poolKey(wiki));
  }
}

export async function warmCustomPool(pack) {
  if (!customPool || !pack?.wiki?.apiUrl) return;
  const wiki = await wikiForLanguage(pack.wiki);
  const { left } = await customPool.take(poolKey(wiki), 0);
  if (left < POOL_LOW) await harvest(wiki, pack);
}

export const spareCustom = new Map();

export const SPARE_KEEP = 40;

export async function drawCustomSet(pack, { budget = DRAW_BUDGET_MS } = {}) {
  const wanted = Math.max(1, pack.cards ?? 5);
  const deadline = Date.now() + budget;
  if (offline()) throw new Error('OFFLINE');

  const wiki = await wikiForLanguage(pack.wiki);
  const wishes = cappedWishes(pack, rollWishes(pack, wanted));
  const out = [];
  const seen = new Set();
  const tally = { noText: 0, noImage: 0, other: 0 };
  const keep = (card) => {
    if (out.length >= wanted || seen.has(card?.title)) return false;
    seen.add(card.title);
    if (!wiki.mature && (card.mature || maturePage(card))) return false;
    out.push({ ...card, description: pack.name, lang: getLanguage(), ...(wiki.mature ? { mature: true } : {}) });
    return true;
  };

  let left = null;
  if (customPool) {
    const got = await customPool.take(poolKey(wiki), wanted).catch(() => null);
    for (const card of got?.cards ?? []) keep(card);
    left = Number.isFinite(got?.left) ? got.left : null;
  } else {
    const spares = spareCustom.get(poolKey(wiki)) ?? [];
    while (spares.length && out.length < wanted) keep(spares.shift());
  }
  const pooled = out.length;

  let extra = [];
  if (out.length < wanted) {
    const found = await gatherCustom(wiki, pack, wanted - out.length, seen, deadline, tally);
    out.push(...found.slice(0, wanted - out.length));
    extra = found.slice(wanted - pooled);
  }

  for (let pass = 0; out.length < wanted && pass < 3 && Date.now() < deadline && !offline(); pass++) {
    const hunted = await Promise.all(Array.from({ length: wanted - out.length },
      () => beforeDeadline(huntCustomCard(wiki, pack, seen, deadline, tally), deadline)));
    for (const card of hunted) if (card && out.length < wanted) out.push(card);
  }

  if (customPool && left != null) {
    const topUp = async () => {
      if (extra.length) await customPool.put(poolKey(wiki), extra);
      if (left + extra.length < POOL_LOW) await harvest(wiki, pack);
    };
    customPool.later(topUp());
  } else if (!customPool && extra.length) {
    spareCustom.set(poolKey(wiki), [...(spareCustom.get(poolKey(wiki)) ?? []), ...extra].slice(-SPARE_KEEP));
  }
  console.info(`Wikster custom draw "${pack.name}": ${pooled} from the stock, ${out.length - pooled} drawn live`);
  if (out.length < wanted) console.warn(`Wikster custom draw "${pack.name}": ${out.length} of ${wanted} cards`);

  if (!out.length) {
    await fetchJson(`${wiki.apiUrl}?${new URLSearchParams({ action: 'query', meta: 'siteinfo', format: 'json', origin: '*' })}`, { timeout: 4000 });
    throw new Error(`No usable page found on ${wiki.sitename}`);
  }
  const dealt = out.slice(0, wanted);
  return stampPrints(dealt, settleWishes(pack, wishes, dealt.length));
}

export const MANY_CUSTOM_LANES = 6;

export async function drawCustomMany(pack, n, { budget = DRAW_BUDGET_MS } = {}) {
  const sets = Math.max(1, Math.floor(Number(n) || 1));
  if (sets === 1) return [await drawCustomSet(pack, { budget })];
  const wanted = Math.max(1, pack.cards ?? 5);
  const total = wanted * sets;
  const deadline = Date.now() + budget;
  if (offline()) throw new Error('OFFLINE');

  const wiki = await wikiForLanguage(pack.wiki);
  const out = [];
  const seen = new Set();
  const tally = { noText: 0, noImage: 0, other: 0 };
  const keep = (card) => {
    if (out.length >= total || seen.has(card?.title)) return false;
    seen.add(card.title);
    if (!wiki.mature && (card.mature || maturePage(card))) return false;
    out.push({ ...card, description: pack.name, lang: getLanguage(), ...(wiki.mature ? { mature: true } : {}) });
    return true;
  };

  let left = null;
  if (customPool) {
    const got = await customPool.take(poolKey(wiki), total).catch(() => null);
    for (const card of got?.cards ?? []) keep(card);
    left = Number.isFinite(got?.left) ? got.left : null;
  } else {
    const spares = spareCustom.get(poolKey(wiki)) ?? [];
    while (spares.length && out.length < total) keep(spares.shift());
  }
  const pooled = out.length;

  let extra = [];
  if (out.length < total) {
    const missing = total - out.length;
    const width = Math.min(MANY_CUSTOM_LANES, Math.max(CUSTOM_LANES, Math.ceil(missing / 10)));
    const found = await gatherCustom(wiki, pack, missing, seen, deadline, tally, { width, rounds: Math.max(CUSTOM_ROUNDS, width * 3) });
    out.push(...found.slice(0, total - out.length));
    extra = found.slice(missing);
  }
  if (customPool && left != null) {
    const topUp = async () => {
      if (extra.length) await customPool.put(poolKey(wiki), extra);
      if (left + extra.length < POOL_LOW) await harvest(wiki, pack);
    };
    customPool.later(topUp());
  } else if (!customPool && extra.length) {
    spareCustom.set(poolKey(wiki), [...(spareCustom.get(poolKey(wiki)) ?? []), ...extra].slice(-SPARE_KEEP));
  }
  console.info(`Wikster custom draw x${sets} "${pack.name}": ${pooled} from the stock, ${out.length - pooled} drawn live`);
  if (!out.length) throw new Error(`No usable page found on ${wiki.sitename}`);
  const result = [];
  for (let i = 0; i < sets && i * wanted < out.length; i++) {
    const set = out.slice(i * wanted, (i + 1) * wanted);
    if (set.length < wanted && result.length) break;
    result.push(stampPrints(set, settleWishes(pack, cappedWishes(pack, rollWishes(pack, wanted)), set.length)));
  }
  return result;
}

export async function fetchArticleText(title, { limit = 7000 } = {}) {
  const params = new URLSearchParams({
    action: 'query', titles: title, prop: 'extracts', explaintext: '1',
    exsectionformat: 'plain', format: 'json', origin: '*'
  });
  const pages = (await fetchJson(`${ACTION()}?${params}`))?.query?.pages ?? {};
  const page = Object.values(pages)[0];
  return String(page?.extract ?? '').slice(0, limit);
}
