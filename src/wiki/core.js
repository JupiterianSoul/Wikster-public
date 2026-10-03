import { wikiLang } from '../i18n.js';
import { drawCustomMany, drawCustomSet } from './custom.js';
import { drawWikipediaMany, drawWikipediaSet } from './draw.js';
import { drawTitleSet } from './translate.js';
import { fetchTopRead } from './fetch.js';
import { TODAY_POOL, todayRarityForRank } from '../economy.js';
import { cardAllowed } from './safety.js';
import { drawFromPool } from './pool.js';

export const REQUEST_TIMEOUT_MS = 7000;

export const DRAW_BUDGET_MS = 26000;

export const FILL_ROUNDS = 8;

export const MAX_SEARCH_OFFSET = 5000;

export const SEARCH_PAGE_SIZE = 50;

export function REST() {
  return (`https://${wikiLang()}.wikipedia.org/api/rest_v1`);
}

export function ACTION() {
  return (`https://${wikiLang()}.wikipedia.org/w/api.php`);
}

export const PAGEVIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

export const querySizeCache = new Map();

export const deadQueries = new Set();

export const wikiCache = new Map();

export function pick(arr) {
  return (arr[Math.floor(Math.random() * arr.length)]);
}

export let requestCount = 0;

export function takeRequestCount() { const n = requestCount; requestCount = 0; return n; }

export function slowLine() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  return Boolean(c && (c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType ?? ''))));
}

export function thumbSize() {
  return (slowLine() ? '400' : '640');
}

export const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

let extraHeaders = {};

export function setRequestHeaders(headers) {
  extraHeaders = { ...headers };
}

export async function fetchJson(url, { timeout = REQUEST_TIMEOUT_MS, form = null } = {}) {
  requestCount++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const init = { signal: controller.signal, headers: { Accept: 'application/json', ...extraHeaders } };
    if (form) {
      init.method = 'POST';
      init.body = new URLSearchParams(form);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      const error = new Error(`Wiki responded ${res.status}`);
      error.status = res.status;
      const wait = retryAfterMs(res.headers?.get?.('retry-after'));
      if (wait != null) error.retryAfter = wait;
      throw error;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function retryAfterMs(value, now = Date.now()) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

const TRANSIENT_API = /^(ratelimited|maxlag|readonly|internal_api_error|backend-fail|unknownerror|apierror-ratelimited)/i;

export function transientWikiError(error) {
  if (!error) return false;
  if (error.transient) return true;
  const status = Number(error.status);
  if (status) return status === 429 || status === 408 || status >= 500;
  return true;
}

export const RETRY_WAITS_MS = [500, 1500, 3500];
export const RETRY_WAIT_MAX_MS = 6000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJsonRetry(url, { tries = RETRY_WAITS_MS.length + 1, budget = 14000, timeout = REQUEST_TIMEOUT_MS, form = null } = {}) {
  const until = Date.now() + budget;
  for (let attempt = 1; ; attempt++) {
    let failure;
    try {
      const data = await fetchJson(url, { timeout, form });
      const code = String(data?.error?.code ?? '');
      if (!code || !TRANSIENT_API.test(code)) return data;
      failure = Object.assign(new Error(`Wiki said ${code}`), { transient: true });
    } catch (error) {
      failure = error;
    }
    if (attempt >= tries || !transientWikiError(failure) || offline()) throw failure;
    const planned = RETRY_WAITS_MS[Math.min(attempt - 1, RETRY_WAITS_MS.length - 1)];
    const wait = Math.min(RETRY_WAIT_MAX_MS, Math.max(planned, Number(failure.retryAfter) || 0)) + Math.floor(Math.random() * 250);
    if (Date.now() + wait > until) throw failure;
    await pause(wait);
  }
}

export function encodeTitle(title) {
  return (encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/gi, '%252F'));
}

let safeDefault = () => false;

export function useSafeDraws(fn) {
  safeDefault = typeof fn === 'function' ? fn : () => false;
}

async function drawOnce(pack, options) {
  if (pack.source === 'titles') return drawTitleSet(pack);
  if (pack.source === 'today') return drawTodaySet(pack);
  if (pack.source === 'custom') return drawCustomSet(pack, options);
  return drawWikipediaSet(pack, options);
}

export async function drawArticles(pack, options = {}) {
  const started = Date.now();
  takeRequestCount();
  const safe = pack.safe === true || Boolean(safeDefault());
  try {
    const first = await drawOnce(pack, options);
    if (!Array.isArray(first)) return first;
    const kept = first.filter((card) => cardAllowed(card, { safe }));
    if (kept.length === first.length || pack.source === 'titles') return kept;
    const seen = new Set(kept.map((card) => card.key));
    const more = await drawOnce({ ...pack, cards: first.length - kept.length + 2 }, options).catch(() => []);
    for (const card of Array.isArray(more) ? more : []) {
      if (kept.length >= first.length) break;
      if (seen.has(card.key) || !cardAllowed(card, { safe })) continue;
      seen.add(card.key);
      kept.push(card);
    }
    return kept;
  } finally {
    console.info(`Wikster draw: "${pack.name}" in ${Date.now() - started} ms, ${takeRequestCount()} requests`);
  }
}

export const MANY_SET_LANES = 3;

async function drawManyOnce(pack, n, options) {
  if (pack.source === 'custom') return drawCustomMany(pack, n, options);
  if (!pack.source || pack.source === 'wikipedia') return drawWikipediaMany(pack, n, options);
  const out = [];
  let next = 0;
  const lane = async () => {
    while (next < n) {
      next++;
      const set = await drawOnce(pack, options).catch(() => null);
      if (Array.isArray(set) && set.length) out.push(set);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MANY_SET_LANES, n) }, lane));
  return out;
}

export async function drawArticlesMany(pack, n, options = {}) {
  const count = Math.max(1, Math.floor(Number(n) || 1));
  const started = Date.now();
  takeRequestCount();
  const safe = pack.safe === true || Boolean(safeDefault());
  try {
    const pooled = await drawFromPool(pack, count, { safe, random: options.random, live: options.poolOnly ? null : (m) => drawManyOnce(pack, m, options) });
    if (pooled) return pooled.map((set) => set.filter((card) => cardAllowed(card, { safe }))).filter((set) => set.length);
    const sets = (await drawManyOnce(pack, count, options)).filter((set) => Array.isArray(set) && set.length);
    const seen = new Set(sets.flat().map((card) => card.key));
    const kept = sets.map((set) => set.filter((card) => cardAllowed(card, { safe })));
    const short = kept.reduce((sum, set, i) => sum + (sets[i].length - set.length), 0);
    if (short > 0 && pack.source !== 'titles') {
      const per = Math.max(1, pack.cards ?? 5);
      const spare = (await drawManyOnce(pack, Math.max(1, Math.ceil((short + 2) / per)), options).catch(() => []))
        .flat().filter((card) => !seen.has(card.key) && cardAllowed(card, { safe }));
      kept.forEach((set, i) => {
        while (set.length < sets[i].length && spare.length) {
          const card = spare.shift();
          set.push({ ...card, rarityId: sets[i][set.length]?.rarityId ?? card.rarityId });
        }
      });
    }
    return kept.filter((set) => set.length);
  } finally {
    console.info(`Wikster draw x${count}: "${pack.name}" in ${Date.now() - started} ms, ${takeRequestCount()} requests`);
  }
}

async function drawTodaySet(pack) {
  const top = await fetchTopRead(pack.day, wikiLang(), TODAY_POOL);
  if (!top.length) throw new Error('NO_TOP_READ');
  const pool = top.slice(0, TODAY_POOL);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const wanted = Math.max(1, pack.cards ?? 5);
  const picks = pool.slice(0, wanted + 3);
  const cards = await drawTitleSet({
    ...pack,
    source: 'titles',
    pick: null,
    titles: picks.map((row) => ({ title: row.title, fallback: row.title, name: null }))
  });
  const dealt = [];
  for (let i = 0; i < cards.length && dealt.length < wanted; i++) {
    const card = cards[i];
    if (!card?.key) continue;
    const plate = String(card.thumbnail ?? '').startsWith('data:');
    const spares = cards.length - i - 1;
    if (plate && dealt.length + spares >= wanted) continue;
    card.rarityId = todayRarityForRank(picks[i].rank).id;
    dealt.push(card);
  }
  return dealt;
}
