import { getLanguage } from '../i18n.js';
import { popularityFromWordCount } from '../pricing.js';
import { ACTION, DRAW_BUDGET_MS, encodeTitle, fetchJson, fetchJsonRetry, offline, pick, thumbSize } from './core.js';

export const WIKI_TRIES = 3;
export const WIKI_PATIENCE_MS = 14000;
export const WIKI_TIMEOUT_MS = 12000;

const wikiJson = (url, options = {}) => fetchJsonRetry(url, { tries: WIKI_TRIES, budget: WIKI_PATIENCE_MS, timeout: WIKI_TIMEOUT_MS, ...options });
import { cappedWishes, rollWishes, settleWishes, stampPrints } from './draw.js';
import { POOL_LIMIT, pagesOf } from './fetch.js';
import { BAD_SUFFIX, BAD_TITLE, isUsableText, toCard } from './filter.js';
import { MIN_ARTICLES, farmOf, findWikis, foldName, probeSite, slugsFor } from './finder.js';
import { FILE_BATCH, findPictures, isTextArt, textPicture } from './art.js';
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
  return (await wikiJson(`${wiki.apiUrl}?${params}`))?.parse?.text?.['*'] ?? null;
}

export function leadImageIn(html, base = null) {
  if (!html) return null;
  for (const { src, width, height } of imagesIn(html)) {
    if (!src || src.startsWith('data:')) continue;
    let name = src.split('?')[0];
    try { name = decodeURIComponent(name); } catch {}
    if (JUNK_IMAGE.test(name)) continue;
    if (width && width < 80) continue;
    if (height && height < 60) continue;
    let url = src.startsWith('//') ? `https:${src}` : src;
    if (!/^https?:/i.test(url)) {
      if (!base) continue;
      try { url = new URL(url, base).href; } catch { continue; }
    }
    return upgradeImageUrl(url, 640);
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
    const pages = Object.values((await wikiJson(`${wiki.apiUrl}?${params}`))?.query?.pages ?? {});
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

export const SLOW_DETAIL_MS = 3500;
export const slowExtracts = new Set();

export function detailProps(limit = POOL_LIMIT, { extracts = true } = {}) {
  return {
    prop: extracts ? 'extracts|pageimages|info|categories|pageprops' : 'pageimages|info|categories|pageprops',
    ...(extracts ? { exintro: '1', explaintext: '1', exchars: '600', exlimit: String(limit) } : {}),
    piprop: 'thumbnail|original', pithumbsize: thumbSize(), pilimit: String(limit),
    cllimit: 'max', ppprop: 'wikibase_item|disambiguation|description',
    inprop: 'url', format: 'json', origin: '*'
  };
}

export async function customPageDetail(wiki, pageId) {
  const params = new URLSearchParams({ action: 'query', pageids: String(pageId), ...detailProps(1) });
  return (await wikiJson(`${wiki.apiUrl}?${params}`))?.query?.pages?.[pageId] ?? null;
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
  return ((await wikiJson(`${wiki.apiUrl}?${params}`))?.query?.random ?? [])
    .filter((r) => r.id).map((r) => r.id);
}

export async function detailed(wiki, ask) {
  const slow = slowExtracts.has(wiki.apiUrl);
  const started = Date.now();
  try {
    const data = await wikiJson(`${wiki.apiUrl}?${new URLSearchParams({ ...ask, ...detailProps(POOL_LIMIT, { extracts: !slow }) })}`, slow ? {} : { tries: 1, timeout: SLOW_DETAIL_MS * 2 });
    if (!slow && Date.now() - started > SLOW_DETAIL_MS) slowExtracts.add(wiki.apiUrl);
    return data;
  } catch (error) {
    if (slow || error?.status) throw error;
    slowExtracts.add(wiki.apiUrl);
    return wikiJson(`${wiki.apiUrl}?${new URLSearchParams({ ...ask, ...detailProps(POOL_LIMIT, { extracts: false }) })}`);
  }
}

export async function customPagesDetail(wiki, ids) {
  return pagesOf(await detailed(wiki, { action: 'query', pageids: ids.slice(0, POOL_LIMIT).join('|') }));
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

const SUBPAGE_HEAD = /^[A-Z][\w' -]*s$/;
const VERSION_TITLE = /(^v?\d+\.\d+)|\b(edition|patch|update|server|alpha|beta|classic|pre-?release|snapshot|version|changelog)\b.*\d+\.\d+/i;
const FILE_TITLE = /\.(json|js|css|lua|txt|xml|png|jpe?g|gif|svg|ogg|mp3|wav|nbt|mcfunction)$/i;
const JUNK_NAMESPACE = /^(template|module|user|user talk|talk|mediawiki|help|category|file|forum|message wall|thread|board|blog|special|data|map|widget|property|portal|draft|project):/i;

export function isSubpage(title) {
  const parts = String(title ?? '').split('/');
  if (parts.length < 2 || parts.some((part) => !part.trim())) return false;
  if (parts.length > 2) return true;
  const [head, tail] = parts;
  if (/\s$/.test(head) || /^\s/.test(tail) || head.trim().length < 3) return false;
  return head.trim().length > 4 || !/\s/.test(tail.trim()) || SUBPAGE_HEAD.test(head.trim());
}

export function junkTitle(title, wiki = null) {
  const text = String(title ?? '');
  if (!text || BAD_TITLE.test(text) || BAD_SUFFIX.test(text) || SUBPAGE.test(text) || JUNK_NAMESPACE.test(text) || FILE_TITLE.test(text)) return true;
  let wikipedia = false;
  try { wikipedia = Boolean(wiki?.apiUrl && WIKIPEDIA_HOST.test(new URL(wiki.apiUrl).hostname)); } catch {}
  if (wikipedia) return false;
  return isSubpage(text) || VERSION_TITLE.test(text);
}

const META_CATEGORY = /^(community|polic(y|ies)|guidelines?|help( pages)?|administration|administrators|staff|sandbox(es)?|templates?|navigation( templates)?|navboxes|maintenance|candidates for deletion|guides?|tutorials?|walkthroughs?|strategy guides?|changelogs?|version history|update history|patch notes|updates|versions|disambiguations?|disambiguation pages|set index articles|lists?|lists of .+|.+ lists|galleries|redirects|archives?|users?|user pages|blog posts|forums?|wiki .+|.+ wiki (maintenance|administration|policy|policies|guidelines|staff))$/i;
const META_TITLE = /^(guide|guides|tutorial|tutorials|walkthrough|list|lists|index|changelog|version history|patch notes|sandbox|community|policy|policies|rules|manual of style|main page|home|about|faq|news|recent changes|wiki)\b/i;
const DISAMBIG_TEXT = /\b(may|can|might) (also )?refer to\b|\bis a disambiguation\b/i;
const MOD_WIKI = /\b(mods?|modded|modpack|expansion|overhaul|addon|add-on)\b/i;
const VANILLA_TEXT = /\b(is|are|was|were) an? (vanilla|base[- ]game)\b|\bfor the vanilla\b|\b(from|in) the (base|vanilla|original) game\b|\bvanilla (items?|enem(y|ies)|bosse?s?|npcs?|debuffs?|buffs?|weapons?|blocks?|biomes?|accessor(y|ies)|mechanics?|content|tiles?|structures?|events?)\b/i;
const VANILLA_CATEGORY = /\b(vanilla|base game|from terraria|from minecraft)\b/i;
export const CUSTOM_TEXT_MIN = 100;

export const categoryNames = (page) => (page?.categories ?? []).map((c) => String(c?.title ?? '').replace(/^[^:]+:/, ''));

export function modWiki(wiki) {
  return MOD_WIKI.test(`${wiki?.sitename ?? ''} ${wiki?.topic ?? ''}`);
}

export function offTopic(page, text, wiki) {
  const cats = categoryNames(page);
  if (META_TITLE.test(String(page?.title ?? '')) || cats.some((c) => META_CATEGORY.test(c))) return 'META';
  if (DISAMBIG_TEXT.test(String(text ?? '').slice(0, 300))) return 'META';
  if (modWiki(wiki) && (VANILLA_TEXT.test(String(text ?? '')) || VANILLA_TEXT.test(String(page?.pageprops?.description ?? '')) || cats.some((c) => VANILLA_CATEGORY.test(c)))) return 'VANILLA';
  return null;
}

export function stockable(card, wiki) {
  if (!card?.title || junkTitle(card.title, wiki)) return false;
  if (!card.thumbnail || isTextArt(card.thumbnail)) return false;
  return String(card.extract ?? '').trim().length >= CUSTOM_TEXT_MIN && !offTopic({ title: card.title }, card.extract, wiki);
}

export function protoCard(page, wiki = null) {
  if (!page?.pageid || page.pageprops?.disambiguation !== undefined || junkTitle(page.title, wiki)) return null;
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
  const data = await wikiJson(`${wiki.apiUrl}?${params}`);
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
  const parsed = await wikiJson(`${wiki.apiUrl}?origin=*`, {
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

export const lookOf = (pack, wiki) => ({ subject: pack.name ?? wiki.sitename ?? '', icon: pack.look?.icon ?? 'wand', accent: pack.look?.accent, accent2: pack.look?.accent2 });

export async function finishCustomCard(wiki, proto, pack) {
  const { page } = proto;
  let lead;
  const leadHtml = () => (lead ??= customLeadHtml(wiki, page.pageid).catch(() => null));
  let extract = pageText(page) ?? proto.text;
  if (!extract) {
    const html = await leadHtml();
    extract = html ? htmlToText(html) : null;
  }
  if (!isUsableText(page.title, extract) || String(extract).trim().length < CUSTOM_TEXT_MIN) throw new Error('NO_TEXT');
  if (offTopic(page, extract, wiki)) throw new Error('OFF_TOPIC');
  if (!wiki.mature && maturePage(page, extract)) throw new Error('MATURE');
  const own = pageImage(page) ?? leadImageIn(await leadHtml(), wiki.apiUrl);
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
    const proto = protoCard(page, wiki);
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
  const slot = reason === 'NO_TEXT' ? 'noText' : reason === 'NO_IMAGE' ? 'noImage' : reason === 'MATURE' ? 'mature' : reason === 'OFF_TOPIC' ? 'offTopic' : 'other';
  tally[slot] = (tally[slot] ?? 0) + 1;
}

const topicHits = new Map();

export async function topicDetailed(wiki) {
  const key = poolKey(wiki);
  const known = topicHits.get(key) ?? 0;
  const roam = Math.min(known, 400) - POOL_LIMIT;
  const offset = roam > 0 ? Math.floor(Math.random() * roam) : 0;
  const data = await detailed(wiki, {
    action: 'query', generator: 'search', gsrsearch: `"${String(wiki.topic).replace(/"/g, '')}"`, gsrnamespace: '0',
    gsrlimit: String(POOL_LIMIT), gsroffset: String(offset), gsrinfo: 'totalhits'
  });
  const hits = Number(data?.query?.searchinfo?.totalhits);
  if (Number.isFinite(hits)) topicHits.set(key, hits);
  return pagesOf(data);
}

export async function randomDetailed(wiki) {
  if (wiki.topic) return topicDetailed(wiki);
  return pagesOf(await detailed(wiki, { action: 'query', generator: 'random', grnnamespace: '0', grnlimit: String(POOL_LIMIT) }));
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
  const spare = [];
  const late = () => Date.now() > deadline || offline();
  const look = lookOf(pack, wiki);
  for (let round = 0; out.length < wanted && round < rounds && !late();) {
    const lanes = Math.min(width, rounds - round);
    round += lanes;
    const batches = await beforeDeadline(Promise.all(Array.from({ length: lanes }, () => pageBatch(wiki))), deadline) ?? [];
    const protos = batches.flat().map((page) => protoCard(page, wiki)).filter((proto) => proto && !seen.has(proto.page.title));
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
      if (!isUsableText(proto.page.title, text) || text.length < CUSTOM_TEXT_MIN) { tally.noText++; continue; }
      if (offTopic(proto.page, text, wiki)) { tally.offTopic = (tally.offTopic ?? 0) + 1; continue; }
      if (!wiki.mature && maturePage(proto.page, text)) { tallyMiss(tally, 'MATURE'); continue; }
      proto.text = text;
      ready.push(proto);
    }
    for (const proto of ready) {
      const own = pageImage(proto.page);
      if (own) out.push(customCard(wiki, proto, pack, proto.text, { thumbnail: own }));
    }
    const need = wanted - out.length;
    const still = ready.filter((proto) => !pageImage(proto.page));
    if (need > 0 && still.length && !late()) {
      const picks = still.slice(0, Math.max(need + 2, FILE_BATCH));
      const arts = await beforeDeadline(findPictures(picks.map((p) => p.page), {
        apiUrl: wiki.apiUrl, hint: wiki.topic ?? pack.name, allowMature: Boolean(wiki.mature), look, deadline
      }).catch(() => null), deadline);
      const made = picks.map((proto) => customCard(wiki, proto, pack, proto.text, arts?.get(proto.page.title) ?? textPicture(proto.page.title, look)));
      out.push(...made.filter((card) => card.picture?.source !== 'text'));
      spare.push(...made.filter((card) => card.picture?.source === 'text'));
    }
    const missing = wanted - out.length;
    if (missing > 0 && later.length && !late()) {
      const built = await Promise.all(later.slice(0, missing + 2).map((proto) =>
        beforeDeadline(finishCustomCard(wiki, proto, pack).catch((err) => { tallyMiss(tally, err?.message); return null; }), deadline)));
      for (const card of built) if (card) (card.picture?.source === 'text' ? spare : out).push(card);
    }
    console.info(`Wikster custom draw "${pack.name}" on ${wiki.apiUrl}: round ${round}, ${protos.length} candidates, ${out.length} cards; turned away: ${tally.noText} without text, ${tally.mature ?? 0} mature, ${tally.other} other`);
    if (batches.every((batch) => !batch.length)) break;
  }
  if (out.length < wanted) out.push(...spare.slice(0, wanted - out.length));
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
    if (!stockable(card, wiki)) return false;
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

export async function customPoolKey(pack) {
  const wiki = await wikiForLanguage(pack.wiki);
  return { wiki, key: poolKey(wiki) };
}

export async function gatherCustomFor(pack, total, { budget = DRAW_BUDGET_MS, width = CUSTOM_LANES } = {}) {
  if (offline()) throw new Error('OFFLINE');
  const wiki = await wikiForLanguage(pack.wiki);
  const tally = { noText: 0, noImage: 0, other: 0 };
  const found = await gatherCustom(wiki, pack, total, new Set(), Date.now() + budget, tally, { width, rounds: Math.max(CUSTOM_ROUNDS, width * 3) });
  const out = [];
  const seen = new Set();
  for (const card of found) {
    if (!card?.title || seen.has(card.title)) continue;
    seen.add(card.title);
    if (!wiki.mature && (card.mature || maturePage(card))) continue;
    out.push({ ...card, description: pack.name, lang: getLanguage(), ...(wiki.mature ? { mature: true } : {}) });
  }
  return out;
}

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
    if (!stockable(card, wiki)) return false;
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
