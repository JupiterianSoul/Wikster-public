import { regional, supabase } from './account.js';
import { retryAfterMs } from './backoff.js';

export const HOUSE_TIMEOUT_MS = 12000;

const failed = (code, status, extra = {}) => Object.assign(new Error(code), { status: Number(status) || 0, ...extra });

export async function houseFailure(error, data = null) {
  const status = error?.context?.status ?? error?.status;
  if (status === 401) return failed('SIGN_IN', status);
  if (status === 404) return failed('CLOSED', status);
  let after = null;
  try { after = retryAfterMs(error?.context?.headers?.get?.('retry-after')); } catch {}
  let code = data?.error;
  if (!code && error?.context && typeof error.context.clone === 'function') {
    try { code = (await error.context.clone().json())?.error; } catch {}
  }
  const network = error?.name === 'FunctionsFetchError';
  if (typeof code === 'string' && code) return failed(code, status, { retryAfter: after, network });
  if (status === 429) return failed('SLOW_DOWN', status, { retryAfter: after, network });
  if (status >= 500 || error?.name === 'FunctionsRelayError') return failed('SERVER_DOWN', status, { retryAfter: after, network });
  return failed('CLOSED', status, { retryAfter: after, network });
}

export async function askHouse(name, body, timeoutMs = HOUSE_TIMEOUT_MS) {
  if (!supabase) throw new Error('CLOSED');
  let timer;
  const stop = typeof AbortController === 'function' ? new AbortController() : null;
  const clock = new Promise((_, reject) => { timer = setTimeout(() => { reject(new Error('TIMEOUT')); stop?.abort(); }, timeoutMs); });
  try {
    const { data, error } = await Promise.race([supabase.functions.invoke(regional(name), { body, ...(stop ? { signal: stop.signal } : {}) }), clock]);
    if (error) throw await houseFailure(error, data);
    if (data?.error) throw new Error(String(data.error));
    return data;
  } finally {
    clearTimeout(timer);
  }
}
