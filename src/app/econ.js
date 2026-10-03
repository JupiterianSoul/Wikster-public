import { askHouse } from '../house.js';
import * as store from '../collection.js';
import { saveInk } from '../ink.js';
import { getLanguage, t } from '../i18n.js';
import { ECON_KEYS, MAX_CUSTOM_PACKS } from '../econ/core.js';
import { captureError } from './errors.js';
import { SERVER_ONLY, predict } from '../econ/local.js';
import { esc, refreshWallet, refreshWornTheme, state, storedTheme, toast } from './core.js';
import { isFriendLook } from '../friendcodes.js';
import { androidApp } from '../platform.js';
import { specialPhoto, withSpecialPhoto } from '../codedefs.js';
import { mendReply } from '../econ/delta.js';
import { failureKind, offline, pause, retryDelay } from '../backoff.js';

const LIVE_KEY = 'wikster.econLive.v1';
const STATE_KEY = 'wikster.econState.v1';
const SINCE_KEY = 'wikster.econSince.v1';
const BASE_KEY = 'wikster.econBase.v1';
export const ECON_TIMEOUT_MS = 10000;
const SLOW_TIMEOUT_MS = 25000;
const BATCH_MAX = 12;
const PATIENT_TRIES = 8;
const QUICK_TRIES = 2;
const QUICK_WAIT_MAX = 8000;
const RESEND_SAFE = new Set([
  'snapshot', 'import', 'sync', 'level', 'daily', 'achievement', 'medals', 'stipend', 'quest', 'seasonRung', 'seasonQuest',
  'wikdle', 'redeem', 'favorite', 'favoriteMany', 'collect', 'grants', 'customDelete', 'customSave', 'wikiFind', 'safeReady'
]);
const STEADY = new Set(['customSave', 'customDelete', 'wikiFind']);
const STEADY_TRIES = 3;

export function resendSafe(action, args) {
  if (action === 'batch') return Array.isArray(args?.items) && args.items.length > 0 && args.items.every((item) => resendSafe(item?.action, item?.args));
  if (action === 'buy') return args?.section === 'customs' && typeof args?.req === 'string' && args.req.length > 0;
  return RESEND_SAFE.has(action);
}

export const MIRRORED = [...ECON_KEYS, 'seasonDay', 'wikdleStats', 'games', 'quiz', 'versusDay', 'questDay'];

let live = false;

const seenLive = (id) => { try { return Boolean(id) && localStorage.getItem(LIVE_KEY) === id; } catch { return false; } };
const markLive = (id) => { try { if (id) localStorage.setItem(LIVE_KEY, id); } catch {} };

export const serverEconomy = () => live;

const SERVER_KEYS = ['wikster.collection.v3', 'wikster.wallet.v1', 'wikster.ink.v1', 'wikster.inventory.v1', 'wikster.customPacks.v2'];

export const serverOwnedKeys = (userId) => (live || seenLive(userId) ? SERVER_KEYS : []);

let econState = {};
let econUser = null;
let held = null;

export function keepBase() {
  try { if (econUser && held) localStorage.setItem(BASE_KEY, JSON.stringify({ user: econUser, ...held })); } catch {}
}

function keptBase(userId) {
  try {
    const got = JSON.parse(localStorage.getItem(BASE_KEY) ?? 'null');
    if (got?.user !== userId || typeof got.sv !== 'string' || !got.state || typeof got.state !== 'object' || !got.inventory || typeof got.inventory !== 'object') return null;
    return { state: got.state, inventory: got.inventory, sv: got.sv };
  } catch {
    return null;
  }
}

function keepState() {
  try { if (econUser) localStorage.setItem(STATE_KEY, JSON.stringify({ user: econUser, state: econState })); } catch {}
}

function keptState(userId) {
  try {
    const held = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    return held?.user === userId && held.state && typeof held.state === 'object' ? held.state : null;
  } catch {
    return null;
  }
}
let sinceAt = null;
let dirty = false;

function readSince(userId) {
  try {
    const held = JSON.parse(localStorage.getItem(SINCE_KEY) ?? 'null');
    return held?.user === userId && Number.isFinite(held.at) ? { at: held.at, dirty: Boolean(held.dirty) } : null;
  } catch {
    return null;
  }
}

function writeSince() {
  try { if (econUser && sinceAt != null) localStorage.setItem(SINCE_KEY, JSON.stringify({ user: econUser, at: sinceAt, dirty })); } catch {}
}

function markDirty() {
  if (dirty) return;
  dirty = true;
  writeSince();
}

function markClean() {
  if (!dirty) return;
  dirty = false;
  writeSince();
}

let engine = null;
let engineLoading = null;

export function loadEngine() {
  engineLoading ??= import('../econ/engine.js').then((m) => { engine = m; return m; }).catch(() => { engineLoading = null; return null; });
  return engineLoading;
}

let overlay = null;
export const useServerOverlay = (fn) => { overlay = fn; };
export const economyUser = () => econUser;
export const econStateNow = () => econState;

const stateWatchers = new Set();
export const onServerState = (fn) => stateWatchers.add(fn);

const platePin = (src) => !src || String(src).startsWith('data:image/svg');

export function refreshPins(cards, renamed) {
  const pins = state.profile?.showcase;
  if (!Array.isArray(pins) || !pins.length || !cards) return false;
  const moves = renamed && typeof renamed === 'object' ? renamed : {};
  let changed = false;
  const next = pins.map((pin) => {
    const key = moves[pin?.key] ?? pin?.key;
    const entry = key ? cards[key] : null;
    if (!entry) return pin;
    if (key === pin.key && !(platePin(pin.thumbnail) && !platePin(entry.thumbnail)) && !specialPhoto(key)) return pin;
    const fresh = { ...entry, thumbnail: specialPhoto(key) ?? entry.thumbnail };
    if (key === pin.key && fresh.thumbnail === pin.thumbnail && fresh.title === pin.title) return pin;
    changed = true;
    return fresh;
  });
  if (!changed) return false;
  state.profile.showcase = next;
  store.saveProfile(state.profile);
  return true;
}

export function applyEcon(res, { server = false } = {}) {
  if (!res || typeof res !== 'object') return res;
  const lay = server && overlay ? overlay : null;
  if (res.state && typeof res.state === 'object') {
    const was = econState;
    econState = res.state;
    keepState();
    if (server) for (const fn of stateWatchers) { try { fn(was, res.state); } catch {} }
  }
  if (Number.isFinite(res.since) && econUser) { sinceAt = res.since; writeSince(); }
  if (res.wallet) {
    state.wallet = Math.max(0, Number(res.wallet.coins) || 0);
    store.saveWallet(state.wallet);
    state.ink = Math.max(0, Number(res.wallet.ink) || 0);
    saveInk(state.ink);
  }
  if (res.inventory && typeof res.inventory === 'object') {
    state.inventory = Object.fromEntries(Object.entries(res.inventory)
      .filter(([, slot]) => slot?.spec && slot.count > 0)
      .map(([id, slot]) => [id, { spec: slot.spec, count: slot.count }]));
    lay?.inventory(state.inventory, res.state ?? econState);
    store.saveInventory(state.inventory);
  }
  if (res.cards && typeof res.cards === 'object' && !Array.isArray(res.cards)) {
    if (res.replace) state.collection = { ...state.collection, entries: {} };
    for (const [key, entry] of Object.entries(res.cards)) {
      if (entry) state.collection.entries[key] = withSpecialPhoto(entry);
      else delete state.collection.entries[key];
    }
    lay?.cards(state.collection.entries, res.replace ? null : Object.keys(res.cards), res.state ?? econState);
    store.saveCollection(state.collection);
    if (server) refreshPins(res.cards, res.renamed);
  }
  if (res.state && typeof res.state === 'object') {
    for (const key of MIRRORED) {
      if (res.state[key] === undefined) delete state.profile[key];
      else state.profile[key] = res.state[key];
    }
    store.normalizeProfile(state.profile);
    store.saveProfile(state.profile);
    if (isFriendLook(storedTheme())) refreshWornTheme();
  }
  if (Array.isArray(res.custom)) state.customPacks = store.replaceCustomPacks(res.custom);
  refreshWallet();
  return res;
}

let pending = 0;
let busyTimer = null;
let bar = null;

function busy(delta) {
  pending = Math.max(0, pending + delta);
  if (typeof document === 'undefined') return;
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'econ-busy';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }
  clearTimeout(busyTimer);
  if (pending > 0) busyTimer = setTimeout(() => bar.classList.add('is-on'), 120);
  else bar.classList.remove('is-on');
}

const inventoryWatchers = new Set();
const stopWatchers = new Set();

export const onInventoryChange = (fn) => inventoryWatchers.add(fn);
export const onEconomyStop = (fn) => stopWatchers.add(fn);

const heldSignature = () => JSON.stringify([
  Object.entries(state.inventory ?? {}).map(([id, slot]) => `${id}:${slot?.count ?? 0}`).sort(),
  (state.profile?.timed?.count ?? 0) > 0
]);

const DIRECT = new Set(['ready', 'prepare', 'prepareMany', 'ping']);

const serverInventoryWatchers = new Set();
export const onServerInventory = (fn) => serverInventoryWatchers.add(fn);

let serverHeld = null;

function applyAndWatch(data, server = false) {
  const before = heldSignature();
  applyEcon(data, { server });
  if (heldSignature() !== before) for (const fn of inventoryWatchers) { try { fn(); } catch {} }
  if (!server || !data?.inventory || typeof data.inventory !== 'object') return;
  const held = JSON.stringify([Object.entries(data.inventory).map(([id, slot]) => `${id}:${slot?.count ?? 0}`).sort(), data.state?.timed?.count ?? null]);
  if (held === serverHeld) return;
  serverHeld = held;
  for (const fn of serverInventoryWatchers) { try { fn(); } catch {} }
}

const settleWatchers = new Set();
export const onEconomySettled = (fn) => settleWatchers.add(fn);

let line = [];
let pumping = false;
let idle = Promise.resolve();
let settle = () => {};
let inFlight = 0;
let deferred = [];
let broken = null;
let failedAny = false;
let batching = true;

const shownSignature = () => JSON.stringify([state.wallet, state.ink, heldSignature(), Object.keys(state.collection?.entries ?? {}).length]);

function drain() {
  const shown = shownSignature();
  const replies = deferred;
  deferred = [];
  for (const data of replies) applyAndWatch(data, true);
  const failed = broken;
  broken = null;
  const clean = !failed && !failedAny;
  failedAny = false;
  const again = recheck;
  recheck = false;
  if (clean && !again) markClean();
  if (failed) {
    toast(esc(econMessage(failed, t)), 'error');
    send('snapshot', {}, { timeout: SLOW_TIMEOUT_MS, patient: true }).catch(() => {});
    return;
  }
  if (again) send('snapshot', {}, { timeout: SLOW_TIMEOUT_MS, patient: true }).catch(() => {});
  if (replies.length && shownSignature() !== shown) for (const fn of settleWatchers) { try { fn(); } catch {} }
}

let lastAsk = 0;
let lastInput = 0;
let readyHook = null;
let recheck = false;
export const useReadyHook = (hook) => { readyHook = hook; };

const retryWatchers = new Set();
export const onEconRetry = (fn) => { retryWatchers.add(fn); return () => retryWatchers.delete(fn); };

function mend(data, base, user) {
  const got = mendReply(data, base);
  if (user !== econUser) return got.reply;
  if (got.held) held = got.held;
  else if (!got.ok) {
    held = null;
    setTimeout(() => { refreshEconomy().catch(() => {}); }, 0);
  }
  return got.reply;
}

async function ask(action, args, timeout) {
  lastAsk = Date.now();
  let wanted = null;
  try { wanted = readyHook?.ask(action, args) ?? null; } catch { wanted = null; }
  const sentAt = Date.now();
  const user = econUser;
  const base = user ? held : null;
  let data;
  try {
    data = await askHouse('economy', { action, args, lang: getLanguage(), sv: base?.sv ?? '', ...(androidApp() ? { client: 'android' } : {}), ...(wanted ? { ready: wanted } : {}) }, timeout);
  } catch (error) {
    if (error && typeof error === 'object' && !error.action) error.action = action;
    if (wanted) { try { readyHook?.done(null, sentAt); } catch {} }
    throw error;
  }
  data = mend(data, base, user);
  if (wanted) { try { readyHook?.done(data?.readyNow ?? null, sentAt); } catch {} }
  return data;
}

async function askHard(job) {
  let doubt = false;
  for (let attempt = 0; ; attempt++) {
    try {
      return { data: await ask(job.action, job.args, job.timeout), doubt };
    } catch (error) {
      const kind = failureKind(error);
      if (!kind) {
        if (doubt && Number(error?.status) === 400) { recheck = true; return { data: { settled: true }, doubt }; }
        throw error;
      }
      if (kind === 'unknown') {
        if (!resendSafe(job.action, job.args)) throw error;
        doubt = true;
      }
      if (attempt + 1 >= (job.patient ? PATIENT_TRIES : STEADY.has(job.action) ? STEADY_TRIES : QUICK_TRIES)) throw error;
      const after = Number(error?.retryAfter) || 0;
      const wait = retryDelay(attempt, { after });
      if (!job.patient && (wait > QUICK_WAIT_MAX || offline())) throw error;
      for (const fn of retryWatchers) { try { fn(job.action, attempt + 1); } catch {} }
      await pause(wait, { floor: after });
      if (!job.patient && offline()) throw error;
    }
  }
}

let lastLaunch = null;
const launchWatchers = new Set();
export const onLaunch = (fn) => launchWatchers.add(fn);

export function takeLaunchStep(kind, ms = 120000) {
  if (!lastLaunch || lastLaunch.user !== econUser || Date.now() - lastLaunch.at > ms) return null;
  const step = lastLaunch.steps?.[kind];
  if (!step || step.error) return null;
  delete lastLaunch.steps[kind];
  return step;
}

const settle1 = (job) => askHard(job).then(({ data }) => job.resolve(data), job.reject);

async function sendBatch(group) {
  const timeout = Math.max(...group.map((job) => job.timeout)) + group.length * 1000;
  let data;
  let doubt = false;
  try {
    ({ data, doubt } = await askHard({
      action: 'batch', args: { items: group.map((job) => ({ action: job.action, args: job.args })) }, timeout, patient: group.some((job) => job.patient)
    }));
  } catch (error) {
    if (String(error?.message ?? '') !== 'UNKNOWN_ACTION') { for (const job of group) job.reject(error); return; }
    batching = false;
    for (const job of group) await settle1(job);
    return;
  }
  if (data?.settled) { for (const job of group) job.resolve({}); return; }
  const results = Array.isArray(data?.results) ? data.results : [];
  const final = {};
  for (const k of ['wallet', 'state', 'inventory']) if (data?.[k]) final[k] = data[k];
  group.forEach((job, i) => {
    const r = results[i];
    if (r?.ok) job.resolve({ ...r.ok, ...final });
    else if (doubt && r?.error && r.error !== 'FAILED') { recheck = true; job.resolve({ ...final }); }
    else job.reject(Object.assign(new Error(String(r?.error ?? 'FAILED')), { action: job.action }));
  });
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (line.length) {
      const group = [line.shift()];
      if (batching && group[0].predicted) while (group.length < BATCH_MAX && line[0]?.predicted) group.push(line.shift());
      if (group.length > 1) await sendBatch(group);
      else await settle1(group[0]);
    }
  } finally {
    pumping = false;
  }
}

function send(action, args, { timeout, predicted = false, after = null, gather = false, patient = predicted }) {
  if (!inFlight) idle = new Promise((resolve) => { settle = resolve; });
  inFlight++;
  markDirty();
  const call = Promise.resolve(after).catch(() => {}).then(() => new Promise((resolve, reject) => {
    line.push({ action, args, timeout, predicted, patient, resolve, reject });
    if (gather) setTimeout(pump, 0);
    else pump();
  }));
  return call.then((data) => {
    live = true;
    deferred.push(data);
    return data;
  }, (error) => {
    failedAny = true;
    if (predicted) broken ??= error;
    throw error;
  }).finally(() => {
    inFlight--;
    if (!inFlight) { drain(); settle(); }
  });
}

export const economyBusy = () => inFlight > 0;

export function flushEconomy() {
  keepBase();
  if (!batching || !pumping || !line[0]?.predicted) return;
  const group = [];
  while (group.length < BATCH_MAX && line[0]?.predicted) group.push(line.shift());
  if (group.length > 1) sendBatch(group);
  else settle1(group[0]);
}

export async function askServer(action, args, timeout = SLOW_TIMEOUT_MS) {
  const data = STEADY.has(action) ? (await askHard({ action, args, timeout })).data : await ask(action, args, timeout);
  live = true;
  return data;
}

export function applyServer(data) {
  const shown = shownSignature();
  applyAndWatch(data, true);
  if (shownSignature() !== shown) for (const fn of settleWatchers) { try { fn(); } catch {} }
}

export function economyIdle() {
  return idle;
}

async function guess(action, args, facts) {
  if (!live || SERVER_ONLY.has(action)) return null;
  if (action === 'buy' && args?.section === 'crate' && (!econState?.crateNext?.spec || econState.crateNext.spec.wiki?.mature)) return null;
  const m = engine ?? await loadEngine();
  if (!m) return null;
  try {
    return await predict(m.run, action, args, {
      wallet: { coins: state.wallet, ink: state.ink },
      state: econState,
      inventory: state.inventory,
      custom: state.customPacks,
      entries: state.collection?.entries ?? {}
    }, facts);
  } catch (error) {
    if (error?.cannotPredict || error?.code === 'CONFLICT' || !error?.code) return null;
    throw error;
  }
}

export async function econ(action, args = {}, { quiet = false, timeout = null, facts = null, after = null, gather = false } = {}) {
  if (DIRECT.has(action)) {
    if (!quiet) busy(1);
    try {
      const data = await ask(action, args, timeout ?? SLOW_TIMEOUT_MS);
      live = true;
      return data;
    } finally {
      if (!quiet) busy(-1);
    }
  }
  const local = await guess(action, args, facts).catch((error) => {
    if (error && typeof error === 'object' && !error.action) error.action = action;
    throw error;
  });
  if (local) {
    applyAndWatch(local);
    send(action, args, { timeout: timeout ?? ECON_TIMEOUT_MS, predicted: true, after, gather }).catch(() => {});
    return local;
  }
  if (!quiet) busy(1);
  try {
    const data = await send(action, args, { timeout: timeout ?? SLOW_TIMEOUT_MS, after });
    if (inFlight > 0 && deferred.includes(data)) {
      deferred = deferred.filter((d) => d !== data);
      applyAndWatch(data, true);
    }
    return data;
  } finally {
    if (!quiet) busy(-1);
  }
}

const WARM_IDLE_MS = 4 * 60 * 1000;
const WARM_LOOK_MS = 60 * 1000;
let warmTimer = null;
let inputWatched = false;

export function warmEconomy() {
  clearInterval(warmTimer);
  warmTimer = null;
  if (!live || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  if (!inputWatched) {
    inputWatched = true;
    for (const kind of ['pointerdown', 'keydown']) addEventListener(kind, () => { lastInput = Date.now(); }, { passive: true, capture: true });
  }
  lastAsk = Math.max(lastAsk, Date.now() - WARM_IDLE_MS + WARM_LOOK_MS);
  warmTimer = setInterval(() => {
    const now = Date.now();
    if (now - lastAsk < WARM_IDLE_MS || now - lastInput > WARM_IDLE_MS) return;
    lastAsk = now;
    askHouse('economy', { action: 'ping' }, 8000).catch(() => {});
  }, WARM_LOOK_MS);
}

export async function startEconomy(userId) {
  if (!userId) { live = false; return false; }
  loadEngine();
  econUser = userId;
  held = keptBase(userId);
  const kept = keptState(userId);
  if (kept && seenLive(userId)) { econState = kept; live = true; }
  try {
    const held = readSince(userId);
    sinceAt = held?.at ?? null;
    dirty = Boolean(held?.dirty);
    const since = held && !held.dirty && Object.keys(state.collection?.entries ?? {}).length ? held.at : null;
    let readyAsk = null;
    try { readyAsk = readyHook?.launch?.() ?? null; } catch { readyAsk = null; }
    const sentAt = Date.now();
    const launch = { grants: true, collect: true, stipend: true, quests: true, ...(readyAsk ? { ready: readyAsk } : {}) };
    const res = await econ('import', { since, sync: true, launch }, { quiet: true });
    markLive(userId);
    if (res?.launch && typeof res.launch === 'object' && econUser === userId) {
      lastLaunch = { at: Date.now(), user: userId, steps: { ...res.launch } };
      if (readyAsk) { try { readyHook?.done(res.launch.ready ?? null, sentAt, { launch: true }); } catch {} }
      for (const fn of launchWatchers) { try { fn(res.launch); } catch {} }
    } else if (readyAsk) {
      try { readyHook?.done(null, sentAt, { launch: true }); } catch {}
    }
    if (!res?.synced) await econ('sync', {}, { quiet: true }).catch(() => {});
    warmEconomy();
    return true;
  } catch (error) {
    const code = String(error?.message ?? '');
    live = code !== 'NOT_LIVE' && code !== 'SIGN_IN' && seenLive(userId);
    return live;
  }
}

export async function refreshEconomy() {
  if (!live || !econUser) return null;
  const since = !dirty && sinceAt != null && Object.keys(state.collection?.entries ?? {}).length ? sinceAt : null;
  return econ('snapshot', { since }, { quiet: true });
}

export function stopEconomy() {
  live = false;
  lastLaunch = null;
  serverHeld = null;
  econUser = null;
  econState = {};
  held = null;
  try { localStorage.removeItem(BASE_KEY); } catch {}
  sinceAt = null;
  dirty = false;
  warmEconomy();
  for (const fn of stopWatchers) { try { fn(); } catch {} }
}

const MESSAGES = {
  INSUFFICIENT_FUNDS: 'cantAfford',
  SOLD_OUT: 'shopSoldOut',
  ALREADY_CLAIMED: 'econAlready',
  DAILY_CAP: 'econDailyCap',
  CLOSED: 'econOffline',
  TIMEOUT: 'econSlow',
  SIGN_IN: 'gameSignIn',
  UNAUTHORISED: 'gameSignIn',
  SLOW_DOWN: 'slowDown',
  HOST_BLOCKED: 'hostBlocked',
  BAD_PACK: 'hostRefused',
  MATURE_LOCKED: 'matureLocked',
  CONTENT_REFUSED: 'contentRefused',
  NAME_REFUSED: 'econNameRefused',
  DRAW_FAILED: 'econDrawFailed',
  WIKI_DOWN: 'econWikiDown',
  UPSTREAM: 'econWikiDown',
  TOO_MANY: 'econTooMany',
  SERVER_DOWN: 'econServerDown',
  FAILED: 'econServerDown',
  NO_FINDER: 'econServerDown',
  NOT_LIVE: 'econServerBusy',
  BAD_QUERY: 'econShortQuery',
  NOT_OWNED: 'econNotOwned',
  NOT_HELD: 'econNotHeld',
  NONE_HELD: 'econNoneHeld',
  NO_PULL: 'econNotHeld',
  NOT_DONE: 'questNotDone',
  NOT_EARNED: 'econNotEarned',
  NOT_CLAIMABLE: 'econNotClaimable',
  NOT_FOUND: 'econGone',
  NOT_ACTIVE: 'econEnded',
  UNKNOWN_CODE: 'econBadCode',
  LOCKED: 'specialLocked',
  CANNOT_FUSE: 'econCannotFuse',
  OWNED: 'econOwned',
  NOT_IN_GUILD: 'econNoGuild',
  NO_QUIZ: 'econQuizFailed',
  QUIZ_FAILED: 'econQuizFailed',
  SHAPE: 'econQuizFailed',
  OTHER_ACCOUNT: 'econOtherAccount',
  NOT_IN_SHOP: 'econNotInShop',
  BAD_SIZE: 'econBadSize',
  BAD_COUNT: 'econBadSize'
};

const ACTION_MESSAGES = {
  customSave: { TOO_MANY: ['econTooManyCustom', { max: MAX_CUSTOM_PACKS }] },
  wikiFind: { TOO_MANY: ['slowDown', {}] }
};

const DIAGNOSE = new Set(['FAILED', 'SERVER_DOWN', 'NO_FINDER', 'NOT_LIVE', 'WIKI_DOWN', 'DRAW_FAILED']);
const reported = new Set();
const REPORT_MAX = 12;

function reportEcon(action, code) {
  const tag = `${action ?? '?'}: ${code || 'EMPTY'}`;
  if (reported.has(tag) || reported.size >= REPORT_MAX) return;
  reported.add(tag);
  try { captureError('econ', `econ ${tag}`, ''); } catch {}
}

export function econMessage(error, t) {
  const code = String(error?.message ?? '');
  const hit = ACTION_MESSAGES[error?.action]?.[code] ?? MESSAGES[code] ?? null;
  if (!hit || DIAGNOSE.has(code) || /^BAD_|^UNKNOWN/.test(code)) reportEcon(error?.action, code);
  const [key, vars] = Array.isArray(hit) ? hit : [hit ?? (/^BAD_|^UNKNOWN/.test(code) ? 'econRefused' : 'econFailed'), {}];
  return t(key, vars);
}
