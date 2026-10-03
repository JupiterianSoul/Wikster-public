export const RETRY_BASE_MS = 1000;
export const RETRY_CAP_MS = 30000;
export const RETRY_AFTER_MAX_MS = 120000;

export const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function retryAfterMs(value, now = Date.now()) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.min(RETRY_AFTER_MAX_MS, Math.round(Number(text) * 1000));
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.min(RETRY_AFTER_MAX_MS, Math.max(0, at - now)) : null;
}

export function retryDelay(attempt, { base = RETRY_BASE_MS, cap = RETRY_CAP_MS, after = null, random = Math.random } = {}) {
  const top = Math.min(cap, base * 2 ** Math.max(0, Math.floor(Number(attempt) || 0)));
  const wait = top / 2 + random() * (top / 2);
  const floor = Number.isFinite(after) && after > 0 ? Math.min(after, RETRY_AFTER_MAX_MS) : 0;
  return Math.round(Math.max(wait, floor));
}

export function failureKind(error) {
  const code = String(error?.message ?? '');
  const status = Number(error?.status) || 0;
  if (code === 'NOT_LIVE') return null;
  if (code === 'SLOW_DOWN' || status === 429 || status === 503) return 'unsent';
  if (!status && offline() && ['TIMEOUT', 'CLOSED', 'FAILED'].includes(code)) return 'unsent';
  if (code === 'TIMEOUT' || (code === 'CLOSED' && !status) || status >= 500 || error?.network) return 'unknown';
  return null;
}

export function pause(ms, { floor = 0 } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return new Promise((resolve) => setTimeout(resolve, ms));
  return new Promise((resolve) => {
    const started = Date.now();
    let timer = null;
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      resolve();
    };
    const arm = (wait) => { clearTimeout(timer); timer = setTimeout(tick, Math.max(0, wait)); };
    function tick() {
      if (offline()) return;
      done();
    }
    function wake() {
      if (offline() || document.visibilityState === 'hidden') return;
      const left = floor - (Date.now() - started);
      if (left > 0) arm(left);
      else done();
    }
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    arm(ms);
  });
}
