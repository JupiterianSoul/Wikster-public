export const DELTA_PARTS = ['state', 'inventory'];

const sortKeys = (_key, value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = {};
  for (const k of Object.keys(value).sort()) out[k] = value[k];
  return out;
};

export const canon = (value) => JSON.stringify(value === undefined ? null : value, sortKeys);

export function digest(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}${text.length.toString(36)}`;
}

const isDoc = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export const partVersion = (value) => (isDoc(value) ? digest(canon(value)) : '');

export function readVersion(sv) {
  const parts = typeof sv === 'string' ? sv.split('.') : [];
  return Object.fromEntries(DELTA_PARTS.map((p, i) => [p, parts[i] ?? '']));
}

export const writeVersion = (held) => DELTA_PARTS.map((p) => held[p] ?? '').join('.');

export function diffDoc(base, next) {
  const set = {};
  const gone = [];
  for (const [k, v] of Object.entries(next)) if (v !== undefined && (base[k] === undefined || canon(v) !== canon(base[k]))) set[k] = v;
  for (const [k, v] of Object.entries(base)) if (v !== undefined && next[k] === undefined) gone.push(k);
  return { set, gone };
}

export function patchDoc(base, delta) {
  const out = { ...base };
  for (const k of Array.isArray(delta?.gone) ? delta.gone : []) delete out[k];
  for (const [k, v] of Object.entries(isDoc(delta?.set) ? delta.set : {})) out[k] = v;
  return out;
}

export function firstLoad(store) {
  let first = null;
  const wrapped = {
    ...store,
    async load(...args) {
      const got = await store.load(...args);
      if (!first && got) first = JSON.parse(JSON.stringify({ state: got.state ?? {}, inventory: got.inventory ?? {} }));
      return got;
    }
  };
  return { store: wrapped, first: () => first };
}

export function deltaReply(reply, base, sv) {
  if (typeof sv !== 'string' || !reply || typeof reply !== 'object' || Array.isArray(reply)) return reply;
  if (!DELTA_PARTS.some((p) => isDoc(reply[p]))) return reply;
  const asked = readVersion(sv);
  const out = { ...reply };
  const now = {};
  const delta = {};
  for (const part of DELTA_PARTS) {
    if (!isDoc(reply[part])) { now[part] = asked[part]; continue; }
    now[part] = partVersion(reply[part]);
    const from = base?.[part];
    if (!asked[part] || !isDoc(from) || partVersion(from) !== asked[part]) continue;
    delta[part] = diffDoc(from, reply[part]);
    delete out[part];
  }
  out.sv = writeVersion(now);
  if (Object.keys(delta).length) out.delta = delta;
  return out;
}

export function mendReply(reply, held) {
  if (!reply || typeof reply !== 'object' || typeof reply.sv !== 'string') return { reply, held: null, ok: true };
  const now = readVersion(reply.sv);
  const out = { ...reply };
  delete out.sv;
  delete out.delta;
  const next = {};
  let ok = true;
  for (const part of DELTA_PARTS) {
    const delta = reply.delta?.[part];
    if (delta) {
      const from = held?.[part];
      if (!isDoc(from)) { ok = false; continue; }
      const mended = patchDoc(from, delta);
      if (partVersion(mended) !== now[part]) { ok = false; continue; }
      next[part] = mended;
      out[part] = JSON.parse(JSON.stringify(mended));
    } else if (isDoc(reply[part])) {
      next[part] = JSON.parse(JSON.stringify(reply[part]));
    } else if (isDoc(held?.[part]) && readVersion(held.sv)[part] === now[part]) {
      next[part] = held[part];
    }
  }
  if (!ok) return { reply: out, held: null, ok: false };
  const complete = DELTA_PARTS.every((p) => isDoc(next[p]));
  return { reply: out, held: complete ? { ...next, sv: reply.sv } : null, ok: true };
}
