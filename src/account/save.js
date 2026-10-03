import { BUILD, isNewerBuild } from '../version.js';
import { applySave, envelope, exportSave, importSave, loadStamps, mergeSaves, parseSave } from '../save.js';
import { MAX_VALUE, SYNC_KEYS, digest, shapeValue, takeRow } from '../savekeys.js';
import { regional, supabase } from './client.js';
import { live } from './live.js';
import { isSchemaGap } from './schema.js';

export let frozen = false;

export let remoteBuild = null;

export function remoteBuildStamp() {
  return (remoteBuild);
}

export function saveFromNewerBuild() {
  return (isNewerBuild(remoteBuild));
}

export function saveFromOlderBuild() {
  return (Boolean(remoteBuild === null || (remoteBuild && !isNewerBuild(remoteBuild) && remoteBuild.sha !== BUILD.sha)));
}

const OWNER_KEY = 'wikster.syncedUser';
const owner = () => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } };
const setOwner = (id) => { try { if (id) localStorage.setItem(OWNER_KEY, id); else localStorage.removeItem(OWNER_KEY); } catch {} };
let seenAt = null;
let pushedText = null;
let serverOwned = () => [];
let serverFields = () => [];

export function leaveToServer(fn, fields = null) {
  serverOwned = typeof fn === 'function' ? fn : () => [];
  serverFields = typeof fields === 'function' ? fields : () => [];
}

const ACK_KEY = 'wikster.syncAck.v1';
const PULL_GAP = 300000;
let keyedAt = 0;

export const lastKeySync = () => keyedAt;

function readAck(userId) {
  try {
    const held = JSON.parse(localStorage.getItem(ACK_KEY) ?? 'null');
    if (held?.user === userId && held.acked && typeof held.acked === 'object') {
      return { user: userId, since: held.since ?? null, acked: held.acked, stamps: held.stamps && typeof held.stamps === 'object' ? held.stamps : {} };
    }
  } catch {}
  return { user: userId, since: null, acked: {}, stamps: {} };
}

function writeAck(ack) {
  try { localStorage.setItem(ACK_KEY, JSON.stringify(ack)); } catch {}
}

export function keysWanted(userId) {
  return Boolean(userId) && live.syncKeys !== false && serverOwned(userId).length > 0;
}

function localKeys() {
  const stamps = loadStamps();
  const out = {};
  for (const key of SYNC_KEYS) {
    let value = null;
    try { value = localStorage.getItem(key); } catch {}
    if (value !== null) out[key] = { value, stamp: Number(stamps[key]) || 0 };
  }
  return out;
}

async function callSyncMe(patch, since, stats) {
  const { data, error } = await supabase.rpc('sync_me', { p_patch: patch, p_since: since, p_stats: stats, p_build: BUILD });
  if (error) {
    if (isSchemaGap(error) || String(error.code ?? '') === 'PGRST202') { live.syncKeys = false; return null; }
    throw error;
  }
  live.syncKeys = true;
  return data && typeof data === 'object' ? data : null;
}

function takeRows(rows, ack, { fresh = false } = {}) {
  const drop = serverFields(ack.user);
  const mine = fresh ? {} : localKeys();
  const data = {};
  const stamps = {};
  const took = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!SYNC_KEYS.includes(row?.key) || typeof row.value !== 'string') continue;
    const here = mine[row.key];
    const shaped = here ? shapeValue(row.key, here.value, drop) : null;
    if (here && shaped === row.value) {
      ack.acked[row.key] = digest(row.value);
      ack.stamps[row.key] = Number(row.stamp) || 0;
      continue;
    }
    const clean = !here || digest(shaped) === ack.acked[row.key];
    const taken = takeRow(row, { local: here?.value ?? null, localStamp: here?.stamp ?? 0, clean, keep: drop, drop });
    if (!taken) continue;
    if (taken.write || taken.ahead) {
      data[row.key] = taken.value;
      stamps[row.key] = taken.stamp;
    }
    if (taken.write) took.push(row.key);
    ack.acked[row.key] = taken.ack;
    ack.stamps[row.key] = Number(row.stamp) || 0;
  }
  return { data, stamps, took };
}

export async function syncMe(userId, { stats = null, force = false, always = false } = {}) {
  if (frozen) return { status: 'frozen', took: [] };
  if (!userId || live.syncKeys === false) return null;
  if (saveFromNewerBuild()) return { status: 'outdated', took: [] };
  const ack = readAck(userId);
  const drop = serverFields(userId);
  const patch = {};
  const sent = {};
  for (const [key, { value, stamp }] of Object.entries(localKeys())) {
    const shaped = shapeValue(key, value, drop);
    if (shaped == null || shaped.length > MAX_VALUE) continue;
    const said = digest(shaped);
    if (!force && said === ack.acked[key]) {
      if (ack.stamps[key] != null) patch[key] = { have: ack.stamps[key] };
      continue;
    }
    patch[key] = { value: shaped, stamp };
    sent[key] = { said, stamp };
  }
  const sending = Object.keys(sent).length > 0;
  if (!sending && !stats && !always && Date.now() - keyedAt < PULL_GAP) return { status: 'same', took: [] };
  const data = await callSyncMe(patch, ack.since, stats);
  if (!data?.live) return null;
  keyedAt = Date.now();
  if (data.outdated) {
    remoteBuild = data.build ?? null;
    return { status: 'outdated', took: [] };
  }
  remoteBuild = sending ? BUILD : (data.build ?? null);
  const refused = new Set(Array.isArray(data.refused) ? data.refused : []);
  for (const [key, { said, stamp }] of Object.entries(sent)) {
    if (refused.has(key)) continue;
    ack.acked[key] = said;
    ack.stamps[key] = stamp;
  }
  const { data: values, stamps, took } = takeRows(data.rows, ack);
  if (Object.keys(values).length) applySave(values, stamps, Object.keys(values));
  if (data.now) ack.since = data.now;
  writeAck(ack);
  setOwner(userId);
  return { status: took.length ? 'merged' : (sending || force || always ? 'pushed' : 'same'), took };
}

async function loginByKeys(userId) {
  if (live.syncKeys === false) return null;
  if (owner() === userId && parseSave(exportSave())) {
    const done = await syncMe(userId, { always: true });
    if (!done) return null;
    return done.status === 'outdated' ? 'same' : done.status;
  }
  const data = await callSyncMe({}, null, null);
  if (!data?.live) return null;
  keyedAt = Date.now();
  remoteBuild = data.build ?? null;
  const ack = { user: userId, since: data.now ?? null, acked: {}, stamps: {} };
  const { data: values, stamps } = takeRows(data.rows, ack, { fresh: true });
  if (!Object.keys(values).length) {
    setOwner(userId);
    writeAck(ack);
    const done = await syncMe(userId, { force: true });
    return done ? 'pushed' : null;
  }
  if (!importSave(JSON.stringify(envelope(values, stamps)))) return 'kept';
  writeAck(ack);
  setOwner(userId);
  return 'pulled';
}

function without(save, userId) {
  const keys = save ? serverOwned(userId) : [];
  if (!keys.length) return save;
  const data = { ...save.data };
  const stamps = { ...save.stamps };
  for (const key of keys) { delete data[key]; delete stamps[key]; }
  return { ...save, data, stamps };
}

async function remoteStamp(userId) {
  const { data, error } = await supabase
    .from('saves').select('updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.updated_at ?? null;
}

export async function pushSave(userId, { force = false } = {}) {
  if (frozen) return 'frozen';
  if (keysWanted(userId)) {
    const done = await syncMe(userId, { force, always: true });
    if (done) return done.status === 'same' ? 'pushed' : done.status;
  }
  if (saveFromNewerBuild()) return 'outdated';
  const local = without(parseSave(exportSave()), userId);
  const text = local ? JSON.stringify([local.data, local.stamps]) : null;
  let blob = local ? envelope(local.data, local.stamps) : JSON.parse(exportSave());
  let tookRemote = false;
  if (!force && local) {
    const stamp = await remoteStamp(userId);
    if (text === pushedText && stamp && stamp === seenAt && owner() === userId) return 'same';
    const remote = stamp && stamp !== seenAt ? await fetchSave(userId) : null;
    if (remote?.updated_at && remote.updated_at !== seenAt) {
      const theirs = without(parseSave(JSON.stringify(remote.data)), userId);
      if (theirs) {
        const merged = mergeSaves(local, theirs);
        if (merged.fromRemote.length) tookRemote = applySave(merged.data, merged.stamps, merged.fromRemote);
        blob = envelope(merged.data, merged.stamps);
      }
    }
  }
  const { data, error } = await supabase.from('saves')
    .upsert({ user_id: userId, data: blob }, { onConflict: 'user_id' })
    .select('updated_at').maybeSingle();
  if (error) throw error;
  seenAt = data?.updated_at ?? null;
  pushedText = blob?.data ? JSON.stringify([blob.data, blob.stamps]) : null;
  remoteBuild = BUILD;
  setOwner(userId);
  return tookRemote ? 'merged' : 'pushed';
}

export function holdSync(on) {
  frozen = Boolean(on);
}

export async function wipeTaken(userId, claim) {
  const { data, error } = await supabase.from('claims').select('key').eq('user_id', userId).eq('key', claim).limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

export async function myData() {
  const { data, error } = await supabase.rpc('my_data');
  if (error) throw error;
  return data;
}

export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke(regional('delete-account'), { body: {} });
  if (error) {
    let detail = '';
    try {
      const body = await error.context?.json?.();
      detail = body?.error ? String(body.error) : '';
    } catch {}
    if (!detail) {
      try { detail = (await error.context?.text?.())?.slice(0, 200) ?? ''; } catch {}
    }
    throw new Error(detail || error.message || 'DELETE_FAILED');
  }
  if (data?.error) throw new Error(data.error);
  return true;
}

export function ownsLocalSave(userId) {
  return Boolean(userId) && owner() === userId && Boolean(parseSave(exportSave()));
}

export async function fetchSave(userId) {
  const { data, error } = await supabase
    .from('saves').select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listBackups(userId) {
  const { data, error } = await supabase.from('saves_history')
    .select('id, at, reason, cards, coins')
    .eq('user_id', userId).order('at', { ascending: false }).limit(40);
  if (error) {
    if (isSchemaGap(error)) throw new Error('BACKUPS_UNSET');
    throw error;
  }
  return data ?? [];
}

export async function restoreBackup(userId, id) {
  const { data: row, error } = await supabase.from('saves_history')
    .select('data').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw error;
  const text = JSON.stringify(row?.data ?? null);
  if (!parseSave(text)) throw new Error('BACKUP_UNREADABLE');
  await supabase.from('saves_history')
    .insert({ user_id: userId, reason: 'before-restore', data: JSON.parse(exportSave()) });
  if (!importSave(text, { stampNow: true })) throw new Error('BACKUP_UNREADABLE');
  setOwner(userId);
  await pushSave(userId, { force: true });
  return true;
}

export async function syncOnLogin(userId) {
  const keyed = await loginByKeys(userId);
  if (keyed) return keyed;
  const remote = await fetchSave(userId);
  remoteBuild = remote?.data?.build ?? null;
  seenAt = remote?.updated_at ?? null;
  const theirs = remote?.data ? parseSave(JSON.stringify(remote.data)) : null;
  if (!theirs) {
    await pushSave(userId, { force: true });
    return 'pushed';
  }
  const local = parseSave(exportSave());
  if (!local || owner() !== userId) {
    const ok = importSave(JSON.stringify(remote.data));
    if (ok) setOwner(userId);
    return ok ? 'pulled' : 'kept';
  }
  const merged = mergeSaves(without(local, userId), without(theirs, userId));
  if (merged.fromRemote.length) applySave(merged.data, merged.stamps, merged.fromRemote);
  if (merged.fromLocal.length) await pushSave(userId);
  return merged.fromRemote.length ? 'merged' : (merged.fromLocal.length ? 'pushed' : 'same');
}
