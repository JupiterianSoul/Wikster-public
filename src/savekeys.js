export const PROFILE_KEY = 'wikster.profile.v1';
export const SYNC_KEYS = [PROFILE_KEY, 'wikster.language', 'wikster.ripDirection', 'wikster.theme'];
export const PLAY_STEP = 900000;
export const MAX_VALUE = 200 * 1024;

const parse = (text) => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

export const floorPlay = (ms) => Math.floor(Math.max(0, Number(ms) || 0) / PLAY_STEP) * PLAY_STEP;

export function shapeValue(key, text, drop = []) {
  if (typeof text !== 'string') return null;
  if (key !== PROFILE_KEY) return text;
  const profile = parse(text);
  if (!profile) return text;
  for (const field of drop) delete profile[field];
  if ('playMs' in profile) profile.playMs = floorPlay(profile.playMs);
  return JSON.stringify(profile);
}

export function graftValue(key, incoming, local, keep = []) {
  if (key !== PROFILE_KEY || typeof local !== 'string') return incoming;
  const theirs = parse(incoming);
  const mine = parse(local);
  if (!theirs || !mine) return incoming;
  for (const field of keep) if (mine[field] !== undefined) theirs[field] = mine[field];
  if ('playMs' in mine || 'playMs' in theirs) theirs.playMs = Math.max(Number(theirs.playMs) || 0, Number(mine.playMs) || 0);
  return JSON.stringify(theirs);
}

export function digest(text) {
  const s = String(text ?? '');
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${s.length.toString(36)}.${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

export function dirtyKeys(shaped, acked = {}) {
  return Object.keys(shaped ?? {}).filter((key) => typeof shaped[key] === 'string' && digest(shaped[key]) !== acked?.[key]);
}

export function takeRow(row, { local, localStamp = 0, clean, keep = [], drop = [], now = Date.now() }) {
  const merged = local == null ? row.value : graftValue(row.key, row.value, local, keep);
  const serverWins = local == null || clean || Number(row.stamp) >= Number(localStamp);
  if (!serverWins) return null;
  const ack = digest(row.value);
  const ahead = digest(shapeValue(row.key, merged, drop)) !== ack;
  return {
    value: merged,
    write: merged !== local,
    ahead,
    stamp: ahead ? Math.max(now, Number(row.stamp) + 1) : Number(row.stamp) || 0,
    ack
  };
}
