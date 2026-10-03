import { supabase } from '../account.js';
import { BUILD, isApk } from '../version.js';

const KEY = 'wikster.errorQueue';
const MAX_QUEUE = 20;
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
  /AbortError|The user aborted a request|signal is aborted/i,
  /Failed to fetch|NetworkError|Load failed|network connection was lost/i,
  /chrome-extension:|moz-extension:|safari-extension:/i
];

let queue = [];
let signedIn = false;
let timer = null;
const screenOf = () => (typeof document === 'undefined' ? '' : document.querySelector('.screen.is-active')?.id?.replace('screen-', '') ?? '');

const platform = () => {
  if (typeof window === 'undefined') return 'web';
  if (window.__TAURI_INTERNALS__ || window.__TAURI__) return 'steam';
  if (isApk()) return 'apk';
  return document.documentElement.classList.contains('is-pc') ? 'pc' : 'web';
};

function load() {
  try { queue = JSON.parse(localStorage.getItem(KEY) ?? '[]') ?? []; } catch { queue = []; }
  if (!Array.isArray(queue)) queue = [];
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(queue.slice(-MAX_QUEUE))); } catch {}
}

function firstFrame(stack) {
  const line = String(stack ?? '').split('\n').map((l) => l.trim()).find((l) => /\.js|\.java/.test(l)) ?? '';
  return line.replace(/https?:\/\/[^/]+\//, '').replace(/\?[^:)]*/, '').replace(/-[A-Za-z0-9_]{8}\.js/, '.js').slice(0, 120);
}

export function captureError(kind, message, stack = '') {
  const text = String(message ?? '').slice(0, 500);
  if (!text || NOISE.some((re) => re.test(text) || re.test(String(stack)))) return;
  const fingerprint = `${text.slice(0, 120)}@${firstFrame(stack)}`.slice(0, 200);
  const same = queue.find((q) => q.fingerprint === fingerprint);
  if (same) { same.count = (same.count ?? 1) + 1; save(); return; }
  queue.push({
    kind, message: text, stack: String(stack ?? '').slice(0, 6000), fingerprint,
    build: String(BUILD.sha ?? 'dev').slice(0, 60), platform: platform(), screen: String(screenOf() ?? '').slice(0, 40), count: 1
  });
  if (queue.length > MAX_QUEUE) queue.shift();
  save();
  soon();
}

function soon() {
  if (timer || !signedIn) return;
  timer = setTimeout(() => { timer = null; flush(); }, 20000);
}

export async function flush() {
  if (!signedIn || !supabase || !queue.length) return;
  const batch = queue.slice(0, 10);
  try {
    const { error } = await supabase.rpc('report_errors', { p_items: batch });
    if (error) return;
    queue = queue.slice(batch.length);
    save();
    if (queue.length) soon();
  } catch {}
}

export function errorsSignedIn(on) {
  signedIn = Boolean(on);
  if (signedIn) flush();
}

const STALE_BUILD = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Failed to fetch dynamically/i;
const STALE_KEY = 'wikster.staleReload';

export function reloadForStaleBuild() {
  try {
    const last = Number(sessionStorage.getItem(STALE_KEY) || 0);
    if (Date.now() - last < 60000) return false;
    sessionStorage.setItem(STALE_KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

let staleHandler = null;

export const onStaleBuild = (fn) => { staleHandler = fn; };

function staleBuild() {
  if (!staleHandler) return reloadForStaleBuild();
  staleHandler();
  return true;
}

export function watchErrors() {
  if (typeof window === 'undefined' || window.__wiksterErrors) return;
  window.__wiksterErrors = true;
  load();
  addEventListener('vite:preloadError', (event) => { if (staleBuild()) event.preventDefault(); });
  addEventListener('error', (event) => {
    if (event.target && event.target !== window) return;
    captureError('error', event.message || event.error?.message, event.error?.stack ?? `${event.filename}:${event.lineno}:${event.colno}`);
  });
  addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (STALE_BUILD.test(String(reason?.message ?? reason ?? '')) && staleBuild()) return;
    captureError('rejection', reason?.message ?? String(reason ?? ''), reason?.stack ?? '');
  });
  try {
    const native = window.WiksterCrash?.take?.();
    if (native) captureError('native', String(native).split('\n').slice(0, 2).join(' ').slice(0, 500), String(native));
  } catch {}
}

watchErrors();
