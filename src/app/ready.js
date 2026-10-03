import * as store from '../collection.js';
import { pullEntry } from '../econ/cards.js';
import { RESERVE_TOTAL, addPrints, batchNonce, batchPity, mergedNonce, openNoted, pityAfter, printsOf, reservePlan } from '../econ/rules.js';
import { rarityRank } from '../data/rarities.js';
import { specId } from '../booster.js';
import { state } from './core.js';
import {
  applyServer, askServer, econ, econStateNow, economyIdle, economyUser, onEconomyStop, onInventoryChange,
  onServerInventory, refreshEconomy, serverEconomy, useReadyHook, useServerOverlay
} from './econ.js';
import { keepPictures } from './pictures.js';
import { withSpecialPhoto } from '../codedefs.js';
import { isFriendSpec } from '../friendcodes.js';
import { accrue, emptyTimed, timedLevel, timedSpec } from '../timed.js';
import { onLive, userFeedUp } from '../account/feeds.js';
import { retryDelay } from '../backoff.js';

const withPhotos = (cards) => { for (const card of cards) withSpecialPhoto(card?.article); return cards; };

const READY_KEY = 'wikster.ready.v1';
const JOURNAL_KEY = 'wikster.opening.v1';
export const READY_KEEP = RESERVE_TOTAL + 8;
export const READY_TIMEOUT_MS = 30000;
export const OPEN_TIMEOUT_MS = 25000;
const RETRY_CAP_MS = 30000;
const retryIn = (tries, error = null) => retryDelay(Math.max(0, tries - 1), { cap: RETRY_CAP_MS, after: Number(error?.retryAfter) || 0 });
const FILL_WAIT_MS = 40000;
const POLL_MS = [2500, 4000, 6000, 8000, 10000, 12000];
const SHORT_MS = [3000, 8000, 15000, 30000, 60000];
const SHORT_ROUNDS = 12;
const STALE_MS = 60000;
const QUIET = new Set([
  'ready', 'prepare', 'prepareMany', 'ping', 'import', 'snapshot', 'sync', 'sell', 'sellMany', 'favorite', 'favoriteMany',
  'repair', 'wikiFind', 'customSave', 'customDelete', 'safeReady', 'atelier', 'exchange', 'wipe'
]);
const DEFINITIVE = new Set(['NO_PULL', 'NOT_HELD', 'UNKNOWN_ACTION', 'BAD_REQUEST', 'LOCKED']);

const serverReady = new Map();
const pullCache = new Map();
let journal = [];
let owner = null;
let focusId = null;
const readyWatchers = new Set();
const settledWatchers = new Set();
const refusedWatchers = new Set();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (key) => { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

export const onReadyChange = (fn) => { readyWatchers.add(fn); return () => readyWatchers.delete(fn); };
export const onOpenSettled = (fn) => settledWatchers.add(fn);
export const onOpenRefused = (fn) => refusedWatchers.add(fn);
const tell = (set, ...args) => { for (const fn of set) { try { fn(...args); } catch {} } };

function restore() {
  const user = economyUser();
  if (!user || owner === user) return;
  owner = user;
  serverReady.clear();
  pullCache.clear();
  const held = read(JOURNAL_KEY);
  journal = held?.user === user && Array.isArray(held.entries) ? held.entries.filter((e) => e?.nonce && e.id && Array.isArray(e.cards)) : [];
  for (const e of journal) delete e.hold;
  const ready = read(READY_KEY);
  const list = ready?.user === user && Array.isArray(ready.pulls) ? ready.pulls : [];
  const spent = spentSet();
  for (const p of list.slice(-READY_KEEP)) {
    if (!p?.nonce || !p.id || !Array.isArray(p.cards) || spent.has(p.nonce)) continue;
    pullCache.set(p.nonce, { id: p.id, cards: p.cards, at: p.at ?? 0 });
    serverReady.set(p.id, [...(serverReady.get(p.id) ?? []), p.nonce]);
  }
}

function keepJournal() {
  if (owner) write(JOURNAL_KEY, { user: owner, entries: journal });
}

function keepReady() {
  if (!owner) return;
  const pulls = [];
  for (const [id, nonces] of serverReady) for (const n of nonces) {
    const p = pullCache.get(n);
    if (p) pulls.push({ nonce: n, id, cards: p.cards, at: p.at });
  }
  write(READY_KEY, { user: owner, pulls: pulls.sort((a, b) => a.at - b.at).slice(-READY_KEEP) });
}

let keepTimer = null;

function keepReadySoon() {
  clearTimeout(keepTimer);
  keepTimer = setTimeout(keepReady, 400);
}

function spentSet() {
  const out = new Set();
  for (const e of journal) {
    out.add(e.nonce);
    for (const n of e.parts ?? []) out.add(n);
  }
  for (const p of pullCache.values()) for (const n of p.parts ?? []) out.add(n);
  return out;
}

export const spentList = () => [...spentSet()].slice(-80);

export function pendingOpens(stateNow = econStateNow()) {
  restore();
  const opens = stateNow?.opens;
  return journal.filter((e) => !openNoted(opens, e.nonce));
}

export function predictedDry() {
  const now = econStateNow();
  let dry = Number(now?.pity) || 0;
  for (const e of pendingOpens(now)) dry = e.sizes ? batchPity(e.cards, e.spec, dry, e.sizes).dry : pityAfter(dry, e.spec, e.cards);
  return dry;
}

export function addCopy(entries, card, packId, at) {
  const key = card.article.key;
  const had = entries[key];
  if (!had) {
    entries[key] = { ...pullEntry(card, packId, at), prints: { [card.rarityId]: 1 } };
    return { entry: entries[key], isNew: true };
  }
  const better = rarityRank(card.rarityId) > rarityRank(had.rarityId);
  const prints = addPrints(printsOf(had), { [card.rarityId]: 1 });
  entries[key] = { ...had, ...(better ? { rarityId: card.rarityId, price: card.price } : {}), count: (had.count ?? 1) + 1, prints, lastPulledAt: at };
  return { entry: entries[key], isNew: false };
}

useServerOverlay({
  inventory(inventory, stateNow) {
    for (const e of pendingOpens(stateNow)) {
      const slot = inventory[e.id];
      if (!slot) continue;
      slot.count -= Math.max(1, Number(e.batch) || 1);
      if (slot.count <= 0) delete inventory[e.id];
    }
  },
  cards(entries, keys, stateNow, skip = null) {
    const wanted = keys ? new Set(keys) : null;
    const now = Date.now();
    for (const e of pendingOpens(stateNow)) {
      e.cards.forEach((card, i) => {
        const key = card.article.key;
        if ((!wanted || wanted.has(key)) && !skip?.has(key)) addCopy(entries, card, e.id, now + i);
      });
    }
  },
  pending: () => openingPending()
});

export function peekPull(id) {
  restore();
  const spent = spentSet();
  const nonce = (serverReady.get(id) ?? []).find((n) => !spent.has(n) && pullCache.has(n));
  return nonce ? { nonce, cards: pullCache.get(nonce).cards } : null;
}

export function readyCount(id) {
  restore();
  const spent = spentSet();
  return (serverReady.get(id) ?? []).filter((n) => !spent.has(n) && pullCache.has(n)).length;
}

function dropPull(nonce) {
  pullCache.delete(nonce);
  for (const [id, list] of serverReady) {
    const next = list.filter((n) => n !== nonce);
    if (next.length) serverReady.set(id, next);
    else serverReady.delete(id);
  }
}

export function dropReadyWhere(test) {
  restore();
  const doomed = [...pullCache].filter(([nonce, p]) => test(nonce, Array.isArray(p?.cards) ? p.cards : [])).map(([nonce]) => nonce);
  for (const nonce of doomed) dropPull(nonce);
  if (doomed.length) { keepReady(); tell(readyWatchers); }
  return doomed;
}

export function takeParts(baseId, take) {
  restore();
  const spent = spentSet();
  const parts = (serverReady.get(baseId) ?? []).filter((n) => !spent.has(n) && pullCache.has(n)).slice(0, take);
  if (parts.length < take) return null;
  return { nonce: mergedNonce(parts), parts, cards: parts.flatMap((n) => pullCache.get(n).cards) };
}

export function holdMerged(id, merged) {
  if (!merged?.nonce || !Array.isArray(merged.cards)) return;
  restore();
  pullCache.set(merged.nonce, { id, cards: merged.cards, at: Date.now(), parts: merged.parts });
  serverReady.set(id, [merged.nonce, ...(serverReady.get(id) ?? []).filter((n) => n !== merged.nonce)]);
  keepReady();
  tell(readyWatchers);
}

export function readyList(id, take) {
  restore();
  const spent = spentSet();
  return (serverReady.get(id) ?? []).filter((n) => !spent.has(n) && pullCache.has(n) && !pullCache.get(n).parts)
    .slice(0, Math.max(0, take)).map((n) => ({ nonce: n, cards: pullCache.get(n).cards }));
}

export function takeBatch(id, take) {
  restore();
  const spent = spentSet();
  const parts = (serverReady.get(id) ?? []).filter((n) => !spent.has(n) && pullCache.has(n) && !pullCache.get(n).parts).slice(0, take);
  if (parts.length < take || take < 2) return null;
  const lists = parts.map((n) => pullCache.get(n).cards);
  return { nonce: batchNonce(parts), parts, cards: lists.flat(), sizes: lists.map((c) => c.length), batch: parts.length };
}

export function holdPrepared(id, pulls) {
  restore();
  const spent = spentSet();
  const fresh = (Array.isArray(pulls) ? pulls : []).filter((p) => p?.nonce && Array.isArray(p.cards) && !spent.has(p.nonce));
  if (!fresh.length) return 0;
  const now = Date.now();
  for (const p of fresh) if (!pullCache.has(p.nonce)) pullCache.set(p.nonce, { id, cards: p.cards, at: now });
  const known = serverReady.get(id) ?? [];
  serverReady.set(id, [...known, ...fresh.map((p) => p.nonce).filter((n) => !known.includes(n))]);
  keepReady();
  keepPictures(fresh.flatMap((p) => p.cards.map((c) => c.article?.thumbnail)));
  tell(readyWatchers);
  return fresh.length;
}

export function prepareMany(spec, count) {
  const id = specId(spec);
  return econ('prepareMany', { specId: id, count, skip: spentList() }, { quiet: true, timeout: READY_TIMEOUT_MS + 15000 })
    .then((got) => { holdPrepared(id, got?.pulls); return got; });
}

export const HOLD_MS = 90000;

export function startOpen(spec, pull, cards, { hold = false } = {}) {
  restore();
  const id = specId(spec);
  const held = pullCache.get(pull.nonce);
  const parts = pull.batch ? pull.parts : held?.parts;
  const entry = {
    nonce: pull.nonce, id, spec, cards, at: Date.now(), tries: 0,
    ...(parts ? { parts } : {}),
    ...(pull.batch ? { batch: pull.batch, sizes: pull.sizes } : {}),
    ...(hold ? { hold: Date.now() + HOLD_MS } : {})
  };
  journal = [...journal.filter((e) => e.nonce !== entry.nonce), entry];
  keepJournal();
  for (const n of [pull.nonce, ...(entry.parts ?? [])]) dropPull(n);
  keepReadySoon();
  if (piggyback !== true) scheduleReady(0);
  confirmSoon();
  return entry;
}

export function growOpen(oldNonce, pull, cards, { hold = true } = {}) {
  restore();
  const at = journal.findIndex((e) => e.nonce === oldNonce);
  if (at < 0) return null;
  const was = journal[at];
  const entry = {
    nonce: pull.nonce, id: was.id, spec: was.spec, cards, at: was.at, tries: 0,
    ...(pull.batch ? { parts: pull.parts, batch: pull.batch, sizes: pull.sizes } : {}),
    ...(hold ? { hold: Date.now() + HOLD_MS } : {})
  };
  journal = journal.map((e, i) => (i === at ? entry : e));
  keepJournal();
  for (const n of [pull.nonce, ...(entry.parts ?? [])]) dropPull(n);
  keepReadySoon();
  confirmSoon();
  return entry;
}

export function releaseOpen(nonce) {
  restore();
  const entry = journal.find((e) => e.nonce === nonce);
  if (!entry?.hold) return;
  delete entry.hold;
  keepJournal();
  confirmSoon(0);
  scheduleReady(300);
}

function finish(nonce) {
  journal = journal.filter((e) => e.nonce !== nonce);
  keepJournal();
}

let confirming = false;
let confirmTimer = null;

let confirmAt = 0;

export function confirmSoon(delay = 0) {
  clearTimeout(confirmTimer);
  confirmAt = Date.now() + delay;
  confirmTimer = setTimeout(confirmLoop, delay);
}

export const openingPending = () => { restore(); return journal.length > 0; };

async function confirmLoop() {
  if (confirming) return;
  confirming = true;
  try {
    for (;;) {
      restore();
      const entry = journal[0];
      if (!entry || !serverEconomy() || economyUser() !== owner) return;
      if (entry.hold && entry.hold > Date.now()) { confirmSoon(Math.min(entry.hold - Date.now() + 50, 5000)); return; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (entry.parts) await Promise.race([economyIdle(), wait(15000)]);
      let res = null;
      let code = null;
      let failure = null;
      try {
        res = await askServer('open', { nonce: entry.nonce, ...(entry.parts ? { parts: entry.parts } : {}), ...(entry.batch ? { batch: true } : {}) }, OPEN_TIMEOUT_MS + (entry.batch ? 15000 : 0));
      } catch (error) {
        failure = error;
        code = String(error?.message ?? 'FAILED');
      }
      if (journal[0]?.nonce !== entry.nonce) continue;
      if (res) {
        finish(entry.nonce);
        applyServer(res);
        tell(settledWatchers, entry, res);
        continue;
      }
      if (DEFINITIVE.has(code) && !(code === 'NO_PULL' && entry.parts && (entry.tries ?? 0) < 3)) {
        finish(entry.nonce);
        await refreshEconomy().catch(() => null);
        tell(refusedWatchers, entry, code);
        scheduleReady(0);
        continue;
      }
      entry.tries = (entry.tries ?? 0) + 1;
      keepJournal();
      confirmSoon(retryIn(entry.tries, failure));
      return;
    }
  } finally {
    confirming = false;
  }
}

let readyTimer = null;
let readyRunning = false;
let readyAgain = false;
let readyFails = 0;
let shortRounds = 0;
let asking = 0;
let launching = false;
let piggyback = null;
let fillUntil = 0;
let lastWant = {};
let readyAt = 0;
let hiddenAt = 0;

export function setReadyFocus(id) {
  focusId = id ?? null;
}

const currentAsk = () => ({ have: [...pullCache.keys()].slice(-60), skip: spentList(), focus: focusId });

function readyIn(id, spent) {
  return (serverReady.get(id) ?? []).filter((n) => !spent.has(n) && pullCache.has(n)).length;
}

export function reserveWanted() {
  restore();
  const spent = spentSet();
  const slots = [];
  const own = new Set();
  for (const [id, slot] of Object.entries(state.inventory ?? {})) {
    if (!slot?.spec || !(slot.count > 0)) continue;
    if (slot.spec.kind === 'timed' && (Number(slot.spec.timedSlots) || 1) > 1) continue;
    if (isFriendSpec(slot.spec)) continue;
    own.add(id);
    slots.push({ id, left: slot.count });
  }
  const held = econStateNow()?.timed;
  const timed = held ? accrue({ ...emptyTimed(), ...held }, Date.now()) : null;
  if ((timed?.count ?? 0) > 0) {
    const id = specId(timedSpec(timedLevel(timed.opened ?? 0)));
    const at = slots.findIndex((s) => s.id === id);
    if (at >= 0) slots.splice(at, 1);
    own.add(id);
    slots.push({ id, left: (Number(state.inventory?.[id]?.count) || 0) + timed.count });
  }
  for (const [id, n] of Object.entries(lastWant)) {
    if (own.has(id) || id.startsWith('timed|')) continue;
    slots.push({ id, left: Number(n) || 0 });
  }
  const plan = reservePlan(slots, { focus: focusId });
  return { plan, spent };
}

const EMPTY_ASK_MS = 400;

export function readyEmpty() {
  const { plan, spent } = reserveWanted();
  for (const [id, want] of plan) if (want > 0 && readyIn(id, spent) === 0) return true;
  return false;
}

export function readyShort() {
  const { plan, spent } = reserveWanted();
  for (const [id, want] of plan) if (readyIn(id, spent) < want) return true;
  return false;
}

export function scheduleReady(delay = 0, { always = false } = {}) {
  if (!serverEconomy()) return;
  clearTimeout(readyTimer);
  readyTimer = setTimeout(() => considerReady({ always }), delay);
}

function planNext() {
  clearTimeout(readyTimer);
  readyTimer = null;
  if (!serverEconomy() || !readyShort()) { shortRounds = 0; return; }
  if (shortRounds >= SHORT_ROUNDS) return;
  const waiting = fillUntil > Date.now();
  const empty = !waiting && shortRounds === 0 && readyEmpty();
  const delay = waiting
    ? (userFeedUp() ? fillUntil - Date.now() : POLL_MS[Math.min(shortRounds, POLL_MS.length - 1)])
    : empty ? EMPTY_ASK_MS : SHORT_MS[Math.min(shortRounds, SHORT_MS.length - 1)];
  readyTimer = setTimeout(() => considerReady({ waited: true }), Math.max(200, delay));
}

function considerReady({ always = false, waited = false } = {}) {
  if (!serverEconomy()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { warmAll(); return; }
  restore();
  if (asking > 0 || launching) return;
  if (journal.some((e) => e.hold && e.hold > Date.now())) return;
  if (!always) {
    if (!readyShort()) { shortRounds = 0; warmAll(); return; }
    if (!waited && fillUntil > Date.now() && userFeedUp()) { planNext(); return; }
    if (shortRounds >= SHORT_ROUNDS) return;
  }
  shortRounds++;
  refreshReady();
}

function warmAll() {
  const held = new Set(Object.keys(state.inventory ?? {}));
  if (focusId) held.add(focusId);
  const first = [];
  const urls = [];
  for (const [id, list] of serverReady) {
    if (!held.has(id) && !id.startsWith('timed|')) continue;
    list.forEach((n, i) => {
      for (const c of pullCache.get(n)?.cards ?? []) (id === focusId || i === 0 ? first : urls).push(c.article?.thumbnail);
    });
  }
  keepPictures(first, { soon: true });
  keepPictures(urls);
}

function takeReady(got, sentAt = 0) {
  if (!got || typeof got !== 'object' || economyUser() !== owner) return;
  restore();
  const spent = spentSet();
  const now = Date.now();
  for (const [nonce, cards] of Object.entries(got.pulls ?? {})) {
    if (Array.isArray(cards) && !pullCache.has(nonce)) pullCache.set(nonce, { id: null, cards: withPhotos(cards), at: now });
  }
  const merged = [...pullCache].filter(([, p]) => p.parts);
  const before = new Map([...serverReady].map(([id, list]) => [id, [...list]]));
  serverReady.clear();
  const listed = new Set();
  for (const [id, nonces] of Object.entries(got.ready ?? {})) {
    const usable = (Array.isArray(nonces) ? nonces : []).filter((n) => !spent.has(n) && pullCache.has(n));
    for (const n of usable) { listed.add(n); pullCache.get(n).id = id; }
    if (usable.length) serverReady.set(id, usable);
  }
  for (const [n, p] of merged) {
    if (!state.inventory?.[p.id] || journal.some((e) => e.nonce === n)) continue;
    listed.add(n);
    serverReady.set(p.id, [n, ...(serverReady.get(p.id) ?? [])]);
  }
  for (const [id, list] of before) {
    for (const n of list) {
      const p = pullCache.get(n);
      if (listed.has(n) || !p || p.parts || spent.has(n) || !(p.at > sentAt)) continue;
      listed.add(n);
      serverReady.set(id, [...(serverReady.get(id) ?? []), n]);
    }
  }
  for (const n of [...pullCache.keys()]) if (!listed.has(n)) pullCache.delete(n);
  if (got.want && typeof got.want === 'object') lastWant = { ...got.want };
  readyAt = now;
  fillUntil = got.filling ? now + FILL_WAIT_MS : 0;
  keepReady();
  readyFails = 0;
  warmAll();
  tell(readyWatchers);
  planNext();
}

function takeEvent(payload) {
  restore();
  if (!owner || economyUser() !== owner) return;
  const spent = spentSet();
  let added = 0;
  let hinted = Boolean(payload?.more);
  for (const p of Array.isArray(payload?.pulls) ? payload.pulls : []) {
    if (!p?.nonce || !p.id || spent.has(p.nonce) || pullCache.has(p.nonce)) continue;
    if (!Array.isArray(p.cards) || !p.cards.length) { hinted = true; continue; }
    pullCache.set(p.nonce, { id: p.id, cards: withPhotos(p.cards), at: Date.now() });
    serverReady.set(p.id, [...(serverReady.get(p.id) ?? []), p.nonce]);
    added++;
  }
  if (!added && !hinted && !(Number(payload?.failed) > 0) && fillUntil > Date.now()) { planNext(); return; }
  fillUntil = payload?.filling ? Date.now() + FILL_WAIT_MS : 0;
  if (added) {
    shortRounds = 0;
    keepReady();
    warmAll();
    tell(readyWatchers);
  }
  if (hinted) { scheduleReady(0, { always: true }); return; }
  planNext();
}

async function refreshReady() {
  if (!serverEconomy()) return;
  if (readyRunning) { readyAgain = true; return; }
  readyRunning = true;
  restore();
  try {
    await Promise.race([economyIdle(), wait(8000)]);
    const sentAt = Date.now();
    const got = await econ('ready', currentAsk(), { quiet: true, timeout: READY_TIMEOUT_MS });
    if (economyUser() !== owner) return;
    takeReady(got, sentAt);
  } catch (error) {
    readyFails++;
    clearTimeout(readyTimer);
    readyTimer = setTimeout(() => considerReady({ always: true }), retryIn(readyFails, error));
  } finally {
    readyRunning = false;
    if (readyAgain) { readyAgain = false; scheduleReady(200); }
  }
}

const quiet = (name) => QUIET.has(name) || /^(market|auction)/.test(name);

useReadyHook({
  ask(action, args) {
    if (!serverEconomy() || quiet(action)) return null;
    if (action === 'batch' && !(Array.isArray(args?.items) ? args.items : []).some((item) => !quiet(String(item?.action ?? '')))) return null;
    restore();
    if (!owner) return null;
    asking++;
    return currentAsk();
  },
  launch() {
    restore();
    if (!owner) return null;
    launching = true;
    return currentAsk();
  },
  done(got, sentAt, { launch = false } = {}) {
    if (launch) launching = false;
    else asking = Math.max(0, asking - 1);
    if (got) {
      piggyback = true;
      takeReady(got, sentAt);
      return;
    }
    if (launch && piggyback == null) piggyback = false;
    scheduleReady(300);
  }
});

onLive('ready', ({ payload }) => takeEvent(payload));

export function clearReady() {
  clearTimeout(readyTimer);
  clearTimeout(confirmTimer);
  serverReady.clear();
  pullCache.clear();
  journal = [];
  owner = null;
  readyFails = 0;
  shortRounds = 0;
  asking = 0;
  launching = false;
  piggyback = null;
  fillUntil = 0;
  lastWant = {};
  readyAt = 0;
}

export function forgetReady() {
  clearReady();
  try { localStorage.removeItem(READY_KEY); localStorage.removeItem(JOURNAL_KEY); } catch {}
  tell(readyWatchers);
}

export function bootReady() {
  restore();
  warmAll();
  tell(readyWatchers);
  if (journal.length) confirmSoon(0);
  scheduleReady(0, { always: !readyAt });
}

onInventoryChange(() => scheduleReady(300));
onServerInventory(() => {
  if (piggyback === true) setTimeout(() => { if (!asking && !readyRunning) planNext(); }, 0);
  else scheduleReady(0);
});
onEconomyStop(clearReady);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { confirmSoon(0); scheduleReady(0, { always: true }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); if (journal.length && Date.now() >= confirmAt - 1000) confirmSoon(0); return; }
    confirmSoon(0);
    scheduleReady(0, { always: Boolean(hiddenAt) && Date.now() - hiddenAt > STALE_MS });
  });
}

export function prepareNow(spec) {
  return econ('prepare', { specId: specId(spec), skip: spentList() }, { quiet: true, timeout: READY_TIMEOUT_MS })
    .then((got) => {
      if (got?.nonce && Array.isArray(got.cards) && !spentSet().has(got.nonce)) {
        const id = specId(spec);
        pullCache.set(got.nonce, { id, cards: withPhotos(got.cards), at: Date.now() });
        serverReady.set(id, [...(serverReady.get(id) ?? []).filter((n) => n !== got.nonce), got.nonce]);
        keepReady();
        keepPictures(got.cards.map((c) => c.article?.thumbnail));
        tell(readyWatchers);
      }
      return got;
    });
}

export const readyStore = { serverReady, pullCache };
