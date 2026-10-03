export const SAVE_KEYS = [
  'wikster.collection.v3',
  'wikster.wallet.v1',
  'wikster.ink.v1',
  'wikster.inventory.v1',
  'wikster.profile.v1',
  'wikster.customPacks.v2',
  'wikster.language',
  'wikster.ripDirection',
  'wikster.theme'
];

import { BUILD } from './version.js';

const FORMAT = 'wikster-save';
const LEGACY_FORMATS = ['wiklodo-save', 'packywiki-save'];
const LEGACY_PREFIX = 'packywiki.';
const PREFIX = 'wikster.';
const VERSION = 2;
const STAMPS_KEY = 'wikster.stamps.v1';

export function loadStamps() {
  try {
    const raw = JSON.parse(localStorage.getItem(STAMPS_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}
function writeStamps(stamps) {
  try { localStorage.setItem(STAMPS_KEY, JSON.stringify(stamps)); } catch {}
}

export function migrateLegacyStorage() {
  try {
    const moves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) moves.push(key);
    }
    for (const key of moves) {
      const fresh = PREFIX + key.slice(LEGACY_PREFIX.length);
      if (localStorage.getItem(fresh) === null) localStorage.setItem(fresh, localStorage.getItem(key));
      localStorage.removeItem(key);
    }
    return moves.length;
  } catch {
    return 0;
  }
}
migrateLegacyStorage();

const listeners = new Set();
let hushed = 0;

export function onSaveChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function quietly(fn) {
  hushed++;
  try { return fn(); } finally { hushed--; }
}

let writes = 0;
export const saveWrites = () => writes;

export function touch(key = null) {
  writes++;
  if (key && !SAVE_KEYS.includes(key)) return;
  if (key) {
    const stamps = loadStamps();
    stamps[key] = Date.now();
    writeStamps(stamps);
  }
  if (hushed) return;
  for (const fn of listeners) {
    try { fn(key); } catch {}
  }
}

export function exportSave() {
  const data = {};
  for (const key of SAVE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    } catch {}
  }
  const stamps = {};
  const known = loadStamps();
  for (const key of Object.keys(data)) stamps[key] = known[key] ?? 0;
  return JSON.stringify(envelope(data, stamps), null, 1);
}

export function envelope(data, stamps) {
  return { format: FORMAT, version: VERSION, at: Date.now(), build: BUILD, data, stamps };
}

export function describeSave(text) {
  const parsed = parseSave(text);
  if (!parsed) return null;
  const read = (key, fallback) => {
    try { return JSON.parse(parsed.data[key] ?? 'null') ?? fallback; } catch { return fallback; }
  };
  const collection = read('wikster.collection.v3', { entries: {} });
  const profile = read('wikster.profile.v1', {});
  const entries = Object.values(collection.entries ?? {});
  return {
    cards: entries.reduce((sum, e) => sum + (e.count ?? 1), 0),
    unique: entries.length,
    wallet: read('wikster.wallet.v1', 0),
    level: profile?.progress?.level ?? 1,
    boosters: profile?.boostersOpened ?? 0,
    at: parsed.at ?? null
  };
}

export function parseSave(text) {
  let parsed;
  try { parsed = JSON.parse(String(text).trim()); } catch { return null; }
  if (!parsed || (parsed.format !== FORMAT && !LEGACY_FORMATS.includes(parsed.format))) return null;
  if (!parsed.data || typeof parsed.data !== 'object') return null;
  const data = {};
  for (const key of SAVE_KEYS) {
    const legacy = LEGACY_PREFIX + key.slice(PREFIX.length);
    const value = parsed.data[key] ?? parsed.data[legacy];
    if (typeof value === 'string') data[key] = value;
  }
  if (!Object.keys(data).length) return null;
  const given = parsed.stamps && typeof parsed.stamps === 'object' ? parsed.stamps : {};
  const stamps = {};
  for (const key of Object.keys(data)) {
    const legacy = LEGACY_PREFIX + key.slice(PREFIX.length);
    const at = Number(given[key] ?? given[legacy]);
    stamps[key] = Number.isFinite(at) && at > 0 ? at : (Number(parsed.at) || 0);
  }
  return { ...parsed, version: Number(parsed.version) || 1, data, stamps };
}

export function mergeSaves(local, remote) {
  const data = {};
  const stamps = {};
  const fromLocal = [];
  const fromRemote = [];
  for (const key of SAVE_KEYS) {
    const l = local?.data?.[key];
    const r = remote?.data?.[key];
    if (l === undefined && r === undefined) continue;
    const ls = l === undefined ? -1 : (local.stamps?.[key] ?? 0);
    const rs = r === undefined ? -1 : (remote.stamps?.[key] ?? 0);
    const takeRemote = rs >= ls;
    data[key] = takeRemote ? r : l;
    stamps[key] = Math.max(ls, rs, 0);
    if (l !== r) (takeRemote ? fromRemote : fromLocal).push(key);
  }
  return { data, stamps, fromLocal, fromRemote };
}

export function applySave(data, stamps, keys) {
  const known = loadStamps();
  for (const key of keys) {
    if (data[key] === undefined) continue;
    try { localStorage.setItem(key, data[key]); } catch { return false; }
    known[key] = stamps[key] ?? 0;
  }
  writeStamps(known);
  return true;
}

export function importSave(text, { stampNow = false } = {}) {
  const parsed = parseSave(text);
  if (!parsed) return false;
  try {
    for (const key of SAVE_KEYS) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(parsed.data)) localStorage.setItem(key, value);
    const stamps = {};
    for (const key of Object.keys(parsed.data)) stamps[key] = stampNow ? Date.now() : (parsed.stamps[key] ?? 0);
    writeStamps(stamps);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function readText() {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch {}
  return null;
}
