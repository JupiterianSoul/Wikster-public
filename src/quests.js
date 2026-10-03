import { supabase } from './account.js';
import { askHouse } from './house.js';
import { QUESTS, QUEST_TIERS, QUESTS_PER_DAY, questById, creditFor } from './data/quests.js';
import { DAY_MS, dayStart, utcDay } from './days.js';

const STATE_KEY = 'wikster.quests.v1';
const CLAIMED_KEY = 'wikster.questClaims.v1';
const BOARDS_KEY = 'wikster.questBoards.v1';
const SYNC_DEBOUNCE_MS = 60000;
const LEDGER_CAP = 4000;

export { utcDay };
const endOfDay = (day) => dayStart(day) + DAY_MS;

function seeded(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let a = h;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

export function dealFor(userKey, day) {
  const rng = seeded(`quests:${day}:${userKey}`);
  const tiers = Object.entries(QUEST_TIERS).map(([id, t]) => [id, t.weight]);
  const total = tiers.reduce((s, [, w]) => s + w, 0);
  const picked = [];
  for (let n = 0; n < QUESTS_PER_DAY && picked.length < QUESTS.length; n++) {
    let ticket = rng() * total;
    let tier = tiers[0][0];
    for (const [id, w] of tiers) { ticket -= w; if (ticket <= 0) { tier = id; break; } }
    const pool = QUESTS.filter((q) => q.tier === tier && !picked.includes(q));
    const from = pool.length ? pool : QUESTS.filter((q) => !picked.includes(q));
    picked.push(from[Math.floor(rng() * from.length)]);
  }
  return picked;
}

function replay(events, quest) {
  let progress = 0;
  for (const event of events ?? []) {
    progress += creditFor(quest, event.m, event.d ?? {});
    if (progress >= quest.target) return quest.target;
  }
  return progress;
}

const rowFor = (quest, events, claimed = false) => ({
  id: quest.id, target: quest.target, progress: replay(events, quest), claimed
});

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.quests)) return null;
    if (!Array.isArray(raw.events)) raw.events = [];
    return raw;
  } catch {
    return null;
  }
}
function write(board) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(board)); } catch {}
}

let claimedSource = () => null;
export const useClaimedSource = (fn) => { claimedSource = typeof fn === 'function' ? fn : () => null; };

function readClaimed() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAIMED_KEY) ?? 'null');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function noteClaimed(userKey, day, ids) {
  const all = readClaimed();
  const held = all[userKey]?.day === day ? all[userKey].ids ?? [] : [];
  const next = [...new Set([...held, ...ids])];
  if (next.length === held.length) return;
  for (const [key, row] of Object.entries(all)) if (row?.day !== day) delete all[key];
  all[userKey] = { day, ids: next };
  try { localStorage.setItem(CLAIMED_KEY, JSON.stringify(all)); } catch {}
}

function forgetClaimed(userKey, day, id) {
  const all = readClaimed();
  if (all[userKey]?.day !== day) return;
  all[userKey] = { day, ids: (all[userKey].ids ?? []).filter((x) => x !== id) };
  try { localStorage.setItem(CLAIMED_KEY, JSON.stringify(all)); } catch {}
}

function serverClaims(userKey) {
  try {
    const held = claimedSource(userKey);
    return held?.known ? held : null;
  } catch {
    return null;
  }
}

function settleClaimed(board, userKey) {
  let moved = false;
  const server = serverClaims(userKey);
  if (server) {
    const ids = new Set(server.day === board.day && Array.isArray(server.ids) ? server.ids.map(String) : []);
    for (const row of board.quests) {
      const claimed = ids.has(row.id) || Boolean(row.serverClaimed);
      if (Boolean(row.claimed) !== claimed) { row.claimed = claimed; moved = true; }
    }
    return moved;
  }
  const mine = readClaimed()[userKey];
  const ids = new Set(mine?.day === board.day ? (mine.ids ?? []).map(String) : []);
  for (const row of board.quests) {
    if (!row.claimed && ids.has(row.id)) { row.claimed = true; moved = true; }
  }
  const claimed = board.quests.filter((row) => row.claimed).map((row) => row.id);
  if (claimed.length) noteClaimed(userKey, board.day, claimed);
  return moved;
}

function readBoards() {
  try {
    const raw = JSON.parse(localStorage.getItem(BOARDS_KEY) ?? 'null');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function setAside(board) {
  if (!board?.userKey || !Array.isArray(board.quests)) return;
  const all = readBoards();
  for (const [key, row] of Object.entries(all)) if (row?.day !== board.day) delete all[key];
  all[board.userKey] = board;
  try { localStorage.setItem(BOARDS_KEY, JSON.stringify(all)); } catch {}
}

export function loadBoard(userKey = 'local') {
  const day = utcDay();
  const held = read();
  if (held && held.day === day && held.userKey === userKey) {
    if (settleClaimed(held, userKey)) write(held);
    return held;
  }
  if (held && held.day === day) setAside(held);
  const kept = readBoards()[userKey];
  if (kept && kept.day === day && Array.isArray(kept.quests)) {
    if (!Array.isArray(kept.events)) kept.events = [];
    settleClaimed(kept, userKey);
    write(kept);
    return kept;
  }
  const events = held && held.day === day ? held.events : [];
  const board = {
    day, userKey, expiresAt: endOfDay(day), syncedAt: null, dirty: events.length > 0,
    events,
    quests: dealFor(userKey, day).map((q) => rowFor(q, events))
  };
  settleClaimed(board, userKey);
  write(board);
  return board;
}

export const describe = (board) => board.quests
  .map((row) => ({ ...row, quest: questById(row.id) }))
  .filter((row) => row.quest);

let syncTimer = null;
let onChange = () => {};
export const onQuestsChange = (fn) => { onChange = fn; };

export function track(metric, detail = {}, userKey = 'local') {
  const board = loadBoard(userKey);
  const done = [];
  let moved = false;
  board.events.push({ m: metric, d: compact(detail) });
  if (board.events.length > LEDGER_CAP) board.events.splice(0, board.events.length - LEDGER_CAP);
  for (const row of board.quests) {
    const quest = questById(row.id);
    if (!quest || row.claimed || row.progress >= row.target) continue;
    const credit = creditFor(quest, metric, detail);
    if (credit <= 0) continue;
    row.progress = Math.min(row.target, row.progress + credit);
    moved = true;
    if (row.progress >= row.target) done.push(row.id);
  }
  if (moved) board.dirty = true;
  write(board);
  if (board.dirty) scheduleSync(userKey);
  onChange(board);
  return done;
}

function compact(detail) {
  const out = {};
  for (const [key, value] of Object.entries(detail ?? {})) {
    if (value == null) continue;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 20).map((v) => (typeof v === 'object' && v ? compact(v) : v));
    else if (typeof value === 'object') out[key] = compact(value);
  }
  return out;
}

let syncFor = null;

function scheduleSync(userKey) {
  syncFor = userKey;
  if (syncTimer) return;
  syncTimer = setTimeout(flushQuests, SYNC_DEBOUNCE_MS);
}

export function flushQuests() {
  clearTimeout(syncTimer);
  syncTimer = null;
  const userKey = syncFor;
  syncFor = null;
  if (userKey && loadBoard(userKey).dirty) syncBoard(userKey).catch(() => {});
}

async function ask(body) {
  const data = await askHouse('quests', body);
  if (!data || !Array.isArray(data.quests)) throw new Error('TAMPER');
  return data;
}

function adopt(board, answer, userKey) {
  const events = board.day === answer.day ? board.events : [];
  const fresh = {
    day: answer.day, userKey, expiresAt: Date.parse(answer.expiresAt) || endOfDay(answer.day),
    syncedAt: Date.now(), dirty: false, events,
    quests: answer.quests.map((row) => {
      const mine = board.day === answer.day ? board.quests.find((q) => q.id === row.quest_id) : null;
      const quest = questById(row.quest_id);
      const replayed = quest ? replay(events, { ...quest, target: row.target }) : 0;
      return {
        id: row.quest_id, target: row.target,
        progress: Math.min(row.target, Math.max(Number(row.progress) || 0, mine?.progress ?? 0, replayed)),
        claimed: Boolean(row.claimed) || Boolean(mine?.claimed),
        serverClaimed: Boolean(row.claimed) || Boolean(mine?.serverClaimed)
      };
    })
  };
  fresh.dirty = fresh.quests.some((q, i) => q.progress > (Number(answer.quests[i].progress) || 0));
  settleClaimed(fresh, userKey);
  write(fresh);
  return fresh;
}

const BOARD_FRESH_MS = 120000;

export function takeBoard(userKey, answer) {
  if (!userKey || userKey === 'local' || !answer || !Array.isArray(answer.quests)) return null;
  const board = loadBoard(userKey);
  if (board.day !== answer.day) return null;
  const fresh = adopt(board, answer, userKey);
  onChange(fresh);
  if (fresh.dirty) scheduleSync(userKey);
  return fresh;
}

export function boardFresh(userKey) {
  const board = loadBoard(userKey);
  return !board.dirty && Number.isFinite(board.syncedAt) && Date.now() - board.syncedAt < BOARD_FRESH_MS;
}

export async function syncBoard(userKey = 'local') {
  const board = loadBoard(userKey);
  if (userKey === 'local' || !supabase) return board;
  const updates = {};
  if (board.dirty) for (const q of board.quests) updates[q.id] = q.progress;
  const answer = await ask(board.dirty ? { action: 'progress', updates } : { action: 'today' });
  const fresh = adopt(board, answer, userKey);
  onChange(fresh);
  if (fresh.dirty) scheduleSync(userKey);
  return fresh;
}

export async function claim(questId, userKey = 'local') {
  const board = loadBoard(userKey);
  const row = board.quests.find((q) => q.id === questId);
  const quest = questById(questId);
  if (!row || !quest) throw new Error('NOT_DONE');
  if (row.claimed) throw new Error('CLAIMED');
  if (row.progress < row.target) throw new Error('NOT_DONE');

  row.claimed = true;
  write(board);
  onChange(loadBoard(userKey));

  if (userKey !== 'local' && supabase) {
    try {
      const updates = {};
      for (const q of board.quests) updates[q.id] = q.progress;
      await ask({ action: 'progress', updates });
      const answer = await ask({ action: 'claim', questId });
      adopt(board, answer, userKey);
    } catch (error) {
      forgetClaimed(userKey, board.day, questId);
      const back = loadBoard(userKey);
      const mine = back.quests.find((q) => q.id === questId);
      if (mine) { mine.claimed = false; write(back); }
      onChange(loadBoard(userKey));
      throw error;
    }
  }
  onChange(loadBoard(userKey));
  return quest.reward;
}

function progressSync(board) {
  const updates = {};
  for (const q of board.quests) updates[q.id] = q.progress;
  const synced = ask({ action: 'progress', updates });
  synced.catch(() => {});
  return synced;
}

export const wasClaimed = (error) => ['ALREADY_CLAIMED', 'CLAIMED'].includes(String(error?.message ?? ''));

function markClaimed(userKey, ids, { known = false } = {}) {
  const after = loadBoard(userKey);
  for (const row of after.quests) {
    if (!ids.includes(row.id)) continue;
    row.claimed = true;
    if (known) row.serverClaimed = true;
  }
  noteClaimed(userKey, after.day, ids);
  write(after);
  onChange(loadBoard(userKey));
}

export async function claimWith(questId, userKey, pay) {
  const board = loadBoard(userKey);
  const row = board.quests.find((q) => q.id === questId);
  const quest = questById(questId);
  if (!row || !quest) throw new Error('NOT_DONE');
  if (row.claimed) throw new Error('CLAIMED');
  if (row.progress < row.target) throw new Error('NOT_DONE');
  const synced = progressSync(board);
  let paid;
  try {
    paid = await pay(questId, { after: synced, facts: { quest: { progress: row.progress, target: row.target, claimed: false } } });
  } catch (error) {
    if (wasClaimed(error)) markClaimed(userKey, [questId], { known: true });
    throw error;
  }
  markClaimed(userKey, [questId]);
  return { reward: quest.reward, paid };
}

export const claimableRows = (userKey = 'local') =>
  describe(loadBoard(userKey)).filter((row) => !row.claimed && row.progress >= row.target);

export function startClaimAll(userKey) {
  const rows = claimableRows(userKey);
  const after = rows.length ? progressSync(loadBoard(userKey)) : null;
  return rows.map((row) => ({ row, after, facts: { quest: { progress: row.progress, target: row.target, claimed: false } } }));
}

export function settleClaims(userKey, ids, { known = false } = {}) {
  if (ids.length) markClaimed(userKey, ids, { known });
}

export const claimableCount = (userKey = 'local') => claimableRows(userKey).length;

export const msToReset = (board) => Math.max(0, board.expiresAt - Date.now());
