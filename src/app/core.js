import * as store from '../collection.js';
import { noteIn } from '../ledger.js';
import { quietly, touch } from '../save.js';
import { DEFAULT_FRAME_STYLE } from '../framemeta.js';
import { buckSvg, iconSvg, inkSvg } from '../data/icons.js';
import { loadInk } from '../ink.js';
import { formatAmount, popularityFromViews } from '../pricing.js';
import { DEFAULT_THEME, applyTheme } from '../ui/themes.js';
import { CUSTOM_THEME, composeCustom, composeFriend, themeRarityText, themeTokens } from '../ui/customtheme.js';
import { friendThemeOf, isFriendLook, useFriendSource } from '../friendcodes.js';
import { themeIdOwned } from '../appearance.js';
import { backdrop } from '../ui/backdrop.js';
import { emit } from '../ui/bus.js';
import { synth } from '../ui/sound.js';
import { getLanguage, t } from '../i18n.js';
import { fetchViewsFor, refreshTitleCard, translateCard } from '../wiki/lazy.js';
import { codeById, codeCardFor, codeLook, useCodeSource } from '../codedefs.js';
import * as account from '../account.js';
import { goToLatest } from '../version.js';
import { reportQuest } from './arcade.js';
import { renderAlbum, renderBinder } from './binder.js';
import { regradeCollection } from './boot.js';
import { paintDrawerLinks } from './drawer.js';
import { showGate, userId, takeMerge } from './gate.js';
import { paintPanel } from './panel.js';
import { live } from './live.js';
import { tickTimed } from './packs.js';
import { holdWakeLock, releaseWakeLock } from './prefs.js';
import { tickRestock } from './stipend.js';
import { closeChatWire } from './social.js';

export const RIP_COMMIT = 0.62;

export const RIP_TICK_STEP = 0.055;

export const RIP_LOCK_SLOP = 10;

export const SWIPE_COMMIT = 78;

export const EMERGE_STAGGER = 130;

export const EMERGE_DURATION = 820;

export const DRAW_HARD_LIMIT = 18000;

export const PREFETCH_DELAY = 350;

export const LAST_CARD_HOLD = 2000;

export const TILT_REACH = 110;

export function $(sel) {
  return (document.querySelector(sel));
}

export function clamp(n, lo, hi) {
  return (Math.min(hi, Math.max(lo, n)));
}

export function clamp01(n) {
  return (clamp(n, 0, 1));
}

export function wait(ms) {
  return (new Promise((r) => setTimeout(r, ms)));
}

export function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const THEME_KEY = 'wikster.theme';

export const RIP_DIR_KEY = 'wikster.ripDirection';

export const state = {
  tab: 'packs',
  packMode: 'owned',
  blocked: new Set(),
  spec: null,
  customPacks: store.loadCustomPacks(),
  collection: store.loadCollection(),
  inventory: store.loadInventory(),
  profile: store.loadProfile(),
  wallet: store.loadWallet(),
  ink: loadInk(),
  frameStyle: store.loadFrameStyle() ?? DEFAULT_FRAME_STYLE,
  badgeLoadout: store.loadBadgeLoadout(),
  cardFx: store.loadCardFx(),
  market: { view: 'browse' },
  cardIndex: {
    rows: [], counts: null, search: '', rarity: null, sort: 'recent',
    page: 0, more: false, wishMode: false, busy: false
  },
  wishlist: new Map(store.loadWishlist().map((card) => [card.key, card])),
  wishSeen: new Set(store.loadWishSeen()),
  friendWishes: new Map(),
  ripDir: Number(localStorage.getItem?.(RIP_DIR_KEY)) || 0,
  prefetch: null,
  prefetchTimer: null,
  summaryTimer: null,
  forging: false,
  pulls: [], cards: [], index: 0, seen: new Set(),
  detail: null,
  album: null, albumTurning: false,
  packSlots: [],
  filters: { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'rarity', favoritesOnly: false },
  binderView: store.loadBinderView(),
  binderSimple: store.loadBinderSimple(),
  friendView: 'albums',

  account: { session: null, profile: null, mode: 'signin', syncing: false, syncedAt: null, failed: false },
  social: { friends: [], incoming: [], outgoing: [], results: [], loaded: false, unread: new Map(), trades: [] },
  viewing: null,
  guild: undefined,
  standing: null
};

useFriendSource(() => state.profile?.friendCodes);
useCodeSource(() => state.profile?.codeDefs);

export const debug = { failNextOpen: false };

export function settings() {
  return (state.profile.settings);
}

export function money(amount) {
  return (`${buckSvg({ size: 12 })}${formatAmount(amount)}`);
}
export function ink(amount) {
  return (`${inkSvg({ size: 12 })}${formatAmount(amount)}`);
}

export function esc(value) {
  return (String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
}
export function plainText(value) {
  const raw = String(value ?? '');
  if (!/[<&]/.test(raw)) return raw.trim();
  const box = document.createElement('div');
  box.innerHTML = raw;
  return (box.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export const el = {};

export function bind(map) {
  return (Object.assign(el, map));
}

live.nav = undefined;
live.sheet = undefined;
live.walletOdo = undefined;
live.levelRing = undefined;
live.profileRing = undefined;
live.xpBar = undefined;
live.trackBar = undefined;
live.packsSeg = undefined;
live.gateSeg = undefined;
live.friendRing = undefined;
live.freeRing = undefined;

export const ticker = { id: null, jobs: new Map() };

export function runTicker() { for (const job of ticker.jobs.values()) job(); }

export function setTickerJob(name, job) {
  if (job) ticker.jobs.set(name, job);
  else ticker.jobs.delete(name);
  syncTicker();
}

export function syncTicker() {
  const wanted = document.visibilityState === 'visible' && ticker.jobs.size > 0;
  if (wanted && ticker.id == null) ticker.id = setInterval(runTicker, 1000);
  if (!wanted && ticker.id != null) { clearInterval(ticker.id); ticker.id = null; }
}

live.visibleSince = document.visibilityState === 'visible' ? Date.now() : null;

export let playtimeCarry = 0;

export function flushPlaytime() {
  if (live.visibleSince == null) return;
  const ms = Date.now() - live.visibleSince;
  quietly(() => store.addPlaytime(state.profile, ms));
  live.visibleSince = Date.now();
  playtimeCarry += ms;
  const minutes = Math.floor(playtimeCarry / 60000);
  if (minutes > 0) { playtimeCarry -= minutes * 60000; for (let i = 0; i < minutes; i++) reportQuest('playtime'); }
}

export function compactCount(n) {
  if (!Number.isFinite(n)) return '?';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export const TOAST_MARKS = { ok: 'check', error: 'close', bought: 'gem', info: 'bell' };

let toastGate = null;

export function useToastGate(fn) {
  toastGate = typeof fn === 'function' ? fn : null;
}

export function toast(markup, kind = 'ok') {
  if (kind === 'error' && toastGate) {
    let pass = true;
    try { pass = toastGate(markup) !== false; } catch { pass = true; }
    if (!pass) return;
  }
  const node = el.toast;
  if (!node.dataset.bound) {
    node.dataset.bound = '1';
    node.addEventListener('click', () => node.classList.remove('is-showing'));
  }
  node.hidden = false;
  node.className = `toast is-${kind}`;
  node.innerHTML = `<span class="toast-mark" aria-hidden="true">${iconSvg(TOAST_MARKS[kind] ?? 'check', { size: 15 })}</span><span class="toast-text">${markup}</span><i class="toast-bar" aria-hidden="true"></i>`;
  void node.offsetWidth;
  node.classList.add('is-showing');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.classList.remove('is-showing'); }, 3200);
}

export const LOOK_KEY = 'wikster.look.v1';

export function rememberLook(patch) {
  try {
    let held = {};
    try { held = JSON.parse(localStorage.getItem(LOOK_KEY) ?? '{}') ?? {}; } catch {}
    const next = JSON.stringify({ ...held, ...patch });
    if (next !== localStorage.getItem(LOOK_KEY)) localStorage.setItem(LOOK_KEY, next);
  } catch {}
}

export function storedTheme() {
  try { return localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

const ownsLayer = (id) => themeIdOwned(state.profile, id);

export function composedCustom(custom = state.profile?.customTheme) {
  if (!custom || !ownsLayer(CUSTOM_THEME)) return null;
  return composeCustom(custom, themeTokens, ownsLayer);
}

export let wornScene = { scene: DEFAULT_THEME, special: DEFAULT_THEME, tint: null, veil: 0 };
let wornSig = '';

export function paintScene(look) {
  backdrop.setTheme(look.scene);
  const texture = document.getElementById('texture');
  if (texture) texture.dataset.look = look.special ?? 'none';
  for (const id of ['tint', 'veil']) {
    const node = document.getElementById(id);
    if (!node) continue;
    node.hidden = !look.tint || (id === 'veil' && !look.veil);
    if (!look.tint) continue;
    node.style.setProperty('--tint', look.tint.slice(0, 7));
    node.style.setProperty('--veil', String((look.veil ?? 0) / 100));
  }
}

export function restoreScene() {
  paintScene(wornScene);
}

export function composedFriend(id) {
  if (!isFriendLook(id) || !themeIdOwned(state.profile, id)) return null;
  return composeFriend(id, friendThemeOf(id));
}

export function useTheme(id, { announce = false, keep = false } = {}) {
  const special = id === CUSTOM_THEME || isFriendLook(id);
  const composed = id === CUSTOM_THEME ? composedCustom() : isFriendLook(id) ? composedFriend(id) : null;
  const theme = composed ? applyTheme(composed.id, composed) : applyTheme(special ? DEFAULT_THEME : id);
  if (!composed) for (const [name, value] of Object.entries(themeRarityText(theme.id))) document.documentElement.style.setProperty(name, value);
  const wear = composed ? composed.id : theme.id;
  if (!keep && !(special && !composed)) {
    try { localStorage.setItem(THEME_KEY, wear); touch(THEME_KEY); } catch {}
  }
  wornScene = composed
    ? { scene: composed.scene, special: composed.special, tint: composed.tint, veil: composed.veil }
    : { scene: theme.id, special: theme.id, tint: null, veil: 0 };
  wornSig = `${wear}|${composed ? JSON.stringify(composed.custom) : ''}`;
  paintScene(wornScene);
  synth.setTheme(composed ? composed.sound : theme.id);
  const motion = composed?.motion ?? theme.motion;
  const ground = String(theme.swatch[0]).slice(0, 7);
  document.documentElement.style.setProperty('--intro-bg', ground);
  rememberLook({
    id: wear, t: document.documentElement.dataset.theme ?? theme.id, v: composed?.vars ?? null,
    bg: ground, m: [motion.scale, motion.ease, motion.pop]
  });
  if (!composed) try { window.WiksterIcon?.setIcon(theme.id); } catch {}
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme.swatch[0].slice(0, 7));
  if (announce) { synth.resume(); synth.playTheme(); }
  if (state.profile && noteIn(state.profile, 'themesWorn', wear, 64)) store.saveProfile(state.profile);
  emit('look');
  return theme;
}

export function refreshWornTheme() {
  const id = storedTheme();
  const composed = id === CUSTOM_THEME ? composedCustom() : isFriendLook(id) ? composedFriend(id) : null;
  const sig = `${composed ? composed.id : id === CUSTOM_THEME || isFriendLook(id) ? DEFAULT_THEME : id}|${composed ? JSON.stringify(composed.custom) : ''}`;
  if (sig === wornSig) return false;
  useTheme(id, { keep: true });
  return true;
}

export const SCREEN_TITLES = {
  packs: 'tabBoosters', timed: 'tabTimed', shop: 'tabShop',
  binder: 'tabCollection', profile: 'tabProfile', settings: 'tabSettings',
  friends: 'tabFriends', friend: 'tabFriends', discussions: 'tabDiscussions'
};

export const WIDE = matchMedia('(min-width: 1024px)');

export function placeDrawerLinks() {
  const links = el.drawerLinks;
  const rail = document.querySelector('.navbar');
  if (!links || !rail) return;
  if (WIDE.matches) {
    if (links.parentElement !== rail) rail.appendChild(links);
  } else {
    const panel = document.querySelector('.drawer-panel');
    if (panel && links.parentElement !== panel) panel.appendChild(links);
  }
  document.documentElement.classList.toggle('is-wide', WIDE.matches);
}

let appScrolled = true;
let appScrollWatched = false;

function resetAppScroll() {
  const app = document.getElementById('app');
  if (!app) return;
  if (!appScrollWatched) {
    appScrollWatched = true;
    app.addEventListener('scroll', () => { appScrolled = app.scrollTop > 0; }, { passive: true });
  }
  if (!appScrolled) return;
  appScrolled = false;
  app.scrollTo({ top: 0 });
}

export function showScreen(name) {
  Object.entries(el.screens).forEach(([key, node]) => node.classList.toggle('is-active', key === name));
  if (name !== 'open') {
    state.tab = name;
    live.nav?.select(navTabFor(name), { silent: true });
    paintDrawerLinks();
    if (state.account.mergePending) takeMerge();
  }

  const immersive = name === 'open';
  document.documentElement.classList.toggle('is-immersive', immersive);
  backdrop.setPaused(immersive);
  if (immersive) holdWakeLock(); else releaseWakeLock();

  paintPanel();
  setTickerJob('panel', WIDE.matches ? paintPanel : null);
  setTickerJob('shop', name === 'shop' ? tickRestock : null);
  setTickerJob('timed', name === 'timed' ? tickTimed : null);
  if (name !== 'chat' && live.chatTimer) { clearInterval(live.chatTimer); live.chatTimer = null; }
  if (name !== 'chat') closeChatWire();
  resetAppScroll();
  emit('screen', name);
}

export function navTabFor(screen) {
  return (screen === 'market' || screen === 'atelier' ? 'shop'
    : screen === 'cardindex' || screen === 'selling' ? 'binder'
      : screen === 'glossary' ? 'packs'
        : ['wikdle', 'duel', 'reveal', 'versus'].includes(screen) ? 'games'
          : (['settings', 'customize', 'badges', 'friends', 'discussions', 'friend', 'chat', 'ach', 'updates', 'quiz', 'games', 'quests', 'leaderboard', 'guilds', 'season'].includes(screen) ? 'profile' : screen));
}

export function refreshWallet() {
  state.wallet = store.loadWallet();
  state.ink = loadInk();
  live.walletOdo.set(state.wallet);
  if (el.shopPurse) el.shopPurse.innerHTML = money(state.wallet);
  if (el.atelierPurse) el.atelierPurse.innerHTML = ink(state.ink);
  if (el.atelierCoins) el.atelierCoins.innerHTML = money(state.wallet);
  el.wallet.setAttribute('aria-label', `${t('walletTitle')}: ${formatAmount(state.wallet)}`);
  emit('wallet', state.wallet);
}

export function openSheet(title, build, { dismissible = true, onClose = null, overGate = false } = {}) {
  el.sheetTitle.textContent = title;
  el.sheetClose.hidden = !dismissible;
  el.sheetBody.replaceChildren();
  build(el.sheetBody);
  live.sheet.show(onClose, { locked: !dismissible });
  el.sheet.classList.toggle('is-locked', !dismissible);
  el.sheet.classList.toggle('is-over-gate', overGate);
}

export function applyStrings() {
  document.documentElement.lang = getLanguage();
  el.menuIcon.innerHTML = iconSvg('menu', { size: 20 });
  el.bellIcon.innerHTML = iconSvg('bell', { size: 19 });
  if (el.inkIcon) el.inkIcon.innerHTML = inkSvg({ size: 17 });
  el.walletMark.innerHTML = buckSvg({ size: 12 });
  el.sheetClose.innerHTML = iconSvg('close', { size: 17 });
  el.openBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.openSkip.innerHTML = iconSvg('skipEnd', { size: 17 });
  el.openSkip.setAttribute('aria-label', t('openSkip'));
  el.openSkip.title = t('openSkip');
  el.oddsBtn.setAttribute('aria-label', t('pullRates'));
  el.packsEmptyCta.textContent = t('goShop');
  el.menuBtn.setAttribute('aria-label', t('menu'));
  el.bell.setAttribute('aria-label', t('notifTitle'));
  el.inkBtn?.setAttribute('aria-label', t('walletInkMore'));

  live.nav?.setLabels({
    packs: t('tabBoosters'), timed: t('tabTimed'), shop: t('tabShop'),
    binder: t('tabCollection'), profile: t('tabProfile')
  });
  live.packsSeg?.relabel([{ label: t('owned') }, { label: t('tabCustom') }]);
  live.gateSeg?.relabel([{ label: t('gateSignIn') }, { label: t('gateSignUp') }]);
  if (!el.gate.hidden) showGate();
}

export const NO_TWIN_KEY = 'wikster.noTranslation.v1';

export const MIGRATE_PER_LAUNCH = 40;

export const MIGRATE_BUDGET_MS = 20000;

export function loadNoTwin() {
  try {
    const list = JSON.parse(localStorage.getItem(NO_TWIN_KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function saveNoTwin(set) {
  try { localStorage.setItem(NO_TWIN_KEY, JSON.stringify([...set].slice(-400))); }
  catch {}
}

export async function migrateLanguages() {
  if (!navigator.onLine) return;
  const lang = getLanguage();
  const skip = loadNoTwin();
  const skipKey = (entry) => `${lang}:${entry.key}`;
  const stale = Object.values(state.collection.entries ?? {})
    .filter((entry) => (entry.lang ?? 'en') !== lang && !skip.has(skipKey(entry)))
    .slice(0, MIGRATE_PER_LAUNCH);
  if (!stale.length) return;

  const deadline = Date.now() + MIGRATE_BUDGET_MS;
  let moved = 0;
  for (let i = 0; i < stale.length; i += 3) {
    if (Date.now() > deadline || !navigator.onLine) break;
    const batch = stale.slice(i, i + 3);
    const results = await Promise.all(batch.map((entry) =>
      translateCard(entry, lang).catch(() => null)));
    batch.forEach((entry, n) => {
      const card = results[n];
      if (!card) { skip.add(skipKey(entry)); return; }
      if (store.replaceEntryWithTranslation(state.collection, entry, card, lang)) moved++;
    });
  }
  saveNoTwin(skip);
  if (!moved) return;
  regradeCollection();
  if (state.tab === 'binder') renderBinder();
  toast(t('langMigrated', { n: moved }), 'ok');
}

export const SPECIAL_FIX_KEY = 'wikster.specialCards.v2';

export function isPlate(src) {
  return (!src || String(src).startsWith('data:image/svg'));
}

export async function migrateSpecialCards() {
  if (!navigator.onLine) return;
  try { if (localStorage.getItem(SPECIAL_FIX_KEY) === 'done') return; } catch {}
  const owned = Object.values(state.collection.entries ?? {}).filter((entry) => entry.special && !entry.creator);
  let fixed = 0;
  let missed = 0;
  const deadline = Date.now() + MIGRATE_BUDGET_MS;
  for (const entry of owned) {
    if (Date.now() > deadline || !navigator.onLine) { missed++; break; }
    const want = codeCardFor(entry.special, entry);
    if (!want) continue;
    const wrongSource = Boolean(want.wiki || want.wikiUrls) && !String(entry.sourceId ?? '').startsWith('wiki:');
    const noPicture = !want.art && isPlate(entry.thumbnail);
    if (!wrongSource && !noPicture) continue;
    const card = await refreshTitleCard(want, {
      special: entry.special,
      fallbackArt: codeLook(codeById(entry.special)).accent
    }).catch(() => null);
    if (!card) { missed++; continue; }
    if (!wrongSource && isPlate(card.thumbnail)) { missed++; continue; }
    if (store.replaceSpecialCard(state.collection, entry, card)) fixed++;
  }
  if (!missed) { try { localStorage.setItem(SPECIAL_FIX_KEY, 'done'); } catch {} }
  if (!fixed) return;
  regradeCollection();
  if (userId()) account.pushSave(userId()).catch(() => {});
  if (state.tab === 'binder') { if (state.album) renderAlbum(); else renderBinder(); }
  toast(t('specialFixed', { n: fixed }), 'ok');
}

export const VIEWS_FIX_KEY = 'wikster.viewsRepair.v1';

export async function migrateViews() {
  if (!navigator.onLine) return;
  try { if (localStorage.getItem(VIEWS_FIX_KEY) === 'done') return; } catch {}
  const byLang = new Map();
  for (const entry of Object.values(state.collection.entries ?? {})) {
    if (entry.special || entry.views != null) continue;
    const source = String(entry.sourceId ?? '');
    if (!source.startsWith('wikipedia:')) continue;
    const lang = source.slice('wikipedia:'.length) || 'en';
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang).push(entry);
  }
  let fixed = 0;
  let missed = 0;
  for (const [lang, entries] of byLang) {
    const batch = entries.slice(0, 60);
    if (batch.length < entries.length) missed++;
    const views = await fetchViewsFor(batch.map((entry) => entry.title), lang).catch(() => null);
    if (!views) { missed++; continue; }
    for (const entry of batch) {
      const n = views.get(entry.title);
      if (n == null) continue;
      entry.views = n;
      entry.popularity = popularityFromViews(n);
      fixed++;
    }
  }
  if (!missed) { try { localStorage.setItem(VIEWS_FIX_KEY, 'done'); } catch {} }
  if (!fixed) return;
  store.saveCollection(state.collection);
  const regraded = regradeCollection();
  if (userId()) account.pushSave(userId()).catch(() => {});
  if (!regraded) return;
  if (state.tab === 'binder') { if (state.album) renderAlbum(); else renderBinder(); }
  toast(t('viewsRepaired', { n: regraded }), 'ok');
}

export let updateBar = null;

export function showUpdateBar(_why = 'outdated') {
  if (!updateBar) {
    updateBar = document.createElement('div');
    updateBar.className = 'update-bar';
    updateBar.setAttribute('role', 'status');
    document.body.appendChild(updateBar);
  }
  const action = `<button type="button" class="btn btn-primary" data-act="reload">${esc(t('updateReload'))}</button>`;
  updateBar.innerHTML = `<p>${esc(t('syncOutdated'))}</p>${action}<button type="button" class="btn btn-ghost" data-act="later">${esc(t('updateLater'))}</button>`;
  updateBar.querySelector('[data-act="reload"]').addEventListener('click', goToLatest);
  updateBar.querySelector('[data-act="later"]').addEventListener('click', () => { updateBar.hidden = true; });
  updateBar.hidden = false;
  dispatchEvent(new Event('wikster:check-update'));
}
