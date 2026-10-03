import { codeById, codeSpec } from './codedefs.js';
import { THEME_PACKS, themeById } from './data/packs.js';
import { styleForSpec } from './packstyle.js';
import { t, tx, getLanguage, wikiLang } from './i18n.js';
import { friendCodeOf, friendDef, friendSpec, isFriendId } from './friendcodes.js';

export const cardsPerPage = () => (typeof matchMedia === 'function' && matchMedia('(min-width: 1024px)').matches ? 8 : 4);

const TOTALS_KEY = 'wikster.albumTotals.v1';
const TOTALS_TTL = 7 * 24 * 60 * 60 * 1000;

let totalsCache = null;
function totals() {
  if (totalsCache) return totalsCache;
  try {
    totalsCache = JSON.parse(localStorage.getItem(TOTALS_KEY)) ?? {};
  } catch {
    totalsCache = {};
  }
  return totalsCache;
}
function rememberTotal(key, total) {
  totals()[key] = { total, at: Date.now() };
  try { localStorage.setItem(TOTALS_KEY, JSON.stringify(totalsCache)); } catch {}
}

const totalKeyFor = (albumKey) => `${getLanguage()}|${albumKey}`;

export function knownAlbumTotal(albumKey) {
  const hit = totals()[totalKeyFor(albumKey)];
  return Number.isFinite(hit?.total) ? hit.total : null;
}

const isFresh = (albumKey) => {
  const hit = totals()[totalKeyFor(albumKey)];
  return hit && Date.now() - (hit.at ?? 0) < TOTALS_TTL;
};

async function countJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Count request failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function queryHits(query) {
  const params = new URLSearchParams({
    action: 'query', list: 'search', srsearch: query, srnamespace: '0',
    srlimit: '1', srinfo: 'totalhits', srprop: '', format: 'json', origin: '*'
  });
  const data = await countJson(`https://${wikiLang()}.wikipedia.org/w/api.php?${params}`);
  return data?.query?.searchinfo?.totalhits ?? 0;
}

async function siteArticles(apiUrl) {
  const params = new URLSearchParams({
    action: 'query', meta: 'siteinfo', siprop: 'statistics', format: 'json', origin: '*'
  });
  const data = await countJson(`${apiUrl}?${params}`);
  const articles = data?.query?.statistics?.articles;
  return Number.isFinite(articles) ? articles : null;
}

const inFlight = new Map();

export function fetchAlbumTotal(album) {
  if (album.kind === 'code') return Promise.resolve(album.total ?? null);
  const key = totalKeyFor(album.key);
  if (isFresh(album.key)) return Promise.resolve(knownAlbumTotal(album.key));
  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    try {
      let total = null;
      if (album.kind === 'theme') {
        const theme = themeById(album.themeId);
        const lang = getLanguage();
        if (theme?.titles) {
          const roll = theme.titles[lang] ?? theme.titles.en;
          rememberTotal(key, Math.max(roll.length, album.owned ?? 0));
          return roll.length;
        }
        const queries = theme?.queries?.[lang] ?? theme?.queries?.en ?? [];
        if (queries.length) {
          const hits = await Promise.all(queries.map((q) => queryHits(q).catch(() => 0)));
          const sum = hits.reduce((a, b) => a + b, 0);
          if (sum > 0) total = sum;
        }
      } else if (album.kind === 'custom') {
        total = await siteArticles(albumSpec(album).wiki.apiUrl);
      } else {
        total = await siteArticles(`https://${wikiLang()}.wikipedia.org/w/api.php`);
      }
      if (Number.isFinite(total) && total > 0) {
        rememberTotal(key, Math.max(total, album.owned ?? 0));
        return total;
      }
      return knownAlbumTotal(album.key);
    } catch {
      return knownAlbumTotal(album.key);
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}

export function customSlug(raw) {
  return String(raw ?? '')
    .replace(/^custom-/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/api\.php$/, '')
    .replace(/\/[a-z]{2}$/, '')
    .toLowerCase()
    .replace(/\W+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function albumKeyOf(entry) {
  if (entry.special) return `code:${entry.special}`;
  const [kind, ident] = String(entry.packId ?? '').split('|');
  if (kind === 'theme' && ident && ident !== 'any') return `theme:${ident}`;
  if (kind === 'custom' && ident) return `custom:${customSlug(ident)}`;
  return 'wild';
}

export function albumSpec(album) {
  if (album.kind === 'code' && isFriendId(album.codeId)) {
    const def = friendDef(friendCodeOf(album.codeId));
    return friendSpec(friendCodeOf(album.codeId), def?.booster ?? { name: def?.name, accent: def?.theme?.accent ?? def?.badge?.color, cards: album.size }, def?.name);
  }
  if (album.kind === 'code') {
    const code = codeById(album.codeId);
    return code ? codeSpec(code) : { kind: 'open', themeId: null, rarityId: null, cards: 5 };
  }
  if (album.kind === 'theme') return { kind: 'theme', themeId: album.themeId, rarityId: null, cards: 5 };
  if (album.kind === 'custom') {
    const host = album.host ?? `${album.slug.replace(/-/g, '.')}`;
    return {
      kind: 'custom', cards: 5, customName: album.name, customId: `custom-${album.slug}`,
      wiki: { apiUrl: `https://${host}/api.php`, sitename: album.name }
    };
  }
  return { kind: 'open', themeId: null, rarityId: null, cards: 5 };
}

export function buildAlbums(entries, customPacks = []) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = albumKeyOf(entry);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
  }

  const albums = [];

  for (const theme of THEME_PACKS) {
    const owned = byKey.get(`theme:${theme.id}`) ?? [];
    albums.push(decorate({
      key: `theme:${theme.id}`, kind: 'theme', themeId: theme.id,
      name: tx(theme.name), entries: owned
    }));
  }

  const customs = new Map();
  const remember = (slug, { name, host }) => {
    if (!slug) return;
    const found = customs.get(slug) ?? { slug, name: null, host: null };
    found.name = found.name ?? name ?? null;
    found.host = found.host ?? host ?? null;
    customs.set(slug, found);
  };
  for (const pack of customPacks) {
    let host = null;
    try {
      const url = new URL(pack.wiki?.apiUrl ?? '');
      host = url.host + url.pathname.replace('/api.php', '');
    } catch {}
    remember(customSlug(host || pack.id), { name: pack.name, host });
  }
  for (const [key, owned] of byKey) {
    if (!key.startsWith('custom:')) continue;
    const slug = key.slice('custom:'.length);
    const raw = String(owned[0]?.packId ?? '').split('|')[1] ?? '';
    remember(slug, { name: String(owned[0]?.packName ?? '').replace(/\u00b7.*$/, '').trim() || slug, host: raw || null });
  }
  for (const [slug, info] of customs) {
    albums.push(decorate({
      key: `custom:${slug}`, kind: 'custom', slug, host: info.host,
      name: info.name || slug, entries: byKey.get(`custom:${slug}`) ?? []
    }));
  }

  for (const [key, owned] of byKey) {
    if (!key.startsWith('code:')) continue;
    if (isFriendId(key.slice('code:'.length))) {
      const id = key.slice('code:'.length);
      const def = friendDef(friendCodeOf(id));
      const size = def ? (Number(def.cards) || 0) + (Number(def.booster?.cards) || 0) : 0;
      albums.push(decorate({
        key, kind: 'code', codeId: id, name: t('friendAlbum', { name: def?.name ?? friendCodeOf(id) }), entries: owned,
        size: Math.max(size, owned.length)
      }));
      continue;
    }
    const code = codeById(key.slice('code:'.length));
    if (!code) continue;
    albums.push(decorate({
      key, kind: 'code', codeId: code.id, name: tx(code.album), entries: owned,
      size: code.solo ? 1 : (code.cards?.length ?? 0) + 1
    }));
  }

  albums.push(decorate({
    key: 'wild', kind: 'wild', name: 'Wikipedia', entries: byKey.get('wild') ?? []
  }));

  return albums;
}

export const ALBUM_DEEP = 25;

export const ALBUM_TIERS = [
  { id: 'bronze',  need: 75,   coins: 2500,  booster: null },
  { id: 'silver',  need: 200,  coins: 7500,  booster: { rarityId: null,     cards: 5 } },
  { id: 'gold',    need: 500,  coins: 20000, booster: { rarityId: 'rare',   cards: 5 } },
  { id: 'diamond', need: 1000, coins: 60000, booster: { rarityId: 'mythic', cards: 5 } },
  { id: 'complete', need: null, coins: 120000, booster: { rarityId: 'exotic', cards: 5 } }
];

export const COMPLETE_TIER = ALBUM_TIERS.length;

export const albumHasTiers = (album) => album.kind !== 'code';

export function albumTierNeed(album, tier) {
  if (tier.need == null) return album.total ?? Infinity;
  return album.total != null && album.total < tier.need ? album.total : tier.need;
}

export const albumCompleteEdition = (album) => albumHasTiers(album) && album.total != null && album.owned >= album.total;

export const albumEditionClaimed = (profile, album) => (Number(profile?.albumTiers?.[album.key]) || 0) >= COMPLETE_TIER;

export function albumTiersReached(album) {
  if (!albumHasTiers(album)) return 0;
  let n = 0;
  for (const tier of ALBUM_TIERS) {
    if (album.owned >= albumTierNeed(album, tier)) n++;
    else break;
  }
  return n;
}

export const albumTiersClaimed = (profile, album) => Math.min(ALBUM_TIERS.length, Number(profile?.albumTiers?.[album.key]) || 0);

export function albumTierBooster(album, tier) {
  if (!tier.booster) return null;
  return album.kind === 'theme'
    ? { kind: 'theme', themeId: album.themeId, rarityId: tier.booster.rarityId, cards: tier.booster.cards }
    : { kind: 'open', themeId: null, rarityId: tier.booster.rarityId, cards: tier.booster.cards };
}

function decorate(album) {
  const style = styleForSpec(albumSpec(album));
  album.style = style;
  album.owned = album.entries.length;
  if (album.kind === 'code') {
    album.total = album.size;
    album.unlocked = album.owned > 0;
    album.complete = album.owned >= album.total;
    album.deep = album.complete;
    return album;
  }
  const known = knownAlbumTotal(album.key);
  album.total = known == null ? null : Math.max(known, album.owned);
  album.unlocked = album.owned > 0;
  album.complete = album.total != null && album.owned >= album.total;
  album.deep = album.owned >= ALBUM_DEEP;
  return album;
}

export function albumsDeep(entries, customPacks = []) {
  return buildAlbums(entries, customPacks).filter((a) => a.deep).length;
}

export function albumsHundred(entries, customPacks = []) {
  return buildAlbums(entries, customPacks).filter((a) => (a.owned ?? a.count ?? 0) >= 100).length;
}

export function albumsStarted(entries, customPacks = []) {
  return buildAlbums(entries, customPacks).filter((a) => a.unlocked).length;
}
