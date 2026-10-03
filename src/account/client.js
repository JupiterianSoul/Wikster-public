import { createClient } from '@supabase/supabase-js';

export const URL = import.meta.env.VITE_SUPABASE_URL ?? '';

export const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const configured = Boolean(URL && ANON_KEY);

export const FUNCTION_REGION = 'eu-west-1';

export const regional = (name) => `${name}?forceFunctionRegion=${FUNCTION_REGION}`;

export const KEEPALIVE_MAX = 60000;
let leavingUntil = 0;
let keptBytes = 0;

export function leaving(on = true) {
  leavingUntil = on ? Date.now() + 15000 : 0;
}

export const isLeaving = () => Date.now() < leavingUntil;

const bodySize = (body) => {
  if (typeof body === 'string') return typeof TextEncoder === 'function' ? new TextEncoder().encode(body).length : body.length * 3;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (typeof Blob === 'function' && body instanceof Blob) return body.size;
  return null;
};

export function keptFetch(input, init = {}) {
  if (!isLeaving() || init.keepalive || init.body == null) return fetch(input, init);
  const size = bodySize(init.body);
  if (size == null || keptBytes + size > KEEPALIVE_MAX) return fetch(input, init);
  keptBytes += size;
  return fetch(input, { ...init, keepalive: true }).finally(() => { keptBytes -= size; });
}

export const supabase = configured
  ? createClient(URL, ANON_KEY, {
      global: { fetch: (input, init) => keptFetch(input, init) },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'wikster.auth'
      }
    })
  : null;

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
