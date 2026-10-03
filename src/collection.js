import { rarityRank, normalizeRarityId, rarityById } from './data/rarities.js';
import { DEFAULT_FX, fxExists } from './data/fx.js';
import { albumKeyOf, customSlug } from './albums.js';
import { bandFor, priceFor } from './pricing.js';
import { specId } from './booster.js';
import { withSpecialPhoto } from './codedefs.js';
import {
  starterCoins, stipendAmount, stipendHourOf, stipendMaxBanked, legacyWindowAt, windowIndexAt, freeWindowAt
} from './economy.js';
import { normalizeDaily } from './daily.js';
import { cleanPending, normalizeProgress } from './progression.js';
import { emptyTimed, accrue } from './timed.js';
import { t } from './i18n.js';
import { touch } from './save.js';
import { addPrints, bestPrint, collectionValue, notePulls, printPrice, printsOf, takePrints } from './econ/rules.js';

const CARDS_KEY = 'wikster.collection.v3';
const WALLET_KEY = 'wikster.wallet.v1';
const INVENTORY_KEY = 'wikster.inventory.v1';
const PROFILE_KEY = 'wikster.profile.v1';
const CUSTOM_KEY = 'wikster.customPacks.v2';
const BINDER_VIEW_KEY = 'wikster.binderView.v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

let wiped = false;
export function freezeWrites() { wiped = true; }

function writeJson(key, value) {
  if (wiped) return false;
  try {
    const text = JSON.stringify(value);
    if (localStorage.getItem(key) === text) return true;
    localStorage.setItem(key, text);
    touch(key);
    return true;
  } catch {
    return false;
  }
}

export function loadCollection() {
  collectionVersion++;
  const data = readJson(CARDS_KEY, null);
  if (!data || typeof data !== 'object' || !data.entries) return { entries: {} };
  for (const entry of Object.values(data.entries)) {
    if (entry?.rarityId) entry.rarityId = normalizeRarityId(entry.rarityId);
    if (entry?.special) withSpecialPhoto(entry);
  }
  return data;
}

let collectionVersion = 0;
export const collectionStamp = () => collectionVersion;

export const saveCollection = (collection) => { collectionVersion++; return writeJson(CARDS_KEY, collection); };

export function recordPulls(collection, pulls, spec) {
  const now = Date.now();
  const results = [];
  const packId = specId(spec);

  pulls.forEach((pull, index) => {
    const { article, rarity, price } = pull;
    const existing = collection.entries[article.key];
    const at = now + index;

    if (!existing) {
      collection.entries[article.key] = {
        key: article.key,
        title: article.title,
        description: article.description,
        extract: article.extract,
        thumbnail: article.thumbnail,
        url: article.url,
        lang: article.lang,
        sourceId: article.sourceId,
        sourceName: article.sourceName,
        views: article.views,
        popularity: article.popularity,
        rarityId: rarity.id,
        price,
        packId,
        packName: pull.packName,
        packIcon: pull.packIcon,
        packAccent: pull.packAccent,
        count: 1,
        favorite: false,
        firstPulledAt: at,
        lastPulledAt: at,
        ...(article.special ? { special: article.special, article: article.article ?? null, creator: Boolean(article.creator), ...(article.skin ? { skin: article.skin } : {}) } : {}),
        ...(article.mature ? { mature: true } : {}),
        ...(article.picture ? { picture: article.picture } : {})
      };
      results.push({ entry: collection.entries[article.key], isNew: true });
      return;
    }

    existing.prints = addPrints(printsOf(existing), { [rarity.id]: 1 });
    existing.count += 1;
    existing.lastPulledAt = at;
    if (!existing.special && article.views != null && Number.isFinite(article.popularity)) {
      existing.views = article.views;
      existing.popularity = article.popularity;
      existing.price = priceFor(existing.popularity, rarityById(existing.rarityId));
    }
    if (rarityRank(rarity.id) > rarityRank(existing.rarityId)) {
      existing.rarityId = rarity.id;
      existing.price = price;
      existing.packId = packId;
      existing.packName = pull.packName;
      existing.packIcon = pull.packIcon;
      existing.packAccent = pull.packAccent;
      if (article.special) {
        existing.special = article.special;
        existing.article = article.article ?? null;
        existing.creator = Boolean(article.creator);
        if (article.skin) existing.skin = article.skin;
        existing.title = article.title;
        existing.thumbnail = article.thumbnail;
      }
    }
    results.push({ entry: existing, isNew: false });
  });

  saveCollection(collection);
  return results;
}

export function pruneImagelessCards(collection) {
  const doomed = Object.values(collection.entries ?? {}).filter((e) => !e.thumbnail);
  if (!doomed.length) return 0;
  for (const entry of doomed) delete collection.entries[entry.key];
  saveCollection(collection);
  return doomed.length;
}

export function toggleFavorite(collection, key) {
  const entry = collection.entries[key];
  if (!entry) return false;
  entry.favorite = !entry.favorite;
  saveCollection(collection);
  return entry.favorite;
}

export const isLocked = (entry) => Boolean(entry?.special);

export function dropCopies(entry, n = 1, rarityId = null) {
  const best = bestPrint(printsOf(entry));
  const took = takePrints(entry, n, rarityId);
  if (!took) return null;
  const kinds = Object.keys(took.taken);
  const rid = kinds.length === 1 ? kinds[0] : best;
  const snapshot = { ...entry, rarityId: rid, price: printPrice(entry.price, best, rid), count: n, favorite: false };
  delete snapshot.prints;
  entry.count -= n;
  if (entry.count > 0) {
    const left = bestPrint(took.prints);
    if (left !== best) { entry.price = printPrice(entry.price, best, left); entry.rarityId = left; }
    entry.prints = took.prints;
  }
  return snapshot;
}

export function sellCopy(collection, key, rarityId = null) {
  const entry = collection.entries[key];
  if (!entry) return null;
  const sold = dropCopies(entry, 1, rarityId);
  if (!sold) return null;
  if (entry.count <= 0) delete collection.entries[key];
  saveCollection(collection);
  return sold;
}

export function takeCardCopy(collection, key, rarityId = null) {
  const entry = collection.entries[key];
  if (!entry) return null;
  const snapshot = dropCopies(entry, 1, rarityId);
  if (!snapshot) return null;
  if (entry.count <= 0) delete collection.entries[key];
  saveCollection(collection);
  return snapshot;
}

export function receiveCardEntry(collection, incoming) {
  if (!incoming?.key || !incoming.title) return null;
  const existing = collection.entries[incoming.key];
  if (!existing) {
    collection.entries[incoming.key] = { ...incoming, count: incoming.count ?? 1, favorite: false };
  } else {
    existing.prints = addPrints(printsOf(existing), printsOf({ ...incoming, count: incoming.count ?? 1 }));
    existing.count += incoming.count ?? 1;
    if (rarityRank(incoming.rarityId) > rarityRank(existing.rarityId)) {
      existing.rarityId = incoming.rarityId;
      existing.price = incoming.price ?? existing.price;
    }
    existing.lastPulledAt = Date.now();
  }
  saveCollection(collection);
  return collection.entries[incoming.key];
}

export function replaceSpecialCard(collection, oldEntry, card) {
  if (!card?.key || !oldEntry?.key) return false;
  if (card.key === oldEntry.key
    && card.title === oldEntry.title
    && card.extract === oldEntry.extract
    && card.thumbnail === oldEntry.thumbnail) return false;
  const kept = {
    count: oldEntry.count ?? 1,
    favorite: Boolean(oldEntry.favorite),
    firstPulledAt: oldEntry.firstPulledAt ?? Date.now(),
    lastPulledAt: oldEntry.lastPulledAt ?? Date.now(),
    packId: oldEntry.packId,
    packName: oldEntry.packName,
    packIcon: oldEntry.packIcon,
    packAccent: oldEntry.packAccent,
    special: oldEntry.special,
    creator: Boolean(oldEntry.creator),
    ...(oldEntry.skin ? { skin: oldEntry.skin } : {}),
    rarityId: oldEntry.rarityId,
    price: oldEntry.price
  };
  delete collection.entries[oldEntry.key];
  const existing = collection.entries[card.key];
  if (existing) {
    existing.count += kept.count;
    existing.favorite = existing.favorite || kept.favorite;
    existing.firstPulledAt = Math.min(existing.firstPulledAt ?? kept.firstPulledAt, kept.firstPulledAt);
  } else {
    collection.entries[card.key] = {
      key: card.key,
      title: card.title,
      description: card.description,
      extract: card.extract,
      thumbnail: card.thumbnail,
      url: card.url,
      lang: card.lang,
      sourceId: card.sourceId,
      sourceName: card.sourceName,
      views: card.views,
      popularity: card.popularity,
      article: card.article ?? null,
      ...kept
    };
  }
  saveCollection(collection);
  return true;
}

export function replaceEntryWithTranslation(collection, oldEntry, card, lang) {
  if (!card?.key || !oldEntry?.key) return false;
  const kept = {
    count: oldEntry.count ?? 1,
    favorite: Boolean(oldEntry.favorite),
    firstPulledAt: oldEntry.firstPulledAt ?? Date.now(),
    lastPulledAt: oldEntry.lastPulledAt ?? Date.now(),
    packId: oldEntry.packId,
    packName: oldEntry.packName,
    packIcon: oldEntry.packIcon,
    packAccent: oldEntry.packAccent
  };
  delete collection.entries[oldEntry.key];

  const existing = collection.entries[card.key];
  if (existing) {
    existing.count += kept.count;
    existing.favorite = existing.favorite || kept.favorite;
    existing.firstPulledAt = Math.min(existing.firstPulledAt ?? kept.firstPulledAt, kept.firstPulledAt);
  } else {
    collection.entries[card.key] = {
      key: card.key,
      title: card.title,
      description: card.description,
      extract: card.extract,
      thumbnail: card.thumbnail,
      url: card.url,
      lang,
      sourceId: card.sourceId,
      sourceName: card.sourceName,
      views: card.views,
      popularity: card.popularity,
      rarityId: oldEntry.rarityId,
      price: oldEntry.price,
      ...kept
    };
  }
  saveCollection(collection);
  return true;
}

export const allEntries = (collection) => Object.values(collection.entries);

const COLLATOR = typeof Intl === 'object' ? new Intl.Collator(undefined, { numeric: true }) : null;
export const byTitle = (a, b) => (COLLATOR ? COLLATOR.compare(a.title, b.title) : a.title.localeCompare(b.title));

export const SORTS = [
  { id: 'recent', labelKey: 'sortRecent', compare: (a, b) => b.lastPulledAt - a.lastPulledAt },
  { id: 'price-desc', labelKey: 'sortPriceDesc', compare: (a, b) => b.price - a.price },
  { id: 'price-asc', labelKey: 'sortPriceAsc', compare: (a, b) => a.price - b.price },
  { id: 'rarity', labelKey: 'sortRarity', compare: (a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId) || byTitle(a, b) },
  { id: 'popular', labelKey: 'sortPopular', compare: (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) },
  { id: 'name', labelKey: 'sortName', compare: byTitle }
];

export const sortById = (id) => SORTS.find((s) => s.id === id) ?? SORTS[0];
export const sortLabel = (sort) => t(sort.labelKey);

export function filterEntries(entries, filters) {
  const term = (filters.search ?? '').trim().toLowerCase();
  return entries
    .filter((entry) => {
      if (filters.favoritesOnly && !entry.favorite) return false;
      if (filters.pack && albumKeyOf(entry) !== filters.pack) return false;
      if (filters.rarity && entry.rarityId !== filters.rarity) return false;
      if (filters.band && bandFor(entry.popularity ?? 0).id !== filters.band) return false;
      if (filters.minPrice && entry.price < Number(filters.minPrice)) return false;
      if (term && !entry.title.toLowerCase().includes(term)) return false;
      return true;
    })
    .sort(favoritesFirst(sortById(filters.sort).compare));
}

export const favoritesFirst = (compare) => (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || compare(a, b);

export const collectionStats = (entries) => ({
  copies: entries.reduce((sum, e) => sum + e.count, 0),
  value: collectionValue(entries),
  favorites: entries.filter((e) => e.favorite).length
});

export function loadWallet() {
  const value = readJson(WALLET_KEY, null);
  return Number.isFinite(value) ? value : 0;
}

export const saveWallet = (amount) => writeJson(WALLET_KEY, Math.max(0, Math.round(amount)));

export function loadInventory() {
  const data = readJson(INVENTORY_KEY, null);
  const inventory = data && typeof data === 'object' ? data : {};
  for (const [id, slot] of Object.entries(inventory)) {
    const rarityId = slot?.spec?.rarityId;
    if (!rarityId || rarityId === normalizeRarityId(rarityId)) continue;
    slot.spec.rarityId = normalizeRarityId(rarityId);
    delete inventory[id];
    const fresh = specId(slot.spec);
    inventory[fresh] = inventory[fresh]
      ? { spec: slot.spec, count: inventory[fresh].count + slot.count }
      : slot;
  }
  return inventory;
}

export const saveInventory = (inventory) => writeJson(INVENTORY_KEY, inventory);

export function addBooster(inventory, spec, count = 1) {
  const id = specId(spec);
  const slot = inventory[id] ?? { spec, count: 0 };
  slot.spec = spec;
  slot.count += count;
  inventory[id] = slot;
  saveInventory(inventory);
  return inventory;
}

export function takeBooster(inventory, id) {
  const slot = inventory[id];
  if (!slot || slot.count <= 0) return false;
  slot.count -= 1;
  if (slot.count <= 0) delete inventory[id];
  saveInventory(inventory);
  return true;
}

const IN_FLIGHT_KEY = 'wikster.openInFlight.v1';

export function markOpenInFlight(spec, count = 1) {
  try { localStorage.setItem(IN_FLIGHT_KEY, JSON.stringify({ spec, at: Date.now(), ...(count > 1 ? { count } : {}) })); }
  catch {}
}

export function clearOpenInFlight() {
  try { localStorage.removeItem(IN_FLIGHT_KEY); }
  catch {}
}

export function reclaimOpenInFlight(inventory) {
  let record = null;
  try { record = JSON.parse(localStorage.getItem(IN_FLIGHT_KEY) ?? 'null'); }
  catch { record = null; }
  clearOpenInFlight();
  if (!record?.spec) return null;
  if (record.spec.rarityId) record.spec.rarityId = normalizeRarityId(record.spec.rarityId);
  addBooster(inventory, record.spec, Math.max(1, Math.floor(Number(record.count) || 1)));
  return record.spec;
}

export const ownedBoosters = (inventory) =>
  Object.values(inventory).filter((slot) => slot.count > 0);

export function loadProfile() {
  const data = readJson(PROFILE_KEY, null);
  const profile = normalizeProfile(data && typeof data === 'object' ? data : {});
  accrue(profile.timed);
  return profile;
}

export function normalizeProfile(profile) {
  profile.started ??= false;
  profile.stipendWindow ??= null;
  profile.createdAt ??= Date.now();
  profile.playMs ??= 0;
  profile.boostersOpened ??= 0;
  profile.pity ??= 0;
  profile.rarityCounts ??= {};
  profile.progress = normalizeProgress({ ...(profile.progress && typeof profile.progress === 'object' ? profile.progress : {}) });
  profile.pendingLevels = cleanPending(profile.pendingLevels);
  profile.daily = normalizeDaily(profile.daily);
  profile.timed ??= emptyTimed();
  if (!profile.freeTaken || typeof profile.freeTaken !== 'object') profile.freeTaken = { window: null, ids: [] };
  if (!Array.isArray(profile.freeTaken.ids)) profile.freeTaken.ids = [];
  profile.achievements ??= { redeemed: [] };
  profile.achievements.redeemed ??= [];
  profile.codesRedeemed ??= {};
  for (const [id, n] of Object.entries(profile.rarityCounts)) {
    const fresh = normalizeRarityId(id);
    if (fresh === id) continue;
    profile.rarityCounts[fresh] = (profile.rarityCounts[fresh] ?? 0) + n;
    delete profile.rarityCounts[id];
  }
  profile.achievements.redeemed = profile.achievements.redeemed
    .map((id) => id.replace(/^artifact-/, 'prismatic-'));
  if (profile.achievements.redeemed.includes('first-pack')
    && !profile.achievements.redeemed.includes('pack-1')) {
    profile.achievements.redeemed.push('pack-1');
  }
  profile.cardsSold ??= 0;
  profile.settings ??= {};
  profile.settings.sound ??= true;
  profile.settings.lowPower ??= false;
  profile.settings.flash ??= true;
  profile.settings.hints ??= true;
  profile.settings.volume ??= 1;
  profile.settings.music ??= true;
  profile.settings.musicVolume ??= 0.4;
  profile.settings.haptics ??= true;
  profile.settings.tilt ??= true;
  profile.settings.awake ??= true;
  profile.settings.prices ??= true;
  profile.settings.blurAdult ??= true;
  profile.settings.rarityShapes ??= false;
  profile.settings.spreadOpen ??= true;
  profile.settings.skipOpening ??= false;
  profile.settings.publicStats ??= true;
  return profile;
}

export const saveProfile = (profile) => writeJson(PROFILE_KEY, profile);

export function claimStipend(profile, wallet) {
  const now = windowIndexAt();
  const last = stipendHourOf(profile);
  const missed = last == null ? 0 : Math.min(stipendMaxBanked(), now - last);
  if (last != null && missed <= 0) return 0;
  profile.stipendHour = now;
  profile.stipendWindow = legacyWindowAt();
  saveProfile(profile);
  if (last == null) return 0;
  const paid = missed * stipendAmount();
  saveWallet(wallet + paid);
  return paid;
}

export function grantStarter(profile) {
  profile.started = true;
  profile.stipendHour = windowIndexAt();
  profile.stipendWindow = legacyWindowAt();
  profile.createdAt = Date.now();
  saveProfile(profile);
  const coins = starterCoins();
  saveWallet(coins);
  return coins;
}

export function recordOpening(profile, pulls) {
  profile.boostersOpened = (profile.boostersOpened ?? 0) + 1;
  for (const pull of pulls) {
    const id = pull.rarity.id;
    profile.rarityCounts[id] = (profile.rarityCounts[id] ?? 0) + 1;
  }
  profile.pullStats = notePulls(profile.pullStats, pulls.map((p) => ({ rarityId: p.rarity?.id, price: p.price, key: p.article?.key, title: p.article?.title, special: p.article?.special })), 1, Date.now());
  saveProfile(profile);
}

export function addPlaytime(profile, ms) {
  if (!(ms > 0)) return;
  profile.playMs = (profile.playMs ?? 0) + ms;
  saveProfile(profile);
}

export function freeAvailable(profile, id, freeWindow = freeWindowAt()) {
  const taken = profile?.freeTaken;
  if (!taken || taken.window !== freeWindow) return true;
  return !(Array.isArray(taken.ids) && taken.ids.includes(id));
}

export function markFreeTaken(profile, id, freeWindow = freeWindowAt()) {
  if (profile.freeTaken?.window !== freeWindow || !Array.isArray(profile.freeTaken?.ids)) {
    profile.freeTaken = { window: freeWindow, ids: [] };
  }
  if (!profile.freeTaken.ids.includes(id)) profile.freeTaken.ids.push(id);
  saveProfile(profile);
}

export function shopBought(profile, id, windowIndex = windowIndexAt()) {
  const stock = profile.shopStock;
  if (!stock || stock.window !== windowIndex) return 0;
  return Number(stock.bought?.[id] ?? 0);
}

export function markShopBought(profile, id, n = 1, windowIndex = windowIndexAt()) {
  if (!profile.shopStock || profile.shopStock.window !== windowIndex) {
    profile.shopStock = { window: windowIndex, bought: {} };
  }
  profile.shopStock.bought[id] = (Number(profile.shopStock.bought[id]) || 0) + n;
  saveProfile(profile);
}

const WISH_KEY = 'wikster.wishlist.v1';
export function loadWishlist() {
  try {
    const raw = JSON.parse(localStorage.getItem(WISH_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((c) => c && typeof c.key === 'string') : [];
  } catch { return []; }
}
export function saveWishlist(cards) {
  try { localStorage.setItem(WISH_KEY, JSON.stringify(cards.slice(0, 200))); } catch {}
}

const WISH_SEEN_KEY = 'wikster.wishSeen.v1';
export function loadWishSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(WISH_SEEN_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
export function saveWishSeen(ids) {
  try { localStorage.setItem(WISH_SEEN_KEY, JSON.stringify(ids.slice(-200))); } catch {}
}

const BIDS_KEY = 'wikster.myBids.v1';
export function loadMyBids() {
  try {
    const raw = JSON.parse(localStorage.getItem(BIDS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string').slice(-100) : [];
  } catch { return []; }
}
export function saveMyBids(ids) {
  try { localStorage.setItem(BIDS_KEY, JSON.stringify(ids.slice(-100))); } catch {}
}

const LOADOUT_KEY = 'wikster.badgeLoadout.v1';
export function loadBadgeLoadout() {
  try {
    const raw = localStorage.getItem(LOADOUT_KEY);
    if (raw === null) return null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string').slice(0, 4) : null;
  } catch { return null; }
}
export function saveBadgeLoadout(ids) {
  try {
    if (ids === null) localStorage.removeItem(LOADOUT_KEY);
    else localStorage.setItem(LOADOUT_KEY, JSON.stringify(ids.slice(0, 4)));
  } catch {}
}

const FRAME_KEY = 'wikster.frameStyle.v1';
export function loadFrameStyle() {
  try { return localStorage.getItem(FRAME_KEY) || null; } catch { return null; }
}
export function saveFrameStyle(styleId) {
  try { localStorage.setItem(FRAME_KEY, styleId); } catch {}
}

const BINDER_VIEWS = ['albums', 'classic', 'all'];
const BINDER_SIMPLE_KEY = 'wikster.binderSimple.v1';

export function loadBinderView() {
  try {
    const view = localStorage.getItem(BINDER_VIEW_KEY);
    return BINDER_VIEWS.includes(view) ? view : 'albums';
  } catch {
    return 'albums';
  }
}

export function saveBinderView(view) {
  try { localStorage.setItem(BINDER_VIEW_KEY, BINDER_VIEWS.includes(view) ? view : 'albums'); }
  catch {}
}

export function loadBinderSimple() {
  try { return localStorage.getItem(BINDER_SIMPLE_KEY) === '1'; } catch { return false; }
}

export function saveBinderSimple(on) {
  try { localStorage.setItem(BINDER_SIMPLE_KEY, on ? '1' : '0'); } catch {}
}

export function loadCustomPacks() {
  const packs = readJson(CUSTOM_KEY, []);
  return Array.isArray(packs) ? packs : [];
}

export function saveCustomPack(pack) {
  const slug = customSlug(packHost(pack) || pack.id);
  const packs = loadCustomPacks().filter((p) => customSlug(packHost(p) || p.id) !== slug);
  packs.unshift(pack);
  writeJson(CUSTOM_KEY, packs);
  return packs;
}

export function replaceCustomPacks(packs) {
  writeJson(CUSTOM_KEY, Array.isArray(packs) ? packs : []);
  return loadCustomPacks();
}

export function deleteCustomPack(id) {
  const slug = customSlug(id);
  const packs = loadCustomPacks().filter((p) => customSlug(packHost(p) || p.id) !== slug);
  writeJson(CUSTOM_KEY, packs);
  return packs;
}

export function packHost(pack) {
  try {
    const url = new URL(pack?.wiki?.apiUrl ?? '');
    return url.host + url.pathname.replace('/api.php', '');
  } catch {
    return '';
  }
}

export function healCustomPacks(collection) {
  const packs = loadCustomPacks();
  const bySlug = new Map();
  for (const pack of packs) {
    const slug = customSlug(packHost(pack) || pack.id);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, pack);
  }
  const before = bySlug.size;

  let restored = 0;
  for (const entry of Object.values(collection.entries ?? {})) {
    const [kind, ident] = String(entry.packId ?? '').split('|');
    if (kind !== 'custom' || !ident) continue;
    const slug = customSlug(ident);
    if (!slug || bySlug.has(slug)) continue;
    const host = ident.replace(/^https?:\/\//, '');
    bySlug.set(slug, {
      id: `custom-${slug}`,
      name: String(entry.packName ?? slug).replace(/\u00b7.*$/, '').trim() || slug,
      tagline: entry.sourceName ?? '',
      icon: 'wand',
      accent: entry.packAccent ?? '#a78bfa',
      accent2: '#4c1d95',
      wiki: { apiUrl: `https://${host}/api.php`, sitename: entry.sourceName ?? entry.packName ?? slug }
    });
    restored++;
  }
  if (restored || bySlug.size !== packs.length || before !== packs.length) {
    writeJson(CUSTOM_KEY, [...bySlug.values()]);
  }
  return restored;
}

const FX_KEY = 'wikster.cardFx.v1';

export function loadCardFx() {
  const data = readJson(FX_KEY, null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).filter(([rarityId, id]) => fxExists(rarityId, id) && id !== DEFAULT_FX));
}

export const saveCardFx = (choices) => writeJson(FX_KEY, choices ?? {});
