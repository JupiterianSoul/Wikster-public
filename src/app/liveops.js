import { onLiveChange, setLive } from '../live.js';
import { fetchLiveState } from '../account/liveops.js';
import { onLive } from '../account/feeds.js';
import { state } from './core.js';
import { onLaunch, refreshEconomy } from './econ.js';

const KEY = 'wikster.live.v1';
const SPREAD_MS = 2500;
let loading = null;
let offs = [];
let timer = null;
let painting = null;
const waiting = new Set();

export function restoreLive() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') setLive(raw);
  } catch {}
}

const RESUME_EVERY_MS = 10 * 60 * 1000;
let fetchedAt = 0;

export function refreshLive({ lazy = false } = {}) {
  if (lazy && Date.now() - fetchedAt < RESUME_EVERY_MS) return Promise.resolve(null);
  fetchedAt = Date.now();
  loading ??= fetchLiveState()
    .then((raw) => {
      if (!raw) { fetchedAt = 0; return null; }
      setLive(raw);
      try { localStorage.setItem(KEY, JSON.stringify(raw)); } catch {}
      return raw;
    })
    .catch(() => { fetchedAt = 0; return null; })
    .finally(() => { loading = null; });
  return loading;
}

export function takeLive(raw) {
  if (!raw || typeof raw !== 'object') return;
  fetchedAt = Date.now();
  setLive(raw);
  try { localStorage.setItem(KEY, JSON.stringify(raw)); } catch {}
}

onLaunch((launch) => takeLive(launch?.live));

function heard(kind) {
  waiting.add(kind);
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const kinds = new Set(waiting);
    waiting.clear();
    await refreshLive();
    if (kinds.has('packs')) refreshEconomy().catch(() => {});
  }, 300 + Math.floor(Math.random() * SPREAD_MS));
}

function repaint() {
  if (state.tab !== 'shop') return;
  import('./shop.js').then((m) => m.renderShop()).catch(() => {});
}

export function startLiveOps() {
  painting ??= onLiveChange(repaint);
  refreshLive({ lazy: true });
  if (!offs.length) offs = ['events', 'tuning', 'packs'].map((kind) => onLive(kind, () => heard(kind)));
}
