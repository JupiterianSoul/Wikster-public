import { fetchJson } from './core.js';
import { KNOWN_WIKIS, MATURE_WORDS } from '../data/wikis.js';
import { matureCategories, matureSite, matureTopic } from './mature.js';
import { adultCanon, adultQuery, minorsText, minorsWiki } from './safety.js';

const STOP = new Set([
  'the', 'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'of', 'a', 'an', 'el', 'il', 'der', 'die', 'das',
  'wiki', 'wikia', 'fandom', 'pedia', 'wikipedia', 'encyclopedia', 'encyclopedie', 'official', 'community', 'gg', 'www'
]);

export const FIND_TIMEOUT_MS = 4500;
export const FIND_BUDGET_MS = 12000;
export const MAX_PROBES = 16;
export const MIN_ARTICLES = 40;
export const KEEP_SCORE = 0.6;
export const STRONG_SCORE = 0.8;
export const EXACT_SCORE = 0.99;
export const FINDER_VERSION = 2;

const OFF_CANON_WORDS = /\b(fanon|fanfics?|fanfictions?|fan ?fictions?|fan ?made|fans?|fanpedia|fanmade|ideas?|role ?play\w*|rp|aus?|crossovers?|non ?canon|homebrew|rewritten|powerscaling|ocs?|creepypastas?)\b/;
const OFF_CANON_SLUG = /fanon|fanfic|fanfiction|roleplay|homebrew|fanmade|crossover|noncanon|powerscal/;

export function offCanon(result, query = '') {
  const asked = foldName(query);
  const text = foldName(`${result?.sitename ?? ''} ${result?.topic ?? ''}`);
  const words = text.match(OFF_CANON_WORDS);
  if (words && !asked.match(OFF_CANON_WORDS)) return true;
  let slug = '';
  try { slug = new URL(result?.apiUrl ?? '').hostname.split('.')[0]; } catch {}
  const hit = slug.replace(/[^a-z0-9]/g, '').match(OFF_CANON_SLUG);
  return Boolean(hit && !asked.replace(/\s/g, '').includes(hit[0]));
}

export function foldName(text) {
  return String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/(\d)[,.\s](\d{3})\b/g, '$1$2')
    .replace(/(\d+)k\b/g, (_, n) => `${n}000`)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export const nameTokens = (text) => foldName(text).split(' ').filter((w) => w && !STOP.has(w));

export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row.push(v);
    }
    prev2 = prev;
    prev = row;
  }
  return prev[n];
}

function tokenSim(a, b) {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (!longest) return 0;
  let sim = 1 - editDistance(a, b) / longest;
  if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) sim = Math.max(sim, 0.8);
  return sim;
}

export function nameScore(query, name) {
  const q = nameTokens(query);
  const n = nameTokens(name);
  if (!q.length || !n.length) return 0;
  const qc = q.join('');
  const nc = n.join('');
  let best = tokenSim(qc, nc);
  if (qc.length >= 4 && nc.includes(qc)) best = Math.max(best, 0.92 - Math.min(0.12, (nc.length - qc.length) / 50));
  const per = q.map((w) => Math.max(...n.map((x) => tokenSim(w, x))));
  const avg = per.reduce((s, v) => s + v, 0) / per.length;
  return Math.max(best, avg - Math.max(0, n.length - q.length) * 0.04);
}

export function slugsFor(query) {
  const words = foldName(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const bare = words[0] === 'the' && words.length > 1 ? words.slice(1) : words;
  const out = new Set();
  for (const list of [words, bare]) {
    out.add(list.join(''));
    if (list.length > 1) out.add(list.join('-'));
  }
  const raw = String(query ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (raw) out.add(raw);
  return [...out].filter((s) => /^[a-z0-9][a-z0-9-]{1,48}$/.test(s)).slice(0, 3);
}

export function cleanApi(raw) {
  let url;
  try { url = new URL(String(raw ?? '')); } catch { return null; }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  let host = url.hostname.toLowerCase();
  if (!host.includes('.') || /^[\d.]+$/.test(host)) return null;
  host = host.replace(/^([a-z-]+)\.m\.(wikipedia|wiktionary|wikivoyage|wikibooks|wikiquote|wikisource|wikinews|wikiversity)\.org$/, '$1.$2.org');
  let path = url.pathname.replace(/\/+$/, '');
  if (!/\/api\.php$/.test(path)) path = `${path}/api.php`;
  return `https://${host}${path}`;
}

export function farmOf(apiUrl) {
  const host = (() => { try { return new URL(apiUrl).hostname; } catch { return ''; } })();
  if (/\.fandom\.com$/.test(host)) return 'fandom';
  if (/\.wiki\.gg$/.test(host)) return 'wikigg';
  if (/\.miraheze\.org$/.test(host)) return 'miraheze';
  if (/\.(wikipedia|wikivoyage|wiktionary|wikibooks|wikiquote|wikisource)\.org$/.test(host)) return 'wikimedia';
  return 'wiki';
}

export function hostSlug(apiUrl) {
  try {
    const url = new URL(apiUrl);
    const parts = url.hostname.split('.');
    const farm = farmOf(apiUrl);
    if (farm !== 'wiki') return parts[0];
    const named = parts.filter((p) => !['www', 'en', 'wiki', 'com', 'org', 'net', 'gg', 'io'].includes(p));
    return (named[0] ?? parts[0]).replace(/wiki$/, '');
  } catch {
    return '';
  }
}

const fandomApi = (base, lang = null) => {
  const url = cleanApi(String(base ?? '').replace(/\/+$/, ''));
  if (!url) return null;
  if (!lang || lang === 'en' || /\/[a-z]{2,3}(-[a-z]+)?\/api\.php$/.test(url)) return url;
  return url.replace(/\/api\.php$/, `/${lang}/api.php`);
};

export function farmIdApi(farm, id) {
  const m = /^(?:([a-z]{2,3}(?:-[a-z]+)?)\.)?([a-z0-9][a-z0-9-]*)$/i.exec(String(id ?? '').trim());
  if (!m) return null;
  const [, lang, name] = m;
  const prefix = lang ? `/${lang.toLowerCase()}` : '';
  if (farm === 'fandom') return `https://${name.toLowerCase()}.fandom.com${prefix}/api.php`;
  if (farm === 'wikigg') return `https://${name.toLowerCase()}.wiki.gg${prefix}/api.php`;
  if (farm === 'miraheze') return `https://${name.toLowerCase()}.miraheze.org/w/api.php`;
  return null;
}

const absolute = (u) => (typeof u === 'string' && u.startsWith('//') ? `https:${u}` : u) || null;

export async function probeSite(apiUrl, { get = fetchJson, timeout = FIND_TIMEOUT_MS } = {}) {
  const params = new URLSearchParams({
    action: 'query', meta: 'siteinfo', siprop: 'general|statistics', format: 'json', origin: '*'
  });
  const data = await get(`${apiUrl}?${params}`, { timeout });
  const general = data?.query?.general;
  const stats = data?.query?.statistics;
  if (!general?.sitename || !stats) return null;
  const host = new URL(apiUrl).hostname;
  const server = absolute(general.server)?.replace(/^http:/, 'https:') ?? `https://${host}`;
  return {
    apiUrl,
    canonical: `${server}${general.scriptpath ?? ''}`,
    lang: String(general.lang ?? 'en').split('-')[0],
    sitename: String(general.sitename),
    server,
    articlePath: general.articlepath ?? '/wiki/$1',
    mainPage: general.mainpage ?? null,
    logo: absolute(general.logo),
    articles: Number(stats.articles) || 0,
    images: Number(stats.images) || 0,
    farm: farmOf(apiUrl),
    mature: matureSite({ host, sitename: general.sitename, flags: general })
  };
}

let finderCache = null;

export function useFinderCache(cache) {
  finderCache = cache;
}

const memorySites = new Map();

async function siteInfo(apiUrl, get) {
  if (memorySites.has(apiUrl)) return memorySites.get(apiUrl);
  const held = finderCache?.site?.get ? await quietly(finderCache.site.get(apiUrl)) : null;
  if (held && typeof held === 'object' && 'info' in held) {
    memorySites.set(apiUrl, held.info ?? null);
    return held.info ?? null;
  }
  let info = null;
  let reached = true;
  try {
    info = await probeSite(apiUrl, { get });
  } catch {
    reached = false;
  }
  if (info && info.articles < MIN_ARTICLES) info = null;
  memorySites.set(apiUrl, info);
  if (reached && finderCache?.site?.put) quietly(finderCache.site.put(apiUrl, info));
  return info;
}

export const DEEP_SAMPLE = 20;
export const DEEP_SHARE = 0.2;

export async function matureContent(info, { get = fetchJson, timeout = FIND_TIMEOUT_MS } = {}) {
  if (!info?.apiUrl || info.farm === 'wikimedia') return false;
  const params = new URLSearchParams({
    action: 'query', list: 'allcategories', acmin: '3', aclimit: '500', acprop: 'size',
    generator: 'random', grnnamespace: '0', grnlimit: String(DEEP_SAMPLE), prop: 'categories', cllimit: 'max', clshow: '!hidden',
    format: 'json', origin: '*'
  });
  const data = await get(`${info.apiUrl}?${params}`, { timeout });
  const floor = Math.max(20, (Number(info.articles) || 0) * 0.05);
  const big = (data?.query?.allcategories ?? []).some((c) => matureCategories([c?.['*'] ?? c?.category ?? '']) && Number(c?.size) >= floor);
  if (big) return true;
  const pages = Object.values(data?.query?.pages ?? {});
  if (pages.length < 5) return false;
  const flagged = pages.filter((p) => matureCategories(p?.categories) || MATURE_WORDS.test(String(p?.title ?? ''))).length;
  return flagged / pages.length >= DEEP_SHARE;
}

export async function inspectWiki(apiUrl, get = fetchJson) {
  const url = cleanApi(apiUrl);
  if (!url) return null;
  const info = await siteInfo(url, get);
  if (!info || info.mature || info.deep) return info;
  const deep = await quietly(matureContent(info, { get }));
  if (deep == null) return info;
  const checked = { ...info, deep: true, ...(deep ? { mature: true } : {}) };
  memorySites.set(url, checked);
  if (finderCache?.site?.put) quietly(finderCache.site.put(url, checked));
  return checked;
}

async function quietly(work) {
  try { return await work; } catch { return null; }
}

export async function fandomLeads(query, lang, get) {
  const langs = lang && lang !== 'en' ? [lang, 'en'] : ['en'];
  const out = [];
  await Promise.all(langs.map(async (l) => {
    const params = new URLSearchParams({ query, lang: l, limit: '8' });
    const data = await quietly(get(`https://services.fandom.com/unified-search/community-search?${params}`, { timeout: FIND_TIMEOUT_MS }));
    (data?.results ?? []).forEach((r, i) => {
      const api = fandomApi(r?.url);
      if (api) out.push({ api, name: r.name, pages: Number(r.pageCount) || 0, lang: r.language, via: 'fandom', prior: 2 - i * 0.15, flags: r });
    });
  }));
  return out;
}

export async function wikidataLeads(query, lang, get) {
  const search = await quietly(get(`https://www.wikidata.org/w/api.php?${new URLSearchParams({
    action: 'query', list: 'search', srsearch: `haswbstatement:P4073|P11994|P13332|P12203 ${query}`,
    srlimit: '4', srprop: '', format: 'json', origin: '*'
  })}`, { timeout: FIND_TIMEOUT_MS }));
  const ids = (search?.query?.search ?? []).map((r) => r.title).filter((id) => /^Q\d+$/.test(id)).slice(0, 3);
  if (!ids.length) return [];
  const data = await quietly(get(`https://www.wikidata.org/w/api.php?${new URLSearchParams({
    action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels', languages: lang === 'en' ? 'en' : `${lang}|en`,
    format: 'json', origin: '*'
  })}`, { timeout: FIND_TIMEOUT_MS }));
  const out = [];
  ids.forEach((id, rank) => {
    const entity = data?.entities?.[id];
    if (!entity) return;
    const label = entity.labels?.[lang]?.value ?? entity.labels?.en?.value ?? null;
    const values = (p) => (entity.claims?.[p] ?? []).map((c) => c?.mainsnak?.datavalue?.value).filter((v) => typeof v === 'string');
    const prior = 3 - rank * 0.4;
    const push = (api, extra = {}) => {
      if (!api) return;
      const away = extra.lang && lang && extra.lang !== lang;
      out.push({ api, name: label, via: 'wikidata', official: !away, prior: away ? prior - 2.5 : prior, ...extra });
    };
    for (const v of values('P4073')) push(farmIdApi('fandom', v), { lang: /^([a-z]{2,3}(?:-[a-z]+)?)\./.exec(v)?.[1] ?? 'en' });
    for (const v of values('P11994')) push(farmIdApi('wikigg', v));
    for (const v of values('P13332')) push(farmIdApi('miraheze', v));
    for (const v of values('P12203')) {
      try {
        const origin = new URL(v).origin;
        push(`${origin}/w/api.php`);
        push(`${origin}/api.php`);
      } catch {}
    }
  });
  return out;
}

export async function mirahezeLeads(slugs, get) {
  if (!slugs.length) return [];
  const data = await quietly(get(`https://meta.miraheze.org/w/api.php?${new URLSearchParams({
    action: 'query', list: 'wikidiscover', wdwikis: slugs.map((s) => `${s.replace(/-/g, '')}wiki`).join('|'),
    wdprop: 'url|sitename|languagecode|description', format: 'json', origin: '*'
  })}`, { timeout: FIND_TIMEOUT_MS }));
  return Object.values(data?.query?.wikidiscover?.wikis ?? {})
    .filter((w) => w?.url && !('private' in w) && !('closed' in w) && !('deleted' in w))
    .map((w) => ({
      api: `${String(w.url).replace(/\/+$/, '')}/w/api.php`, name: w.sitename, lang: w.languagecode, via: 'miraheze', prior: 1.5,
      ...(typeof w.description === 'string' && w.description ? { flags: { description: w.description } } : {})
    }));
}

let adultSource = () => [];
export const useAdultWikis = (fn) => { adultSource = typeof fn === 'function' ? fn : () => []; };

export function cleanAdultWikis(list) {
  return (Array.isArray(list) ? list : [])
    .map((w) => ({ api: cleanApi(w?.api), names: Array.isArray(w?.names) ? w.names.filter((n) => typeof n === 'string' && n.trim()).slice(0, 20) : [] }))
    .filter((w) => w.api && w.names.length);
}

async function adultWikis() {
  try { return cleanAdultWikis(await adultSource()); } catch { return []; }
}

export function knownLeads(query, list = KNOWN_WIKIS) {
  const out = [];
  for (const wiki of list) {
    const score = Math.max(...wiki.names.map((n) => nameScore(query, n)));
    if (score >= STRONG_SCORE) out.push({ api: wiki.api, name: wiki.names[0], via: 'known', known: true, prior: 4 * score });
  }
  return out;
}

export function slugLeads(slugs, lang) {
  const out = [];
  for (const slug of slugs) {
    out.push({ api: `https://${slug}.fandom.com/api.php`, name: slug, via: 'slug', prior: 1 });
    if (lang && lang !== 'en') out.push({ api: `https://${slug}.fandom.com/${lang}/api.php`, name: slug, via: 'slug', prior: 0.9 });
    out.push({ api: `https://${slug}.wiki.gg/api.php`, name: slug, via: 'slug', prior: 0.8 });
  }
  return out;
}

export async function wikipediaHints(query, lang, get) {
  const data = await quietly(get(`https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({
    action: 'query', list: 'search', srsearch: query, srinfo: 'suggestion|totalhits', srlimit: '3', srprop: '',
    srnamespace: '0', format: 'json', origin: '*'
  })}`, { timeout: FIND_TIMEOUT_MS }));
  const info = data?.query?.searchinfo ?? {};
  return {
    suggestion: typeof info.suggestion === 'string' ? info.suggestion : null,
    titles: (data?.query?.search ?? []).map((r) => r.title).filter(Boolean),
    hits: Number(info.totalhits) || 0
  };
}

export const pageCount = (r) => {
  const n = Number(r?.articles);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function rankResults(results, { lang = null, query = '', mature = false } = {}) {
  const kept = results.filter((r) => r.score >= KEEP_SCORE);
  const tier = (r) => (r.score >= EXACT_SCORE ? 0 : r.score >= STRONG_SCORE ? 1 : 2);
  const away = (r) => (lang && r.lang && r.lang !== lang ? 1 : 0);
  const fan = new Map(kept.map((r) => [r, offCanon(r, query) ? 1 : 0]));
  const weight = (r) => pageCount(r) * (r.official ? 1.5 : 1);
  const byContent = (a, b) => pageCount(b) - pageCount(a) || b.score - a.score || a.apiUrl.localeCompare(b.apiUrl);
  const byCanon = (a, b) => away(a) - away(b) || fan.get(a) - fan.get(b) || tier(a) - tier(b)
    || (b.known ? 1 : 0) - (a.known ? 1 : 0) || weight(b) - weight(a) || byContent(a, b);
  const sites = kept.filter((r) => !r.topic);
  const calm = sites.filter((r) => !r.mature);
  const pick = (list) => [...list].sort(byCanon)[0];
  const best = (mature ? pick(sites) : null) ?? pick(calm) ?? pick(sites) ?? kept.find((r) => r.topic) ?? null;
  const rest = kept.filter((r) => r !== best).sort((a, b) => (a.topic ? 1 : 0) - (b.topic ? 1 : 0) || byCanon(a, b));
  return best ? [best, ...rest] : rest;
}

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

const memoryFinds = new Map();
const MEMORY_FINDS = 60;

export function visibleFind(found, allowMature) {
  if (!found) return found;
  const safe = (found.results ?? []).filter((r) => !minorsWiki(r));
  const results = safe.filter((r) => allowMature || !r.mature);
  return { ...found, results, mature: safe.length - results.length };
}

export async function findWikis(query, { lang = 'en', allowMature = false, fandom = true, get = fetchJson, budget = FIND_BUDGET_MS, fresh = false } = {}) {
  const asked = String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (minorsText(asked)) return { query: asked, corrected: null, results: [], mature: 0, refused: true };
  const adult = adultQuery(asked);
  const q = adult ? adultCanon(asked) : asked;
  if (foldName(q).replace(/\s/g, '').length < 2) return { query: q, corrected: null, results: [], mature: 0 };
  const wantsMature = Boolean(allowMature) && (adult || MATURE_WORDS.test(foldName(q)) || matureTopic(q));
  const key = findKey(q, lang) + (wantsMature ? '|adult' : '');
  if (!fresh) {
    const held = memoryFinds.get(key) ?? (finderCache?.find?.get ? await quietly(finderCache.find.get(key)) : null);
    if (held?.results) {
      memoryFinds.set(key, held);
      return visibleFind(held, allowMature);
    }
  }
  const found = await searchEverywhere(q, { lang, fandom, get, budget, adult: adult && allowMature, wantsMature });
  if (found.results.length || found.reached) {
    memoryFinds.set(key, found);
    if (memoryFinds.size > MEMORY_FINDS) memoryFinds.delete(memoryFinds.keys().next().value);
    if (found.results.length && finderCache?.find?.put) quietly(finderCache.find.put(key, found));
  }
  return visibleFind(found, allowMature);
}

async function searchEverywhere(q, { lang, fandom, get, budget, adult = false, wantsMature = false }) {
  const deadline = Date.now() + budget;
  const leads = new Map();
  let alt = null;
  let hints = { suggestion: null, titles: [], hits: 0 };

  const add = (list) => {
    for (const raw of list ?? []) {
      const api = cleanApi(raw.api);
      if (!api) continue;
      const held = leads.get(api);
      if (held) {
        if (raw.name) held.names.push(raw.name);
        held.prior += raw.prior ?? 1;
        held.pages = Math.max(held.pages, raw.pages ?? 0);
        held.flags = held.flags ?? raw.flags ?? null;
        held.known = held.known || Boolean(raw.known);
        held.official = held.official || Boolean(raw.official);
        continue;
      }
      leads.set(api, {
        api, names: raw.name ? [raw.name] : [], prior: raw.prior ?? 1, pages: raw.pages ?? 0, via: raw.via, flags: raw.flags ?? null,
        known: Boolean(raw.known), official: Boolean(raw.official)
      });
    }
  };

  const slugs = slugsFor(q);
  add(knownLeads(q));
  if (adult || wantsMature) add(knownLeads(q, await adultWikis()).map((lead) => ({ ...lead, flags: { adult: true } })));
  add(slugLeads(slugs.slice(0, 2), lang));
  const sources = [
    fandom ? fandomLeads(q, lang, get).then(add) : null,
    wikidataLeads(q, lang, get).then(add),
    mirahezeLeads(slugs, get).then(add),
    wikipediaHints(q, lang, get).then(async (h) => {
      hints = h;
      const top = h.titles[0];
      const candidate = h.suggestion ?? (top && nameScore(q, top) >= KEEP_SCORE && foldName(top) !== foldName(q) ? top : null);
      if (!candidate || foldName(candidate) === foldName(q)) return;
      alt = candidate;
      const altSlugs = slugsFor(alt).filter((s) => !slugs.includes(s));
      add(knownLeads(alt));
      add(slugLeads(altSlugs.slice(0, 1), lang));
      await Promise.all([
        fandom ? fandomLeads(alt, lang, get).then(add) : null,
        wikidataLeads(alt, lang, get).then(add),
        mirahezeLeads(altSlugs, get).then(add)
      ]);
    })
  ];
  await Promise.race([Promise.all(sources), new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now() - 3000)))]);

  const weight = (lead) => lead.prior + Math.log10(lead.pages + 1) * 0.3 + (lead.known ? 10 : 0);
  const chosen = [...leads.values()].sort((a, b) => weight(b) - weight(a)).slice(0, MAX_PROBES);
  const settled = await Promise.race([
    Promise.all(chosen.map((lead) => siteInfo(lead.api, get).catch(() => null).then((info) => (info ? { info, lead } : null)))),
    new Promise((r) => setTimeout(() => r(null), Math.max(500, deadline - Date.now())))
  ]) ?? [];
  const done = settled.filter(Boolean);

  const byCanonical = new Map();
  for (const { info, lead } of done) {
    const names = [...lead.names, info.sitename, hostSlug(info.apiUrl)];
    const score = Math.max(...names.map((n) => Math.max(nameScore(q, n), alt ? nameScore(alt, n) * 0.97 : 0)));
    const mature = info.mature || matureSite({ host: new URL(info.apiUrl).hostname, sitename: '', description: lead.flags?.description ?? '', flags: lead.flags });
    const result = {
      apiUrl: info.apiUrl, sitename: info.sitename, host: new URL(info.apiUrl).host, farm: info.farm, lang: info.lang,
      articles: info.articles, images: info.images, server: info.server, articlePath: info.articlePath,
      mainPage: info.mainPage, logo: info.logo, mature, score: Math.round(score * 1000) / 1000, via: lead.via,
      ...(lead.known ? { known: true } : {}), ...(lead.official ? { official: true } : {})
    };
    const twin = byCanonical.get(info.canonical);
    if (!twin || twin.score < result.score || (twin.score === result.score && lead.prior > (twin.prior ?? 0))) {
      byCanonical.set(info.canonical, {
        ...result, prior: lead.prior,
        ...(twin?.known || result.known ? { known: true } : {}), ...(twin?.official || result.official ? { official: true } : {})
      });
    } else if (result.known || result.official) {
      byCanonical.set(info.canonical, { ...twin, ...(result.known ? { known: true } : {}), ...(result.official ? { official: true } : {}) });
    }
  }
  const results = [...byCanonical.values()].map(({ prior, ...r }) => r);
  const topTitle = hints.titles[0];
  const topicScore = topTitle ? Math.max(nameScore(q, topTitle), alt ? nameScore(alt, topTitle) : 0) : 0;
  if (topTitle && topicScore >= 0.75 && hints.hits > 0) {
    const apiUrl = `https://${lang}.wikipedia.org/w/api.php`;
    results.push({
      apiUrl, sitename: 'Wikipedia', host: `${lang}.wikipedia.org`, farm: 'wikimedia', lang, articles: hints.hits, images: 0,
      server: `https://${lang}.wikipedia.org`, articlePath: '/wiki/$1', mainPage: null, logo: null,
      mature: matureTopic(topTitle), score: Math.round(topicScore * 1000) / 1000, via: 'wikipedia', topic: topTitle
    });
  }
  return { query: q, corrected: alt, results: rankResults(results, { lang, query: q, mature: wantsMature }).slice(0, 8), reached: done.length > 0 || hints.titles.length > 0 };
}
