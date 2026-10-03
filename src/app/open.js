import { rarityBurst, styleForSpec } from '../packstyle.js';
import { touch } from '../save.js';
import { synth } from '../ui/sound.js';
import { Bar, dur, press, reveal, trackDrag } from '../ui/components.js';
import * as store from '../collection.js';
import { specColours, specIcon, specId, specName, toDrawPack } from '../booster.js';
import { drawArticles } from '../wiki.js';
import { t, tx } from '../i18n.js';
import { rarityById, rarityOfCard, rarityRank } from '../data/rarities.js';
import { SPECIAL_RARITY_ID, skinOf } from '../codedefs.js';
import { bandFor, formatViews, priceFor } from '../pricing.js';
import * as account from '../account.js';
import { buildCardBack, lookScrap } from '../packview.js';
import { DEFAULT_FX } from '../data/fx.js';
import { isMature } from '../sensitive.js';
import { iconSvg } from '../data/icons.js';
import { addXp, cleanPending, rankFor, rewardForLevel, xpForCard } from '../progression.js';
import { reportAlbums, reportQuest, seasonReached } from './arcade.js';
import { renderBinder } from './binder.js';
import { DRAW_HARD_LIMIT, EMERGE_DURATION, EMERGE_STAGGER, LAST_CARD_HOLD, PREFETCH_DELAY, RIP_COMMIT, RIP_DIR_KEY, RIP_LOCK_SLOP, RIP_TICK_STEP, SWIPE_COMMIT, TILT_REACH, clamp, clamp01, debug, el, esc, ink, money, openSheet, refreshWallet, settings, showScreen, shuffle, state, toast, wait } from './core.js';
import { buildStaticCard, openCardDetail, tilt } from './detail.js';
import { signedIn, userId } from './gate.js';
import { live } from './live.js';
import { addInk, inkForLevel } from '../ink.js';
import { buildBooster, renderPacks } from './packs.js';
import { renderProfile } from './profile.js';
import { refreshLevelBadge, updateBadges } from './regalia.js';
import { buzz } from './settings.js';
import { econ, economyIdle, refreshEconomy, serverEconomy } from './econ.js';
import { batchCap, batchNonce, batchPity, pityAfter, shapeHit, withPity } from '../econ/rules.js';
import { keepPictures, pictureKept, showPicture } from './pictures.js';
import {
  addCopy, bootReady, clearReady, growOpen, onOpenRefused, onOpenSettled, onReadyChange, peekPull, predictedDry, prepareMany, prepareNow,
  readyList, releaseOpen, scheduleReady as readyRefresh, setReadyFocus, startOpen, takeBatch
} from './ready.js';
import { wornOpening } from '../cosmetics.js';
import { playOpening } from './openfx.js';
import { afterReveal, hush, hushing } from './hush.js';
import { on } from '../ui/bus.js';
import { Progressive } from './cardgrid.js';

export function mouthPoint(booster) {
  const stage = el.burstLayer.getBoundingClientRect();
  const rect = booster.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - stage.left, y: rect.top + rect.height * 0.15 - stage.top };
}

export function spawnBurst(style, { x, y }, { scale = 1 } = {}) {
  if (settings().lowPower) return;
  const p = style.particles ?? style;
  const frag = document.createDocumentFragment();
  const count = Math.round(p.count * scale);
  for (let i = 0; i < count; i++) {
    const node = document.createElement('div');
    node.className = `pcl pcl-${p.shapes[i % p.shapes.length]}`;
    const angle = (-90 + (Math.random() - 0.5) * 120 * (p.spread ?? 1)) * (Math.PI / 180);
    const dist = (80 + Math.random() * 230) * scale;
    node.style.setProperty('--x', `${x}px`);
    node.style.setProperty('--y', `${y}px`);
    node.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    node.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    node.style.setProperty('--g', `${(p.gravity ?? 0.35) * (120 + Math.random() * 180)}px`);
    node.style.setProperty('--rot', `${((Math.random() - 0.5) * 640).toFixed(0)}deg`);
    node.style.setProperty('--dur', `${(0.65 + Math.random() * 0.75).toFixed(2)}s`);
    node.style.setProperty('--delay', `${(Math.random() * 0.12).toFixed(2)}s`);
    node.style.setProperty('--size', String(Math.round(6 + Math.random() * 9)));
    node.style.setProperty('--c', p.colors[i % p.colors.length]);
    node.addEventListener('animationend', () => node.remove(), { once: true });
    frag.appendChild(node);
  }
  el.burstLayer.appendChild(frag);
}

export function raiseBeam(booster, accent) {
  if (settings().lowPower) return;
  const stage = el.burstLayer.getBoundingClientRect();
  const rect = booster.getBoundingClientRect();
  const beam = document.createElement('div');
  beam.className = 'mouth-beam';
  beam.style.setProperty('--accent', accent);
  beam.style.left = `${rect.left + rect.width * 0.22 - stage.left}px`;
  beam.style.width = `${rect.width * 0.56}px`;
  beam.style.bottom = `${stage.bottom - rect.top - rect.height * 0.16}px`;
  beam.style.height = `${Math.min(rect.top - stage.top + rect.height * 0.16, stage.height * 0.6)}px`;
  beam.addEventListener('animationend', () => beam.remove(), { once: true });
  el.burstLayer.appendChild(beam);
}

export function eruptPack(booster) {
  const style = styleForSpec(state.spec);
  booster.classList.add('is-bursting');
  booster.addEventListener('animationend', function done(e) {
    if (e.animationName !== 'pack-burst') return;
    booster.removeEventListener('animationend', done);
    booster.classList.remove('is-bursting');
  });
  raiseBeam(booster, style.accent);
  spawnBurst(style, mouthPoint(booster));
  el.flash.style.setProperty('--flash-tint', style.accent);
  fireFlash(0.34);
}

export const rip = {
  progress: 0, target: 0, vel: 0,
  snags: [],
  raf: 0,
  dragging: false, lastTick: 0, done: false,
  booster: null, zone: null,
  release: null
};

export function endRipDrag() {
  rip.release?.();
  rip.release = null;
  rip.dragging = false;
}

export function paintRip() {
  const dir = state.ripDir || 1;
  const pct = rip.progress * 100;
  const tear = rip.booster?.querySelector('.booster-tear');
  if (!tear) return;
  const clip = dir > 0 ? `inset(0 0 0 ${pct}%)` : `inset(0 ${pct}% 0 0)`;
  tear.style.clipPath = clip;
  const front = rip.booster.querySelector('.rip-front');
  if (front) {
    front.style.left = `${dir > 0 ? pct : 100 - pct}%`;
    front.style.opacity = rip.progress > 0.02 && rip.progress < 0.99 ? '1' : '0';
  }
  rip.zone?.setAttribute('aria-valuenow', String(Math.round(pct)));
}

export function applyRipProgress(progress) {
  rip.progress = clamp01(progress);
  paintRip();
  if (Math.abs(rip.progress - rip.lastTick) >= RIP_TICK_STEP) {
    rip.lastTick = rip.progress;
    synth.playRipTick(rip.progress);
  }
}

export function setRip(progress) {
  rip.target = clamp01(progress);
  rip.vel = 0;
  applyRipProgress(progress);
}

export function ripFrame(now) {
  rip.raf = 0;
  const booster = rip.booster;
  if (!booster) return;
  const dt = Math.min(0.032, (now - (rip.frameAt || now)) / 1000 || 0.016);
  rip.frameAt = now;

  let goal = rip.target;
  const snag = rip.snags.find((s) => !s.popped && rip.target > s.at);
  if (snag) {
    if (rip.target >= snag.at + snag.give) {
      snag.popped = true;
      synth.playSnagPop(snag.at);
      rip.vel += 2.6;
    } else {
      goal = snag.at;
    }
  }

  rip.vel += (goal - rip.progress) * 190 * dt;
  rip.vel *= Math.exp(-16 * dt);
  applyRipProgress(rip.progress + rip.vel * dt);

  const strain = clamp01((rip.target - rip.progress) * 4);
  const dir = state.ripDir || 1;
  booster.style.setProperty('--strain', strain.toFixed(3));
  booster.style.setProperty('--shear', (dir * strain * 2.2).toFixed(3));

  const settled = !rip.dragging
    && Math.abs(rip.vel) < 0.01 && Math.abs(goal - rip.progress) < 0.002;
  if (!settled) rip.raf = requestAnimationFrame(ripFrame);
}

export function startRipLoop() {
  if (rip.raf) return;
  rip.frameAt = 0;
  rip.raf = requestAnimationFrame(ripFrame);
}

export function stopRipLoop() {
  if (rip.raf) cancelAnimationFrame(rip.raf);
  rip.raf = 0;
  rip.booster?.style.removeProperty('--strain');
  rip.booster?.style.removeProperty('--shear');
}

export function animateRip(from, to, duration) {
  const start = performance.now();
  return new Promise((resolve) => {
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setRip(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export function lockRipDirection(dx) {
  if (state.ripDir) return;
  state.ripDir = dx > 0 ? 1 : -1;
  try { localStorage.setItem(RIP_DIR_KEY, String(state.ripDir)); touch(RIP_DIR_KEY); } catch {}
  if (rip.booster) rip.booster.dataset.ripDir = String(state.ripDir);
}

export function rollSnags() {
  const count = 3 + Math.floor(Math.random() * 3);
  const lane = (0.55 - 0.1) / count;
  return Array.from({ length: count }, (_, i) => ({
    at: 0.1 + lane * (i + 0.2 + Math.random() * 0.6),
    give: 0.045 + Math.random() * 0.035,
    popped: false
  }));
}

export function initRip(booster) {
  endRipDrag();
  stopRipLoop();
  rip.booster = booster;
  rip.zone = booster.querySelector('.rip-zone');
  rip.progress = 0; rip.target = 0; rip.vel = 0;
  rip.lastTick = 0; rip.done = false;
  rip.snags = rollSnags();
  paintRip();

  const zone = rip.zone;
  if (!zone) return;

  zone.addEventListener('pointerdown', (event) => {
    if (rip.done) return;
    if (wornOpening() || fastOpen()) { event.preventDefault(); synth.resume(); completeRip(); return; }
    endRipDrag();
    rip.dragging = true;
    rip.lastTick = rip.progress;
    booster.classList.add('is-tearing');
    synth.resume();
    event.preventDefault();

    rip.release = trackDrag(event, {
      onMove: (dx) => {
        if (!rip.dragging || Math.abs(dx) < RIP_LOCK_SLOP) return;
        lockRipDirection(dx);
        const span = Math.max(120, zone.getBoundingClientRect().width * 0.72);
        rip.target = clamp01((dx * state.ripDir) / span);
        startRipLoop();
      },
      onEnd: async () => {
        if (!rip.dragging) return;
        rip.dragging = false;
        rip.release = null;
        stopRipLoop();
        booster.classList.remove('is-tearing');
        if (rip.target >= RIP_COMMIT) completeRip();
        else if (rip.progress > 0.01) {
          await animateRip(rip.progress, 0, 300);
          synth.playRipTick(0.35);
        } else {
          setRip(0);
        }
      }
    });
  });

  zone.addEventListener('keydown', (event) => {
    if (rip.done) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      lockRipDirection(event.key === 'ArrowRight' ? 1 : -1);
      setRip(rip.progress + 0.14);
      if (rip.progress >= RIP_COMMIT) completeRip();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      lockRipDirection(1);
      completeRip();
    }
  });
}

export function dropScrap(booster) {
  const dir = state.ripDir || 1;
  const stage = el.burstLayer.getBoundingClientRect();
  const rect = booster.getBoundingClientRect();
  const scrap = document.createElement('div');
  scrap.className = 'tear-scrap';
  scrap.style.left = `${rect.left - stage.left}px`;
  scrap.style.top = `${rect.top - stage.top}px`;
  scrap.style.width = `${rect.width}px`;
  scrap.style.height = `${rect.height * 0.15}px`;
  scrap.style.setProperty('--accent', styleForSpec(state.spec).accent);
  scrap.style.setProperty('--holo', styleForSpec(state.spec).holo);
  scrap.style.setProperty('--drift', `${dir * (70 + Math.random() * 50)}px`);
  scrap.style.setProperty('--spin', `${dir * (150 + Math.random() * 120)}deg`);
  lookScrap(booster, scrap, rect.width, rect.height);
  el.burstLayer.appendChild(scrap);
  scrap.addEventListener('animationend', () => scrap.remove(), { once: true });
}

let quiet = null;

function hushOpen() {
  quiet?.();
  quiet = hush();
}

export function unhushOpen() {
  const release = quiet;
  quiet = null;
  release?.();
}

on('screen', (name) => { if (name !== 'open') { stopEffect(); unhushOpen(); } });

export async function completeRip() {
  if (rip.done) return;
  rip.done = true;
  hushOpen();
  buzz(18);
  stopRipLoop();
  const booster = rip.booster;
  const fast = fastOpen();
  const effect = wornOpening() && !fast;
  if (fast) {
    synth.resume();
    synth.playTap();
    setRip(1);
    booster.classList.add('is-open');
  } else if (!effect) {
    await animateRip(rip.progress, 1, 220);
    synth.playRip();
    booster.classList.add('is-open');
    dropScrap(booster);
  } else {
    synth.resume();
    synth.playRip();
  }

  let opened = false;
  try {
    opened = await openPack(booster);
  } catch (error) {
    console.error('opening failed', error);
  }
  if (opened === 'taken') return;
  if (!opened) unhushOpen();
  if (!opened && rip.booster === booster) {
    rip.done = false;
    booster.classList.remove('is-open');
    setRip(0);
    if (!el.openHint.classList.contains('is-error')) {
      el.openHint.textContent = t('openNotOpened');
      el.openHint.className = 'open-hint is-error';
      synth.playDenied();
    }
  }
}

export function warmPictures(cards) {
  if (!Array.isArray(cards)) return;
  keepPictures(cards.map((card) => card?.thumbnail));
}

export const READY_TTL_MS = 30 * 60 * 1000;

export const READY_WARM_AT_LAUNCH = 6;

export const readyDraws = new Map();

export function gainBooster(spec, count = 1) {
  if (!serverEconomy()) store.addBooster(state.inventory, spec, count);
  ensureReady(spec);
}

const articlesOf = (value) => (value?.server ? value.pulls.map((p) => p.article) : value);

export function scheduleReady(delay = 300) {
  readyRefresh(delay);
}

export function clearServerReady() {
  clearReady();
}

export function ensureReady(spec, { now = false } = {}) {
  const id = specId(spec);
  if (serverEconomy()) {
    readyRefresh(now ? 0 : 300);
    return peekPull(id) ? { id, settled: true, failed: false, queued: true, at: Date.now(), promise: Promise.resolve(null) } : null;
  }
  const held = readyDraws.get(id);
  if (held && !held.failed && Date.now() - held.at < READY_TTL_MS) return held;
  if (navigator.onLine === false) return held ?? null;
  const record = { id, settled: false, failed: false, at: Date.now() };
  record.promise = drawArticles(toDrawPack(spec))
    .catch((error) => ({ error }))
    .then((value) => {
      record.settled = true;
      record.failed = Boolean(value?.error);
      if (!record.failed) warmPictures(articlesOf(value));
      if (state.prefetch === record) paintOpenHint();
      return value;
    });
  readyDraws.set(id, record);
  return record;
}

export function dropReady(id) { readyDraws.delete(id); }

export function schedulePrefetch(spec, { delay = PREFETCH_DELAY } = {}) {
  clearTimeout(state.prefetchTimer);
  const id = specId(spec);
  setReadyFocus(id);
  if (serverEconomy()) {
    readyRefresh(0);
    return;
  }
  if (state.prefetch?.id === id && !state.prefetch.failed) return;
  const point = () => { state.prefetch = ensureReady(spec, { now: true }); paintOpenHint(); };
  if (delay) state.prefetchTimer = setTimeout(point, delay);
  else point();
}

export function warmDrawer() {
  if (serverEconomy()) { bootReady(); return; }
  if (navigator.onLine === false || navigator.connection?.saveData) return;
  const owned = Object.values(state.inventory ?? {})
    .filter((slot) => slot?.spec && slot.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, READY_WARM_AT_LAUNCH);
  owned.forEach((slot, i) => setTimeout(() => ensureReady(slot.spec), i * 1200));
}

export function openReadiness() {
  if (!state.spec) return 'ready';
  if (serverEconomy()) {
    if (peekPull(specId(state.spec))) return 'ready';
    return navigator.onLine === false ? 'offline' : 'ready';
  }
  const pre = state.prefetch?.id === specId(state.spec) ? state.prefetch : null;
  if (pre?.settled && !pre.failed) return 'ready';
  if (navigator.onLine === false) return 'offline';
  if (pre?.settled && pre.failed) return 'unreachable';
  return 'ready';
}

export function paintOpenHint() {
  if (!state.spec) return;
  if (!el.openScreen?.classList.contains('phase-idle')) return;
  if (el.openHint.classList.contains('is-arriving')) return;
  const readiness = openReadiness();
  if (readiness === 'ready') {
    el.openHint.textContent = state.batch ? t(tapOpens() ? 'openAllTap' : 'openAllSlide', { n: state.batch }) : tapOpens() ? t('tapToOpen') : t('slideToRip');
    el.openHint.className = 'open-hint';
    return;
  }
  el.openHint.textContent = readiness === 'offline' ? t('openWarnOffline') : t('openWarnUnreachable');
  el.openHint.className = 'open-hint is-warn';
}

onReadyChange(() => {
  paintOpenHint();
  if (state.spec && el.openScreen?.classList.contains('phase-idle')) warmPictures(peekPull(specId(state.spec))?.cards.map((c) => c.article));
});

export function drawFor(spec) {
  const id = specId(spec);
  const prefetched = state.prefetch?.id === id && !state.prefetch.queued ? state.prefetch : null;
  const held = readyDraws.get(id) ?? prefetched;
  state.prefetch = null;
  dropReady(id);
  if (held && !held.failed && Date.now() - held.at < READY_TTL_MS) return held.promise;
  return drawArticles(toDrawPack(spec)).catch((error) => ({ error }));
}

export function homeTabFor(spec) {
  return (spec?.kind === 'timed' ? 'timed' : 'packs');
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const fastOpen = () => Boolean(settings().skipOpening) || reducedMotion();

export const tapOpens = () => Boolean(wornOpening()) || fastOpen();

export function heldOf(spec) {
  return spec ? (state.inventory?.[specId(spec)]?.count ?? 0) : 0;
}

export function batchFor(spec) {
  const n = Math.min(heldOf(spec), batchCap(spec));
  return n >= 2 ? n : 0;
}

export function setFastOpen(on) {
  settings().skipOpening = Boolean(on);
  store.saveProfile(state.profile);
  paintQuick();
  paintOpenHint();
}

export function paintQuick() {
  if (!el.openQuick) return;
  const fast = Boolean(settings().skipOpening);
  el.openFastLabel.textContent = t('openSkipAnim');
  el.openFast.setAttribute('aria-checked', String(fast));
  el.openFast.querySelector('.switch')?.classList.toggle('is-on', fast);
  const summary = el.openScreen.classList.contains('phase-summary');
  const all = batchFor(state.spec);
  el.openAll.hidden = !all || (!summary && !el.openScreen.classList.contains('phase-idle'));
  if (!el.openAll.hidden) {
    el.openAll.textContent = state.batch && !summary ? t('openOneInstead') : t('openAllN', { n: all });
    el.openAll.classList.toggle('is-armed', Boolean(state.batch) && !summary);
  }
}

export function toggleBatch() {
  const spec = state.spec;
  if (!spec) return;
  if (el.openScreen.classList.contains('phase-summary')) {
    if (batchFor(spec)) { synth.playTap(); openScreenFor(spec, { batch: true }); }
    return;
  }
  if (!el.openScreen.classList.contains('phase-idle') || rip.done) return;
  state.batch = state.batch ? 0 : batchFor(spec);
  synth.playTap();
  paintBatchTitle();
  paintQuick();
  paintOpenHint();
  schedulePrefetch(spec, { delay: 0 });
}

function paintBatchTitle() {
  el.openTitle.textContent = state.batch ? t('openAllTitle', { name: specName(state.spec), n: state.batch }) : specName(state.spec);
  let badge = el.boosterSlot.querySelector(':scope > .booster-batch');
  if (!state.batch) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'booster-batch';
    el.boosterSlot.appendChild(badge);
  }
  badge.textContent = `×${state.batch}`;
}

export function openScreenFor(spec, { batch = false } = {}) {
  state.spec = spec;
  state.batch = batch ? batchFor(spec) : 0;
  synth.resume();

  el.openScreen.className = 'screen is-active phase-idle';
  el.openTitle.textContent = specName(spec);
  el.openProgress.textContent = '';
  el.openHint.textContent = t('slideToRip');
  el.openHint.className = 'open-hint';
  summaryGrid?.stop();
  el.summary.replaceChildren();
  el.openDone.hidden = true;
  el.openSkip.hidden = true;
  el.cardStack.replaceChildren();
  state.pulls = []; state.cards = []; state.index = 0; state.seen = new Set();
  state.openNonce = null;
  state.growing = false;
  brew(false);
  stopEffect();
  unhushOpen();

  if (spec.kind === 'custom') state.packMode = 'custom';

  const booster = buildBooster(spec, { interactive: true, size: 'is-hero' });
  booster.classList.add('is-idle');
  el.boosterSlot.replaceChildren(booster);
  initRip(booster);
  paintBatchTitle();
  paintQuick();

  schedulePrefetch(spec, { delay: 0 });
  paintOpenHint();
  showScreen('open');
}

let opening = null;

export async function openPack(booster) {
  while (opening) {
    const before = opening;
    const done = await before.catch(() => false);
    if (done || booster !== rip.booster || !booster.isConnected) return done ? 'taken' : false;
    if (opening === before) opening = null;
  }
  const run = (async () => {
    if (debug.failNextOpen) { debug.failNextOpen = false; throw new Error('debug: forced open failure'); }
    return await runOpen(booster);
  })();
  opening = run;
  try {
    return await run;
  } finally {
    if (opening === run) opening = null;
  }
}

onOpenSettled((entry, res) => {
  if (state.openNonce === entry.nonce) {
    for (const pull of state.pulls) {
      const saved = res.cards?.[pull.article.key];
      if (saved) pull.entry = saved;
    }
  }
  if (res.outcome !== 'already') showXpPop(res.xp ?? 0);
  reportAlbums();
  refreshLevelBadge();
  seasonReached(res.season);
  updateBadges();
  renderPacks();
  paintQuick();
  if (state.tab === 'binder') renderBinder();
});

onOpenRefused((entry) => {
  renderPacks();
  renderBinder();
  if (!entry.cards.every((c) => state.collection.entries[c.article.key])) toast(esc(t('openNotSaved')), 'error');
});

function settleBooster(booster) {
  if (!booster.classList.contains('is-idle')) return;
  const pose = getComputedStyle(booster).transform;
  booster.classList.remove('is-idle');
  if (pose && pose !== 'none') booster.style.transform = pose;
}

async function runEffect(id, booster, cards = state.cards, extra = {}) {
  for (const card of cards) card.style.transition = 'none';
  void el.cardStack.offsetHeight;
  const box = booster.getBoundingClientRect();
  const packW = booster.offsetWidth || box.width;
  const packH = booster.offsetHeight || box.height;
  const rect = { left: box.left + (box.width - packW) / 2, top: box.top + (box.height - packH) / 2, width: packW, height: packH };
  const root = document.createElement('div');
  root.className = 'ofx-root';
  document.body.appendChild(root);
  const pack = booster.cloneNode(true);
  pack.querySelectorAll('.rip-zone, .booster-tear, .rip-front, .booster-mouth').forEach((n) => n.remove());
  pack.classList.remove('is-open', 'is-idle', 'is-tearing', 'is-bursting', 'is-leaving');
  pack.style.removeProperty('transform');
  pack.style.setProperty('--pack-w', `${rect.width}px`);
  pack.style.setProperty('--pack-h', `${rect.height}px`);
  pack.style.width = `${rect.width}px`;
  pack.style.height = `${rect.height}px`;
  booster.style.visibility = 'hidden';
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const u = rect.width / 24;
  const targets = [];
  const ghosts = cards.map((card) => {
    const r = card.getBoundingClientRect();
    targets.push({ x: (r.left + r.width / 2 - center.x) / u, y: (r.top + r.height / 2 - center.y) / u });
    const w = card.offsetWidth || r.width;
    const h = card.offsetHeight || r.height;
    const ghost = card.cloneNode(true);
    ghost.removeAttribute('style');
    ghost.className = 'card ofx-card';
    ghost.style.width = `${w}px`;
    ghost.style.height = `${h}px`;
    ghost.style.setProperty('--card-w', `${w}px`);
    card.classList.add('is-veiled');
    return ghost;
  });
  for (const card of cards) card.style.transition = '';
  try {
    await playOpening(id, { ...extra, root, center, pack, packW: rect.width, packH: rect.height, cards: ghosts, targets });
  } finally {
    cards.forEach((card) => card.classList.remove('is-veiled'));
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.catch(() => {}).then(() => root.remove());
  }
}

const ARRIVAL_SLACK_MS = 1500;

export function arrivalsDone(cards, max) {
  const finite = (a) => {
    const timing = a.effect?.getTiming?.();
    return !timing || Number.isFinite(Number(timing.iterations));
  };
  const all = cards.flatMap((card) => (typeof card.getAnimations === 'function' ? card.getAnimations() : []).filter(finite));
  if (!all.length) return Promise.resolve();
  return new Promise((resolve) => {
    let left = all.length;
    const offs = [];
    const finish = () => {
      clearTimeout(timer);
      for (const off of offs.splice(0)) off();
      resolve();
    };
    const timer = setTimeout(finish, max);
    for (const a of all) {
      const off = () => {
        a.removeEventListener('finish', done);
        a.removeEventListener('cancel', done);
      };
      const done = () => {
        off();
        if (--left <= 0) finish();
      };
      offs.push(off);
      a.addEventListener('finish', done);
      a.addEventListener('cancel', done);
      if (a.playState === 'finished' || a.playState === 'idle') done();
    }
  });
}

let fxStop = null;

function stopEffect() {
  const stop = fxStop;
  fxStop = null;
  stop?.abort();
}

function startArrival(booster, effect, hold = null) {
  const count = state.cards.length;
  let showing = null;
  if (effect) {
    stopEffect();
    const stop = typeof AbortController === 'function' ? new AbortController() : null;
    fxStop = stop;
    showing = runEffect(effect, booster, state.cards, { hold, signal: stop?.signal }).finally(() => { if (fxStop === stop) fxStop = null; });
  }
  if (!effect) state.cards.forEach((card, i) => {
    const side = i % 2 ? 1 : -1;
    card.style.setProperty('--spin', `${(side * (10 + Math.random() * 16)).toFixed(1)}deg`);
    card.style.setProperty('--sway', `${(side * (30 + Math.random() * 46)).toFixed(0)}px`);
    card.style.setProperty('--apex', `${-(30 + Math.random() * 14).toFixed(0)}%`);
    card.style.animationDelay = `${i * EMERGE_STAGGER}ms`;
    card.classList.add('is-emerging');
    card.addEventListener('animationend', function done(event) {
      if (event.target !== card || event.animationName !== 'card-emerge') return;
      card.removeEventListener('animationend', done);
      card.classList.remove('is-emerging');
    });
  });
  if (showing) return showing;
  return arrivalsDone(state.cards, EMERGE_DURATION + EMERGE_STAGGER * count + ARRIVAL_SLACK_MS);
}

function settleArrivals() {
  for (const card of state.cards) {
    card.classList.remove('is-emerging');
    if (state.batch) continue;
    card.classList.remove('is-dealt');
  }
}

const DEAL_HEAD_MS = 260;

const FLY_MAX = 40;

function dealCards(cards, from) {
  const box = el.cardStack.getBoundingClientRect();
  let flown = 0;
  let late = 0;
  cards.forEach((card) => {
    const r = card.getBoundingClientRect();
    const seen = from && r.width > 0 && r.bottom > box.top && r.top < box.bottom && flown < FLY_MAX && typeof card.animate === 'function';
    if (seen) {
      const k = flown++;
      const dx = from.x - (r.left + r.width / 2);
      const dy = from.y - (r.top + r.height / 2);
      const spin = (k % 2 ? 1 : -1) * (6 + (k % 5) * 3);
      card.classList.add('is-flying');
      const fly = card.animate([
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(0.42)`, opacity: 0 },
        { opacity: 1, offset: 0.18 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 30}px) rotate(${spin * 0.4}deg) scale(0.8)`, offset: 0.55 },
        { transform: 'none', opacity: 1 }
      ], { duration: 560, delay: k * 32, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'backwards' });
      const done = () => card.classList.remove('is-flying');
      fly.finished.then(done, done);
      return;
    }
    card.style.animationDelay = `${Math.min(FLY_MAX * 32 + late++ * 12, 1400)}ms`;
    card.classList.add('is-dealt');
    card.addEventListener('animationend', function done(event) {
      if (event.target !== card || event.animationName !== 'card-dealt') return;
      card.removeEventListener('animationend', done);
      card.classList.remove('is-dealt');
      card.style.animationDelay = '';
    });
  });
}

function boosterPoint(booster) {
  const r = booster?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height * 0.3 } : null;
}

function batchArrival(booster, count, from = null) {
  state.cards = Array.from({ length: count }, (_, i) => buildPlaceholderCard(i, count));
  for (const card of state.cards) card.classList.add('is-mini');
  el.cardStack.scrollTop = 0;
  el.cardStack.replaceChildren(...state.cards);
  layoutDeck();
  if (fastOpen()) return Promise.resolve();
  dealCards(state.cards, from);
  return wait(DEAL_HEAD_MS);
}

const FX_LEAD_MAX = 12;

async function batchEffect(booster, count, effect) {
  const from = boosterPoint(booster);
  state.cards = Array.from({ length: count }, (_, i) => buildPlaceholderCard(i, count));
  for (const card of state.cards) card.classList.add('is-mini', 'is-veiled');
  el.cardStack.scrollTop = 0;
  el.cardStack.replaceChildren(...state.cards);
  layoutDeck();
  await new Promise((r) => requestAnimationFrame(() => r()));
  const box = el.cardStack.getBoundingClientRect();
  const lead = [];
  for (const card of state.cards) {
    if (lead.length >= FX_LEAD_MAX) break;
    const r = card.getBoundingClientRect();
    if (r.top >= box.bottom) break;
    if (r.bottom > box.top && r.width > 0) lead.push(card);
  }
  try {
    await runEffect(effect, booster, lead.length ? lead : state.cards.slice(0, 1));
  } catch (error) {
    console.warn('opening effect', error);
  }
  booster.classList.add('is-gone');
  const rest = state.cards.filter((card) => card.classList.contains('is-veiled'));
  rest.forEach((card) => card.classList.remove('is-veiled'));
  dealCards(rest, from);
}

async function layCards(booster, count, hold = null) {
  if (state.batch) {
    el.openScreen.classList.add('is-batch');
    const effect = !fastOpen() && wornOpening();
    if (effect) return batchEffect(booster, count, effect);
    const from = boosterPoint(booster);
    if (!fastOpen()) {
      eruptPack(booster);
      await wait(190);
      booster.classList.add('is-leaving');
    } else {
      booster.classList.add('is-gone');
    }
    return batchArrival(booster, count, from);
  }
  if (fastOpen()) {
    state.cards = Array.from({ length: count }, (_, i) => buildPlaceholderCard(i, count));
    el.cardStack.replaceChildren(...state.cards);
    booster.classList.add('is-gone');
    state.index = 0;
    layoutDeck();
    return Promise.resolve();
  }
  const effect = wornOpening() || null;
  if (effect) {
    state.cards = Array.from({ length: count }, (_, i) => buildPlaceholderCard(i, count));
    el.cardStack.replaceChildren(...state.cards);
    state.index = 0;
    layoutDeck();
    await new Promise((r) => requestAnimationFrame(() => r()));
  } else {
    eruptPack(booster);
    await wait(190);
    state.cards = Array.from({ length: count }, (_, i) => buildPlaceholderCard(i, count));
    el.cardStack.replaceChildren(...state.cards);
  }
  const arriving = startArrival(booster, effect, hold);
  if (!effect) {
    await wait(EMERGE_STAGGER * 2);
    booster.classList.add('is-leaving');
  }
  return arriving;
}

export async function runOpen(booster) {
  clearTimeout(state.prefetchTimer);
  if (state.batch && batchFor(state.spec) < 2) { state.batch = 0; paintBatchTitle(); }
  if (state.batch) return serverEconomy() ? runServerBatch(booster) : runLocalBatch(booster);
  if (serverEconomy()) return runServerOpen(booster);

  const inHand = state.prefetch?.id === specId(state.spec) && state.prefetch.settled;
  if (!navigator.onLine && !inHand) {
    el.openHint.textContent = t('openOffline');
    el.openHint.className = 'open-hint is-error';
    synth.playDenied();
    return false;
  }

  if (!store.takeBooster(state.inventory, specId(state.spec))) return false;
  store.markOpenInFlight(state.spec);
  renderPacks();

  const drawing = drawFor(state.spec);

  el.openScreen.classList.replace('phase-idle', 'phase-opening');
  el.openHint.textContent = '';
  settleBooster(booster);

  const guarded = Promise.race([
    drawing,
    wait(DRAW_HARD_LIMIT).then(() => ({ error: new Error('TIMEOUT') }))
  ]);
  const arriving = layCards(booster, state.spec.cards, guarded);
  brewUntil(arriving, guarded);
  const [articles] = await Promise.all([guarded, arriving]);
  brewDone();

  if (!articles || articles.error) {
    if (!store.reclaimOpenInFlight(state.inventory)) gainBooster(state.spec, 1);
    renderPacks();
    openFailed(articles?.error?.message);
    return false;
  }

  warmPictures(articles);

  const spec = state.spec;
  const pulls = localPulls(spec, articles);
  const recorded = store.recordPulls(state.collection, pulls, spec);
  if (signedIn() && spec.kind !== 'custom' && spec.kind !== 'code') {
    const found = pulls.map((pull) => ({ ...pull.article, price: pull.price, rarityId: pull.rarity.id }))
      .filter((card) => card.key && !String(card.packId ?? '').startsWith('custom'));
    account.codexAdd(userId(), found).catch(() => {});
  }
  pulls.forEach((pull, i) => { pull.entry = recorded[i].entry; });
  store.clearOpenInFlight();
  reportPulls(spec, pulls, recorded);
  reportAlbums();
  if (spec.kind !== 'code') {
    store.recordOpening(state.profile, pulls);
    if (spec.kind === 'timed') {
      state.profile.timed.opened = (state.profile.timed.opened ?? 0) + (spec.timedSlots ?? 1);
      store.saveProfile(state.profile);
    }
    awardXp(pulls);
  }
  updateBadges();
  presentPulls(pulls);
  if ((state.inventory[specId(spec)]?.count ?? 0) > 0) ensureReady(spec);
  return true;
}

function localPulls(spec, articles) {
  const colours = specColours(spec);
  const ordered = spec.kind === 'code' ? articles : shuffle(articles);
  let rated = ordered.map((article) => ({
    article,
    special: Boolean(article.special),
    rarityId: article.special ? SPECIAL_RARITY_ID : rarityOfCard(article).id
  }));
  if (spec.kind !== 'code') {
    rated = shapeHit(rated, spec, toDrawPack(spec).odds);
    rated = withPity(rated.map((r) => ({ ...r, price: 0 })), spec, state.profile.pity ?? 0);
    state.profile.pity = pityAfter(state.profile.pity ?? 0, spec, rated);
  }
  return rated.map(({ article, rarityId }) => {
    const rarity = rarityById(rarityId);
    return {
      article, rarity,
      price: priceFor(article.popularity, article.special ? rarityById('prismatic') : rarity),
      packName: specName(spec),
      packIcon: specIcon(spec),
      packAccent: colours.accent
    };
  });
}

const BATCH_LANES = 3;

async function drawMany(spec, n) {
  const out = new Array(n).fill(null);
  let next = 0;
  const lane = async () => {
    while (next < n) {
      const i = next++;
      const drawing = i === 0 ? drawFor(spec) : drawArticles(toDrawPack(spec)).catch((error) => ({ error }));
      out[i] = await Promise.race([drawing, wait(DRAW_HARD_LIMIT).then(() => ({ error: new Error('TIMEOUT') }))]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(BATCH_LANES, n) }, lane));
  return out;
}

function openFailed(why) {
  stopEffect();
  unhushOpen();
  brew(false);
  state.growing = false;
  el.openScreen.className = 'screen is-active phase-idle';
  el.openHint.textContent = why === 'OFFLINE' || navigator.onLine === false
    ? t('openOffline')
    : why === 'TIMEOUT'
      ? t('openSlow')
      : t('openFailed', { error: why ?? 'Network error' });
  el.openHint.className = 'open-hint is-error';
  el.cardStack.replaceChildren();
  const fresh = buildBooster(state.spec, { interactive: true, size: 'is-hero' });
  fresh.classList.add('is-idle');
  el.boosterSlot.replaceChildren(fresh);
  initRip(fresh);
  paintBatchTitle();
  paintQuick();
}

async function runLocalBatch(booster) {
  const spec = state.spec;
  const id = specId(spec);
  const n = Math.min(state.batch, heldOf(spec));
  if (!navigator.onLine) {
    el.openHint.textContent = t('openOffline');
    el.openHint.className = 'open-hint is-error';
    synth.playDenied();
    return false;
  }
  for (let i = 0; i < n; i++) if (!store.takeBooster(state.inventory, id)) return false;
  store.markOpenInFlight(spec, n);
  renderPacks();

  el.openScreen.classList.replace('phase-idle', 'phase-opening');
  el.openHint.textContent = '';
  settleBooster(booster);

  const drawing = drawMany(spec, n);
  const laying = layCards(booster, n * spec.cards);
  brewUntil(laying, drawing);
  const [draws] = await Promise.all([drawing, laying]);
  brewDone();
  const good = draws.filter((a) => Array.isArray(a) && a.length);
  if (!good.length) {
    store.clearOpenInFlight();
    gainBooster(spec, n);
    renderPacks();
    openFailed(draws.find((a) => a?.error)?.error?.message);
    return false;
  }
  if (good.length < n) gainBooster(spec, n - good.length);

  const groups = good.map((articles) => { warmPictures(articles); return localPulls(spec, articles); });
  const pulls = groups.flat();
  const recorded = store.recordPulls(state.collection, pulls, spec);
  if (signedIn() && spec.kind !== 'custom' && spec.kind !== 'code') {
    const found = pulls.map((pull) => ({ ...pull.article, price: pull.price, rarityId: pull.rarity.id }))
      .filter((card) => card.key && !String(card.packId ?? '').startsWith('custom'));
    account.codexAdd(userId(), found).catch(() => {});
  }
  pulls.forEach((pull, i) => { pull.entry = recorded[i].entry; });
  store.clearOpenInFlight();
  let at = 0;
  for (const group of groups) {
    reportPulls(spec, group, recorded.slice(at, at + group.length));
    at += group.length;
  }
  reportAlbums();
  if (spec.kind !== 'code') {
    for (const group of groups) store.recordOpening(state.profile, group);
    if (spec.kind === 'timed') {
      state.profile.timed.opened = (state.profile.timed.opened ?? 0) + (spec.timedSlots ?? 1) * groups.length;
      store.saveProfile(state.profile);
    }
    awardXp(pulls);
  }
  updateBadges();
  state.batch = groups.length;
  presentPulls(pulls);
  if (heldOf(spec) > 0) ensureReady(spec);
  return true;
}

function reportPulls(spec, pulls, recorded) {
  reportQuest('open', { kind: spec.kind, themeId: spec.themeId ?? null, rarityId: spec.rarityId ?? null });
  const wished = new Set(store.loadWishlist().map((c) => c.key));
  pulls.forEach((pull, i) => {
    reportQuest('pull', {
      rarityId: pull.rarity.id, themeId: spec.themeId ?? null,
      isNew: Boolean(recorded[i]?.isNew),
      wished: wished.has(pull.article.key),
      popularity: pull.article.popularity ?? 0
    });
  });
}

function presentPulls(pulls) {
  settleArrivals();
  state.pulls = pulls;
  bindCards(pulls);
  el.openScreen.classList.replace('phase-opening', 'phase-reveal');
  el.openSkip.hidden = false;
  state.index = 0;
  layoutDeck();
  if (state.batch) {
    paintBatchTitle();
    el.openProgress.textContent = t('batchProgress', { seen: 0, n: pulls.length });
    el.openHint.textContent = t('batchRevealHint');
    return;
  }
  revealCurrent();
}

const RETRY_CODES = new Set(['FAILED', 'TIMEOUT', 'SLOW_DOWN', 'OFFLINE', 'DRAW_FAILED', 'NOT_LIVE', 'NETWORK', 'SERVER_DOWN', 'WIKI_DOWN']);
const RETRY_WAITS = [1000, 3000, 6000, 10000];
const PREPARE_TRIES = 4;
const PREPARE_ASK_MAX = 60;
const STREAM_PATIENCE_MS = 30000;

function landed(run, here, ms) {
  return new Promise((resolve) => {
    let last = run.parts.length;
    let timer = null;
    const stop = onReadyChange(() => {
      if (run.parts.length >= run.want || !here()) finish();
      else if (run.parts.length > last) { last = run.parts.length; arm(); }
    });
    const finish = () => { clearTimeout(timer); stop(); resolve(); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(finish, ms); };
    arm();
  });
}
const IDLE_PATIENCE_MS = 1500;

const offlineNow = () => navigator.onLine === false;

function waitOnline(here, ms = 5000) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); clearInterval(check); window.removeEventListener('online', done); resolve(); };
    const timer = setTimeout(done, ms);
    const check = setInterval(() => { if (!here()) done(); }, 250);
    window.addEventListener('online', done);
  });
}

function beginOpening(booster) {
  el.openScreen.classList.replace('phase-idle', 'phase-opening');
  el.openHint.textContent = '';
  el.openHint.className = 'open-hint';
  settleBooster(booster);
}

export function arrivingText() {
  return state.growing && state.landTotal > 1 ? t('boostersLanded', { n: state.landed ?? 0, total: state.landTotal }) : t('cardsArriving');
}

function arrivingHint(on) {
  if (on) {
    el.openHint.textContent = arrivingText();
    el.openHint.className = 'open-hint is-arriving';
  } else if (el.openHint.classList.contains('is-arriving')) {
    el.openHint.textContent = '';
    el.openHint.className = 'open-hint';
  }
}

const BREW_LONG_MS = 2400;
let brewing = null;

function brew(on) {
  if (on) {
    if (brewing) return;
    const node = document.createElement('div');
    node.className = 'open-brew';
    node.setAttribute('aria-hidden', 'true');
    const colours = state.spec ? specColours(state.spec) : {};
    if (colours.accent) { node.style.setProperty('--brew-pack-a', colours.accent); el.openScreen.style.setProperty('--brew-a', colours.accent); }
    if (colours.accent2 || colours.accent) node.style.setProperty('--brew-pack-b', colours.accent2 ?? colours.accent);
    node.dataset.fx = wornOpening() ?? 'classic';
    node.innerHTML = `<i class="open-brew-glow"></i><i class="open-brew-ring"></i><i class="open-brew-orbit">${'<b></b>'.repeat(8)}</i>`;
    const record = { node, timer: 0, frame: 0 };
    brewing = record;
    const place = () => {
      if (brewing !== record) return;
      if (!state.batch) {
        const rects = state.cards.slice(0, 12).map((card) => card.getBoundingClientRect()).filter((r) => r.width);
        const span = rects.length ? Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left)) : 0;
        const width = Math.min(420, Math.max(rects[0]?.width ?? 0, span * 0.5));
        if (width) node.style.setProperty('--brew-w', `${Math.round(width)}px`);
      }
      el.openStage.prepend(node);
      el.openScreen.classList.add('is-brewing');
      record.timer = setTimeout(() => {
        node.classList.add('is-long');
        el.openScreen.classList.add('is-brewing-long');
      }, BREW_LONG_MS);
    };
    if (typeof requestAnimationFrame === 'function') record.frame = requestAnimationFrame(place);
    else place();
    return;
  }
  if (!brewing) return;
  const { node, timer, frame } = brewing;
  brewing = null;
  clearTimeout(timer);
  if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  if (!node.isConnected) { el.openScreen.style.removeProperty('--brew-a'); return; }
  el.openScreen.classList.remove('is-brewing', 'is-brewing-long');
  el.openScreen.style.removeProperty('--brew-a');
  const gone = () => node.remove();
  if (typeof node.animate !== 'function' || fastOpen()) { gone(); return; }
  node.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(1.18)' }], { duration: 420, easing: 'ease-out', fill: 'forwards' }).finished.then(gone, gone);
}

function markArriving(from) {
  const settling = [];
  let any = false;
  state.cards.forEach((card, i) => {
    const on = i >= from;
    const was = card.classList.contains('is-arriving');
    if (on) {
      any = true;
      if (!was) {
        card.style.setProperty('--brew-i', String(i % 24));
        card.style.setProperty('--brew-side', i % 2 ? '1' : '-1');
        card.classList.add('is-arriving');
      }
    } else if (was) {
      settling.push(card);
    }
  });
  const poses = settling.map((card) => {
    const inner = card.querySelector('.card-inner');
    if (!inner || card.classList.contains('is-landed') || typeof inner.animate !== 'function') return null;
    const pose = getComputedStyle(inner).transform;
    return pose && pose !== 'none' ? { inner, pose } : null;
  });
  settling.forEach((card) => card.classList.remove('is-arriving'));
  poses.forEach((p) => {
    if (p) p.inner.animate([{ transform: p.pose }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.75,.2,1)' });
  });
  brew(any);
}

function brewUntil(laying, drawing) {
  let landed = false;
  Promise.resolve(drawing).then(() => { landed = true; }, () => { landed = true; });
  Promise.resolve(laying).then(() => {
    if (landed || !el.openScreen.classList.contains('phase-opening')) return;
    if (!state.batch) layoutDeck();
    markArriving(0);
    arrivingHint(true);
  }, () => {});
}

function brewDone() {
  markArriving(state.cards.length);
  arrivingHint(false);
}

function fitCards(n, { keep = 0 } = {}) {
  const total = Math.max(n, keep);
  while (state.cards.length > total) state.cards.pop().remove();
  while (state.cards.length < total) {
    const card = buildPlaceholderCard(state.cards.length, total);
    if (state.batch) card.classList.add('is-mini');
    el.cardStack.appendChild(card);
    state.cards.push(card);
  }
}

const toPulls = (cards, recorded) => cards.map((p, i) => ({
  article: p.article, rarity: rarityById(p.rarityId), price: p.price,
  packName: p.packName, packIcon: p.packIcon, packAccent: p.packAccent, entry: recorded[i].entry
}));

function fileCards(spec, cards, sizes) {
  const id = specId(spec);
  const now = Date.now();
  const recorded = cards.map((card, i) => addCopy(state.collection.entries, card, id, now + i));
  const pulls = toPulls(cards, recorded);
  afterPaint(() => {
    store.saveCollection(state.collection);
    renderPacks();
    let at = 0;
    for (const size of sizes ?? [pulls.length]) {
      reportPulls(spec, pulls.slice(at, at + size), recorded.slice(at, at + size));
      at += size;
    }
    updateBadges();
  });
  return pulls;
}

function afterPaint(fn) {
  const run = () => setTimeout(() => { try { fn(); } catch (error) { console.warn('opening bookkeeping', error); } }, 0);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

function waitForPull(spec, here) {
  const id = specId(spec);
  setReadyFocus(id);
  readyRefresh(0);
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    let stopWatch = () => {};
    const finish = (value) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      stopWatch();
      resolve(value);
    };
    const check = () => { const p = peekPull(id); if (p) finish(p); };
    stopWatch = onReadyChange(check);
    timer = setInterval(() => {
      if (!here() || !(heldOf(spec) > 0)) finish(null);
      else check();
    }, 250);
    check();
    (async () => {
      await Promise.race([economyIdle(), wait(IDLE_PATIENCE_MS)]);
      for (let attempt = 0; !done;) {
        if (offlineNow()) { await waitOnline(() => !done); continue; }
        try {
          await prepareNow(spec);
          check();
          if (!done) await wait(800);
        } catch (error) {
          if (String(error?.message) === 'NOT_HELD' && attempt >= 2) await refreshEconomy().catch(() => {});
          await wait(RETRY_WAITS[Math.min(attempt, RETRY_WAITS.length - 1)]);
        }
        attempt++;
      }
    })();
  });
}

async function runServerOpen(booster) {
  const spec = state.spec;
  const id = specId(spec);
  const pull = peekPull(id);
  if (pull) {
    if (!store.takeBooster(state.inventory, id)) return false;
    const cards = spec.kind === 'code' ? pull.cards : withPity(pull.cards, spec, predictedDry());
    return settleServerOpen(booster, spec, pull, cards);
  }
  return openArriving(booster, spec);
}

async function openArriving(booster, spec) {
  const id = specId(spec);
  if (!(heldOf(spec) > 0)) return false;
  const here = () => booster.isConnected && rip.booster === booster && state.spec === spec && el.openScreen.classList.contains('is-active');
  beginOpening(booster);
  let got = null;
  const waiting = waitForPull(spec, here).then((pull) => { got = pull; return pull; });
  const laying = layCards(booster, Math.max(1, Number(spec.cards) || 1), waiting).then(() => {
    if (got || !here()) return;
    layoutDeck();
    markArriving(0);
    arrivingHint(true);
  });
  const [pull] = await Promise.all([waiting, laying]);
  if (!here()) return 'taken';
  if (!pull || !store.takeBooster(state.inventory, id)) {
    arrivingHint(false);
    openFailed('TIMEOUT');
    return 'taken';
  }
  const cards = spec.kind === 'code' ? pull.cards : withPity(pull.cards, spec, predictedDry());
  startOpen(spec, pull, cards);
  state.openNonce = pull.nonce;
  const pulls = fileCards(spec, cards, pull.sizes);
  fitCards(cards.length);
  markArriving(cards.length);
  arrivingHint(false);
  presentPulls(pulls);
  return true;
}

async function runServerBatch(booster) {
  const spec = state.spec;
  const id = specId(spec);
  const want = Math.min(state.batch, heldOf(spec));
  const full = takeBatch(id, want);
  if (full && heldOf(spec) >= full.batch) {
    for (let i = 0; i < full.batch; i++) store.takeBooster(state.inventory, id);
    state.batch = full.batch;
    const cards = spec.kind === 'code' ? full.cards : batchPity(full.cards, spec, predictedDry(), full.sizes).cards;
    return settleServerOpen(booster, spec, full, cards);
  }
  return openGrowing(booster, spec, want);
}

function journalPull(run) {
  if (run.parts.length >= 2) return { nonce: batchNonce(run.parts), parts: [...run.parts], batch: run.parts.length, sizes: [...run.sizes], cards: run.cards };
  return { nonce: run.parts[0], cards: run.cards };
}

function addParts(run, pulls) {
  if (!run.growing) return 0;
  const fresh = (pulls ?? []).filter((p) => p?.nonce && Array.isArray(p.cards) && p.cards.length && !run.parts.includes(p.nonce)).slice(0, run.want - run.parts.length);
  const use = [];
  for (const p of fresh) {
    if (!store.takeBooster(state.inventory, run.id)) break;
    use.push(p);
  }
  if (!use.length) return 0;
  const sizes = use.map((p) => p.cards.length);
  const raw = use.flatMap((p) => p.cards);
  const shaped = run.spec.kind === 'code' ? { cards: raw, dry: run.dry } : batchPity(raw, run.spec, run.dry, sizes);
  run.dry = shaped.dry;
  run.parts.push(...use.map((p) => p.nonce));
  run.sizes.push(...sizes);
  run.cards.push(...shaped.cards);
  const pull = journalPull(run);
  const hold = run.parts.length < run.want;
  if (run.nonce) growOpen(run.nonce, pull, run.cards, { hold });
  else startOpen(run.spec, pull, run.cards, { hold });
  run.nonce = pull.nonce;
  state.openNonce = pull.nonce;
  run.queue.push(...fileCards(run.spec, shaped.cards, sizes));
  if (run.laid) flushParts(run);
  return use.length;
}

function flushParts(run) {
  if (!run.queue.length) return;
  const pulls = run.queue.splice(0);
  const from = state.pulls.length;
  state.pulls = [...state.pulls, ...pulls];
  fitCards(state.pulls.length, { keep: state.cards.length });
  pulls.forEach((pull, i) => {
    const card = state.cards[from + i];
    bindCard(card, pull);
    if (!card || fastOpen() || !card.classList.contains('is-arriving')) return;
    card.style.setProperty('--land-delay', `${Math.min(i * 22, 600)}ms`);
    card.classList.add('is-landed');
    card.addEventListener('animationend', function done(event) {
      if (event.animationName !== 'card-land') return;
      card.removeEventListener('animationend', done);
      card.classList.remove('is-landed');
    });
  });
  state.landed = run.parts.length;
  markArriving(state.pulls.length);
  if (run.growing && el.openHint.classList.contains('is-arriving')) el.openHint.textContent = arrivingText();
}

function showGrowing(run) {
  if (!state.pulls.length) return;
  if (el.openScreen.classList.contains('phase-opening')) {
    settleArrivals();
    el.openScreen.classList.replace('phase-opening', 'phase-reveal');
    el.openSkip.hidden = false;
    state.index = 0;
    layoutDeck();
    paintBatchTitle();
  }
  if (el.openScreen.classList.contains('phase-summary')) {
    for (let i = 0; i < state.pulls.length; i++) state.seen.add(i);
    paintSummary();
    return;
  }
  el.openProgress.textContent = t('batchProgress', { seen: state.seen.size, n: state.pulls.length });
  if (run.growing) arrivingHint(true);
  else if (state.seen.size < state.pulls.length) el.openHint.textContent = t('batchRevealHint');
}

function endGrowing(run) {
  run.growing = false;
  state.growing = false;
  if (run.nonce) releaseOpen(run.nonce);
  fitCards(state.pulls.length);
  markArriving(state.pulls.length);
  arrivingHint(false);
  if (run.parts.length) state.batch = run.parts.length;
  paintBatchTitle();
  paintQuick();
  if (!state.pulls.length) return;
  if (el.openScreen.classList.contains('phase-summary')) { paintSummary(); return; }
  el.openProgress.textContent = t('batchProgress', { seen: state.seen.size, n: state.pulls.length });
  layoutDeck();
  if (state.seen.size >= state.pulls.length) allSeen();
  else el.openHint.textContent = t('batchRevealHint');
}

async function openGrowing(booster, spec, want) {
  const id = specId(spec);
  const here = () => booster.isConnected && rip.booster === booster && state.spec === spec && el.openScreen.classList.contains('is-active');
  setReadyFocus(id);
  const run = { spec, id, want, parts: [], sizes: [], cards: [], queue: [], nonce: null, dry: predictedDry(), growing: true, laid: false };
  state.batch = want;
  state.growing = true;
  state.landed = 0;
  state.landTotal = want;
  state.pulls = [];
  beginOpening(booster);
  const laying = layCards(booster, want * Math.max(1, Number(spec.cards) || 1)).then(() => {
    run.laid = true;
    if (!here()) return;
    flushParts(run);
    markArriving(state.pulls.length);
    if (run.growing) arrivingHint(true);
    showGrowing(run);
  });
  addParts(run, readyList(id, want));
  const stopWatch = onReadyChange(() => {
    if (!run.growing || !here()) return;
    if (addParts(run, readyList(id, run.want - run.parts.length)) && run.laid) showGrowing(run);
  });
  try {
    for (let attempt = 0; run.parts.length < run.want && here() && attempt < PREPARE_TRIES;) {
      if (offlineNow()) { await waitOnline(here); continue; }
      if (attempt === 0) await Promise.race([economyIdle(), wait(IDLE_PATIENCE_MS)]);
      const missing = run.want - run.parts.length;
      try {
        const res = await prepareMany(spec, Math.min(PREPARE_ASK_MAX, Math.max(missing, heldOf(spec))));
        const allowed = Number(res?.want);
        if (Number.isFinite(allowed) && allowed < missing) run.want = run.parts.length + Math.max(0, allowed);
        state.landTotal = run.want;
        addParts(run, readyList(id, run.want - run.parts.length));
        if (run.laid && here()) showGrowing(run);
        if (res?.filling && run.parts.length < run.want) await landed(run, here, STREAM_PATIENCE_MS);
        attempt++;
        if (run.parts.length < run.want && attempt < PREPARE_TRIES) await wait(RETRY_WAITS[Math.min(attempt - 1, RETRY_WAITS.length - 1)]);
      } catch (error) {
        const code = String(error?.message ?? '');
        if (offlineNow()) continue;
        attempt++;
        if (code === 'NOT_HELD') {
          if (attempt >= 2) { await refreshEconomy().catch(() => {}); break; }
          await Promise.race([economyIdle(), wait(IDLE_PATIENCE_MS)]);
          continue;
        }
        if (/^[A-Z_]+$/.test(code) && !RETRY_CODES.has(code)) break;
        await wait(RETRY_WAITS[Math.min(attempt - 1, RETRY_WAITS.length - 1)]);
      }
    }
    await laying;
  } finally {
    stopWatch();
    endGrowing(run);
  }
  if (!here()) return 'taken';
  if (!run.parts.length) { openFailed(navigator.onLine === false ? 'OFFLINE' : 'TIMEOUT'); return 'taken'; }
  showGrowing(run);
  return true;
}

async function settleServerOpen(booster, spec, pull, cards) {
  startOpen(spec, pull, cards);
  state.openNonce = pull.nonce;
  const pulls = fileCards(spec, cards, pull.sizes);
  keepPictures(cards.slice(0, 6).map((c) => c.article?.thumbnail), { soon: true });
  beginOpening(booster);
  await layCards(booster, cards.length);
  if (state.spec !== spec || rip.booster !== booster) return 'taken';
  presentPulls(pulls);
  return true;
}

export const CARD_FRONT_MARKUP = `
  <div class="fx fx-a" aria-hidden="true"></div>
  <div class="fx-code" aria-hidden="true"></div>
  <div class="fx-art" aria-hidden="true"></div>
  <div class="card-art"></div>
  <div class="card-body">
    <h3 class="card-title"></h3>
    <p class="card-desc"></p>
    <p class="card-extract"></p>
  </div>
  <div class="card-stats"><span class="card-price"></span><span class="card-views"></span></div>
  <div class="card-footer"><span class="rarity-badge"></span></div>
  <div class="fx-p" aria-hidden="true"></div>
  <div class="fx fx-b" aria-hidden="true"></div>
  <div class="fx fx-c" aria-hidden="true"></div>
  <div class="fx fx-v" aria-hidden="true"></div>
  <div class="fx-ring" aria-hidden="true"></div>`;

let blank = null;

export function buildPlaceholderCard(index, total) {
  if (blank?.spec !== state.spec) {
    const card = document.createElement('div');
    card.className = 'card stack-card';
    const inner = document.createElement('div');
    inner.className = 'card-inner';
    inner.appendChild(buildCardBack(state.spec));
    const front = document.createElement('div');
    front.className = 'card-face card-front';
    front.innerHTML = CARD_FRONT_MARKUP;
    inner.appendChild(front);
    card.appendChild(inner);
    blank = { spec: state.spec, card };
  }
  const card = document.importNode(blank.card, true);
  card.style.zIndex = String(total - index);
  return card;
}

export function applyRarityVars(node, rarity) {
  node.dataset.rarity = rarity.id;
  node.style.setProperty('--rarity', rarity.color);
  node.style.setProperty('--rarity-glow', rarity.glow);
  const chosen = rarity.id === SPECIAL_RARITY_ID ? DEFAULT_FX : (state.cardFx[rarity.id] ?? DEFAULT_FX);
  if (chosen && chosen !== DEFAULT_FX) node.dataset.fx = chosen;
  else delete node.dataset.fx;
}

export function fillFront(front, data, rarity, { ownedTag = false, lazy = false } = {}) {
  const art = front.querySelector('.card-art');
  front.closest('.card')?.toggleAttribute('data-adult', isMature(data));
  art.replaceChildren();
  art.classList.remove('is-small-art', 'is-no-art');
  const fallback = () => {
    art.classList.add('is-no-art');
    art.insertAdjacentHTML('afterbegin',
      `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 38 })}</div>`);
  };

  if (data.thumbnail) {
    const img = document.createElement('img');
    img.alt = '';
    if (lazy) { img.loading = 'lazy'; img.decoding = 'async'; }
    if (!lazy && !pictureKept(data.thumbnail)) {
      img.classList.add('is-loading');
      const shown = () => img.classList.remove('is-loading');
      img.addEventListener('load', shown, { once: true });
      img.addEventListener('error', shown, { once: true });
    }
    showPicture(img, data.thumbnail, () => { img.remove(); fallback(); });
    img.addEventListener('load', () => {
      if (img.naturalWidth && img.naturalWidth < 220) art.classList.add('is-small-art');
    });
    art.appendChild(img);
  } else {
    fallback();
  }
  dressFront(front, data, rarity);
  const shell = front.closest('.card');
  if (shell) {
    if (data.special) shell.dataset.special = skinOf(data) ?? 'special';
    else delete shell.dataset.special;
  }

  front.querySelector('.card-title').textContent = data.title;
  if (ownedTag && data.key && state.collection.entries[data.key]) {
    const tag = document.createElement('span');
    tag.className = 'owned-tag';
    tag.textContent = t('ownedTag');
    front.querySelector('.card-title').appendChild(tag);
  }
  front.querySelector('.card-desc').textContent = data.description || data.sourceName || '';
  front.querySelector('.card-extract').textContent = data.extract;
  front.querySelector('.rarity-badge').textContent = tx(rarity.name);
  front.querySelector('.card-price').innerHTML = money(data.price);
  front.querySelector('.card-views').textContent = data.creator || data.sourceId === 'special' ? ''
    : data.views ? t('viewsPerMonth', { views: formatViews(data.views) }) : bandFor(data.popularity ?? 0).name;
}

export function dressFront(front, data, rarity) {
  const particles = front.querySelector('.fx-p');
  const code = front.querySelector('.fx-code');
  particles?.replaceChildren();
  code?.replaceChildren();
  front.style.setProperty('--art',
    data.thumbnail ? `url("${String(data.thumbnail).replace(/["\\]/g, '\\$&')}")` : 'none');
  const RISERS = {
    legendary: [6, { d: [4.5, 7.5] }],
    mythic: [8, { d: [3, 5.5], s: [2, 3], c: ['#ffb347', '#ff5a1f'] }],
    uncommon: [9, { d: [5, 9] }],
    rare: [7, { d: [5, 9] }],
    epic: [7, { d: [5, 8.5] }],
    prismatic: [9, { d: [3.5, 6.5] }]
  };
  if (RISERS[rarity.id] && particles) {
    particles.replaceChildren(...sparks(RISERS[rarity.id][0], RISERS[rarity.id][1]));
  } else if (rarity.id === 'exotic' && code) {
    const lines = wikitextLines(data);
    code.replaceChildren(...[['6%', '14s'], ['38%', '19s'], ['70%', '11s']].map(([x, d], i) => {
      const col = document.createElement('span');
      col.className = 'col';
      col.style.setProperty('--x', x);
      col.style.setProperty('--d', d);
      const text = Array.from({ length: 14 }, (_, k) => lines[(k * 5 + i * 3) % lines.length]).join('\n');
      col.textContent = `${text}\n${text}`;
      return col;
    }));
  }
}

export function sparks(n, { d, s = null, c = null }) {
  const between = (a, b, dp = 1) => (a + Math.random() * (b - a)).toFixed(dp);
  return Array.from({ length: n }, (_, i) => {
    const spark = document.createElement('i');
    spark.style.setProperty('--x', `${between(6, 94, 0)}%`);
    spark.style.setProperty('--d', `${between(d[0], d[1])}s`);
    spark.style.setProperty('--delay', `-${between(0, 8)}s`);
    spark.style.setProperty('--sx', `${between(-6, 6, 0)}px`);
    if (s) spark.style.setProperty('--s', `${between(s[0], s[1])}px`);
    if (c) spark.style.setProperty('--c', c[i % c.length]);
    return spark;
  });
}

export function wikitextLines(data) {
  const title = String(data.title ?? '');
  const desc = String(data.description || data.sourceName || '');
  const words = String(data.extract ?? '').split(/\s+/).filter(Boolean);
  const run = (i, n = 3) => words.slice(i, i + n).join(' ') || title;
  const cut = (line) => (line.length > 22 ? `${line.slice(0, 21)}\u2026` : line);
  return [
    '{{Infobox', `| name = ${title}`, `| type = ${desc}`, `| views = ${data.views ?? '?'}`, '}}',
    `'''${title}''' is`, run(3), `<ref name="${title.toLowerCase().replace(/\s+/g, '')}">`,
    `{{cite web|url=${data.url ?? ''}}}`, '</ref>', '== History ==', run(8),
    `[[Category:${desc}]]`, `{{Main|${title}}}`, `[[File:${title}.jpg|thumb]]`, run(13),
    '== See also ==', `* [[${run(18, 2)}]]`
  ].map(cut);
}

export function favButtonNode() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fav-button';
  button.setAttribute('aria-pressed', 'false');
  return button;
}

export function wireFavButton(button, entryKey, { size = 16 } = {}) {
  const paint = () => {
    const on = Boolean(state.collection.entries[entryKey]?.favorite);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', t('favourites'));
    button.innerHTML = iconSvg(on ? 'starFilled' : 'star', { size });
  };
  paint();
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const on = store.toggleFavorite(state.collection, entryKey);
    if (serverEconomy()) econ('favorite', { key: entryKey, on }).catch(() => {});
    synth.playFav(on);
    paint();
    synth.playTap();
    if (state.tab === 'binder') renderBinder();
  });
}

export function bindCard(card, pull) {
  if (!card || !pull) return;
  applyRarityVars(card, pull.rarity);
  const front = card.querySelector('.card-front');
  const data = { ...pull.article, price: pull.price, packIcon: pull.packIcon };
  fillFront(front, data, pull.rarity);
  card.querySelector(':scope > .fav-button')?.remove();
  wireFavButton(card.appendChild(favButtonNode()), pull.article.key);
  card.addEventListener('click', () => {
    if (!card.classList.contains('is-revealed')) return;
    openCardDetail(pull.article.key, data, pull.rarity);
  });
}

export function bindCards(pulls) {
  if (state.cards.length > pulls.length) {
    for (const spare of state.cards.slice(pulls.length)) spare.remove();
    state.cards = state.cards.slice(0, pulls.length);
  }
  state.cards.forEach((card, i) => bindCard(card, pulls[i]));
}

let deckLayout = null;

export function useDeckLayout(fn) {
  deckLayout = fn;
}

export function layoutDeck() {
  if (state.batch && el.openScreen.classList.contains('is-batch')) { gridDeck(); return; }
  if (deckLayout) { deckLayout(); return; }
  stackDeck();
}

export function gridDeck() {
  const summary = el.openScreen.classList.contains('phase-summary');
  state.cards.forEach((card, i) => {
    card.style.removeProperty('transform');
    card.style.removeProperty('opacity');
    card.style.zIndex = '';
    card.classList.toggle('is-focus', !summary && i === state.index && state.seen.has(i));
  });
}

export function stackDeck() {
  state.cards.forEach((card, i) => {
    const offset = i - state.index;
    if (offset < 0) {
      card.style.zIndex = String(100 + offset);
      card.style.transform = 'translateX(128%) rotate(13deg) scale(0.94)';
      card.style.opacity = '0';
      tilt.forget(card);
      return;
    }
    const depth = Math.min(3, offset);
    card.style.zIndex = String(50 - offset);
    card.style.opacity = '1';
    card.style.transform =
      `translate(${depth * 5}px, ${depth * 9}px) rotate(${depth * 1.3}deg) ` +
      `scale(${(1 - depth * 0.04).toFixed(3)})`;
  });
}

export async function revealCurrent() {
  const card = state.cards[state.index];
  const pull = state.pulls[state.index];
  if (!card || !pull) return;

  const isNew = !state.seen.has(state.index);
  card.classList.add('is-revealed', 'is-lit');
  if (state.batch) {
    el.openProgress.textContent = t('batchProgress', { seen: state.seen.size + (isNew ? 1 : 0), n: state.pulls.length });
    if (isNew) card.scrollIntoView?.({ block: 'nearest', behavior: fastOpen() ? 'auto' : 'smooth' });
  } else {
    el.openProgress.textContent = t('cardOf', {
      i: Math.min(state.index + 1, state.pulls.length), n: state.pulls.length
    });
    tilt.watch(card);
  }

  if (isNew) {
    state.seen.add(state.index);
    synth.playReveal(rarityRank(pull.rarity.id));
    buzz(8 + rarityRank(pull.rarity.id) * 6);
    if (pull.rarity.flash > 0) {
      el.flash.style.setProperty('--flash-tint', pull.rarity.color);
      fireFlash(pull.rarity.flash);
    }
    if (rarityRank(pull.rarity.id) >= 4) {
      const stage = el.burstLayer.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      spawnBurst(rarityBurst(pull.rarity), {
        x: rect.left + rect.width / 2 - stage.left,
        y: rect.top + rect.height / 2 - stage.top
      }, { scale: 0.8 + rarityRank(pull.rarity.id) * 0.16 });
    }
  }

  if (state.batch) gridDeck();

  if (state.seen.size >= state.pulls.length && !state.growing) {
    allSeen();
  } else if (state.batch) {
    el.openHint.textContent = state.growing && state.seen.size >= state.pulls.length ? arrivingText() : t('batchRevealHint');
  } else {
    el.openHint.textContent = state.index === 0 ? t('swipeToReveal') : t('swipeEitherWay');
  }
}

function allSeen() {
  unhushOpen();
  el.openHint.textContent = state.batch ? t('batchRevealDone') : t('swipeToSummary');
  clearTimeout(state.summaryTimer);
  state.summaryTimer = setTimeout(() => {
    if (state.seen.size >= state.pulls.length && !state.growing) showSummary();
  }, LAST_CARD_HOLD);
}

export function goTo(index) {
  const last = state.pulls.length - 1;
  if (index > last && state.seen.size >= state.pulls.length) { showSummary(); return; }
  const next = clamp(index, 0, last);
  if (next === state.index && (!state.batch || state.seen.has(next))) { layoutDeck(); return; }
  state.index = next;
  layoutDeck();
  synth.playFlip();
  revealCurrent();
}

export function skipToSummary() {
  if (!el.openScreen.classList.contains('phase-reveal') || !state.pulls.length) return;
  synth.playTap();
  for (let i = 0; i < state.pulls.length; i++) state.seen.add(i);
  showSummary();
}

export function showSummary() {
  if (el.openScreen.classList.contains('phase-summary')) return;
  clearTimeout(state.summaryTimer);
  for (const card of state.cards) tilt.forget(card);
  el.openSkip.hidden = true;
  el.openScreen.classList.replace('phase-reveal', 'phase-summary');
  paintSummary({ animate: true });
  el.openDone.textContent = t('back');
  el.openDone.hidden = false;
  paintQuick();
  unhushOpen();
  setTimeout(drainLevelUps, 700);
}

let summaryGrid = null;

export function paintSummary({ animate = false } = {}) {
  const shown = state.batch
    ? state.pulls.map((pull, i) => ({ pull, i })).sort((a, b) => rarityRank(b.pull.rarity.id) - rarityRank(a.pull.rarity.id) || a.i - b.i).map((x) => x.pull)
    : state.pulls;
  const make = (pull) => {
    const data = { ...pull.article, price: pull.price, packIcon: pull.packIcon };
    const card = buildStaticCard(data, pull.rarity, pull.article.key);
    card.classList.add('is-mini');
    return card;
  };
  if (!summaryGrid) {
    summaryGrid = new Progressive(el.summary, { chunk: 36, start: 48, small: 72, idle: 2000, margin: 900 });
    summaryGrid.root = el.summary;
  }
  const top = animate ? 0 : el.summary.scrollTop;
  summaryGrid.set([{ items: shown }], { make, first: animate ? 48 : Math.max(48, summaryGrid.built) });
  el.summary.scrollTop = top;
  if (animate) reveal(el.summary.querySelectorAll(':scope > .card'), { step: state.batch ? Math.max(8, Math.round(700 / state.pulls.length)) : 70, from: 20 });
  if (state.batch) for (const card of state.cards) if (!card.classList.contains('is-arriving')) card.classList.add('is-revealed', 'is-lit');
  el.openProgress.textContent = state.batch ? t('batchSummary', { n: state.pulls.length, boosters: state.batch }) : t('packSummary', { n: state.pulls.length });
  el.openHint.textContent = state.growing ? arrivingText() : t('packDone');
}

export function initSwipe() {
  el.openPrev.innerHTML = iconSvg('chevronLeft', { size: 20 });
  el.openNext.innerHTML = `<span style="display:inline-block;transform:scaleX(-1)">${iconSvg('chevronLeft', { size: 20 })}</span>`;
  [el.openPrev, el.openNext].forEach((btn) => press(btn, { sound: null }));
  el.openPrev.addEventListener('click', () => { synth.resume(); goTo(state.index - 1); });
  el.openNext.addEventListener('click', () => { synth.resume(); goTo(state.index + 1); });

  el.cardStack.addEventListener('click', (event) => {
    if (!state.batch || !el.openScreen.classList.contains('phase-reveal')) return;
    const card = event.target.closest('.stack-card');
    const i = card ? state.cards.indexOf(card) : -1;
    if (i < 0 || i >= state.pulls.length || card.classList.contains('is-revealed') || card.classList.contains('is-arriving')) return;
    event.stopPropagation();
    synth.resume();
    goTo(i);
  });

  el.cardStack.addEventListener('pointerdown', (event) => {
    if (!el.openScreen.classList.contains('phase-reveal') || !state.cards.length || state.batch) return;
    const card = state.cards[state.index];
    card?.classList.add('is-dragging');
    synth.resume();

    trackDrag(event, {
      onMove: (dx, dy) => { if (card) tilt.hold(card, dx / TILT_REACH, dy / TILT_REACH); },
      onEnd: (dx) => {
        card?.classList.remove('is-dragging');
        if (card) tilt.release(card);
        if (dx <= -SWIPE_COMMIT) goTo(state.index + 1);
        else if (dx >= SWIPE_COMMIT) goTo(state.index - 1);
        else layoutDeck();
      }
    });
  });

  el.openFast?.addEventListener('click', () => { synth.resume(); setFastOpen(!settings().skipOpening); synth.playToggle(Boolean(settings().skipOpening)); });
  el.openAll?.addEventListener('click', () => { synth.resume(); toggleBatch(); });

  document.addEventListener('keydown', (event) => {
    if (!el.openScreen.classList.contains('phase-reveal')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(state.index + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(state.index - 1); }
  });
}

export function fireFlash(intensity, tint = null) {
  if (!settings().flash) return;
  el.flash.style.setProperty('--flash-peak', String(intensity));
  if (tint) el.flash.style.setProperty('--flash-tint', tint);
  el.flash.classList.remove('is-firing');
  void el.flash.offsetWidth;
  el.flash.classList.add('is-firing');
}

export function awardXp(pulls) {
  const gained = pulls.reduce((sum, pull) => sum + xpForCard(pull.rarity.id), 0);
  const levels = addXp(state.profile.progress, gained);
  if (levels.length) state.profile.pendingLevels.push(...levels);
  store.saveProfile(state.profile);
  showXpPop(gained);
  refreshLevelBadge();
}

export let xpPopTimer = null;

let heldXp = 0;

export function showXpPop(amount) {
  if (!(amount > 0)) return;
  if (hushing()) {
    heldXp += amount;
    afterReveal(() => { const n = heldXp; heldXp = 0; popXp(n); }, 'xp');
    return;
  }
  popXp(amount);
}

function popXp(amount) {
  if (!(amount > 0)) return;
  synth.playXp();
  el.xpPop.textContent = t('xpGained', { n: amount.toLocaleString() });
  el.xpPop.hidden = false;
  el.xpPop.classList.remove('is-rising');
  void el.xpPop.offsetWidth;
  el.xpPop.classList.add('is-rising');
  clearTimeout(xpPopTimer);
  xpPopTimer = setTimeout(() => {
    el.xpPop.classList.remove('is-rising');
    el.xpPop.hidden = true;
  }, 1500);
}

export function drainLevelUps() {
  const pending = cleanPending(state.profile.pendingLevels);
  if (pending.length !== (state.profile.pendingLevels ?? []).length) state.profile.pendingLevels = pending;
  const level = pending[0];
  if (level == null) return false;
  if (hushing()) { afterReveal(() => { drainLevelUps(); }, 'levelup'); return true; }
  showLevelUp(level);
  return true;
}

export function rewardCard(reward, { art = true, inkAmount = 0 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'reward-card';
  if (reward.spec && art) {
    const artBox = document.createElement('div');
    artBox.appendChild(buildBooster(reward.spec, { size: 'is-tiny' }));
    wrap.appendChild(artBox);
  }
  const label = document.createElement('p');
  label.className = 'reward-label';
  if (reward.type === 'both') label.innerHTML = t('rewardBoth', { amount: money(reward.coins) });
  else if (reward.coins) label.innerHTML = t('rewardCoins', { amount: money(reward.coins) });
  else label.textContent = specName(reward.spec);
  wrap.appendChild(label);
  if (inkAmount > 0) {
    const drop = document.createElement('p');
    drop.className = 'reward-ink';
    drop.innerHTML = t('rewardInk', { amount: ink(inkAmount) });
    wrap.appendChild(drop);
  }
  return wrap;
}

export function showLevelUp(level) {
  const reward = rewardForLevel(level);
  const rank = rankFor(level);

  openSheet(t('levelUpTitle'), (body) => {
    body.innerHTML = `
      <div class="level-jump">
        <span class="level-node"></span>
        <span class="level-bar"></span>
        <span class="level-node is-new"></span>
      </div>
      <p style="text-align:center"></p>
      <div class="level-reward" style="margin:16px 0 18px"></div>
      <button class="btn btn-primary btn-block" type="button"></button>`;

    body.querySelector('.level-node').textContent = String(level - 1);
    body.querySelector('.level-node.is-new').textContent = String(level);
    body.querySelector('p').textContent = t('levelUpBody', { level, rank: tx(rank.name) });
    body.querySelector('.level-reward').appendChild(rewardCard(reward, { inkAmount: inkForLevel(level) }));

    const bar = new Bar(body.querySelector('.level-bar'));
    bar.set(0, { animate: false });
    requestAnimationFrame(() => bar.set(1));

    const claim = body.querySelector('button');
    claim.textContent = t('claimReward');
    press(claim, { sound: null });
    claim.addEventListener('click', () => claimLevel(level, reward));
    if (new Set(state.profile.pendingLevels ?? []).size >= 2) {
      import('./levelclaims.js').then((m) => { const all = m.levelClaimAll(); if (all && claim.isConnected) claim.after(all); }).catch(() => {});
    }
  }, { dismissible: false });

  synth.playLevelUp();
}

export async function claimLevel(level, reward) {
  if (serverEconomy()) {
    try {
      await econ('level', { level });
    } catch (error) {
      if (String(error?.message) !== 'NOT_EARNED') { toast(t('econFailed'), 'error'); return; }
      await econ('sync', {}, { quiet: true }).catch(() => {});
    }
    if (reward.spec) ensureReady(reward.spec);
  } else {
    if (reward.coins) store.saveWallet(store.loadWallet() + reward.coins);
    if (reward.spec) gainBooster(reward.spec, 1);
    addInk(inkForLevel(level));
    state.profile.pendingLevels = state.profile.pendingLevels.filter((l) => l !== level);
    store.saveProfile(state.profile);
  }
  refreshWallet();
  refreshLevelBadge();
  renderPacks();
  synth.playCoins();
  live.sheet.hide({ silent: true, force: true });

  setTimeout(() => {
    if (!drainLevelUps() && state.tab === 'profile') renderProfile();
  }, dur(360));
}
