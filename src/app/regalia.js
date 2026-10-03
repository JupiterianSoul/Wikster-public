import { DEFAULT_FRAME_STYLE, frameTier } from '../framemeta.js';
import { noteIn } from '../ledger.js';
import * as store from '../collection.js';
import * as account from '../account.js';
import { atMaxLevel, levelFraction, levelOf } from '../progression.js';
import { t } from '../i18n.js';
import { Ring } from '../ui/components.js';
import { el, state } from './core.js';
import { paintBell, pushNote } from './drawer.js';
import { paintInbox } from './inbox.js';
import { signedIn, userId } from './gate.js';
import { live } from './live.js';
import { afterReveal } from './hush.js';

export function frameStyle() {
  return (state.account?.profile?.avatar?.frame?.style ?? state.frameStyle ?? DEFAULT_FRAME_STYLE);
}

let frameArt = null;
let frameArtLoading = null;
const framesWaiting = new Set();

function loadFrameArt() {
  frameArtLoading ??= import('../frames.js').then((m) => {
    frameArt = m;
    for (const overlay of framesWaiting) {
      const [styleId, tier] = String(overlay.dataset.frame ?? '').split(':');
      overlay.innerHTML = m.frameSvg(styleId, Number(tier));
    }
    framesWaiting.clear();
  }).catch(() => { frameArtLoading = null; });
  return frameArtLoading;
}

export function paintFrameInto(node, styleId, tier) {
  let overlay = node.querySelector(':scope > .frame-overlay');
  if (!(tier >= 1)) { overlay?.remove(); return; }
  if (!overlay) {
    overlay = document.createElement('span');
    overlay.className = 'frame-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    node.appendChild(overlay);
  }
  const stamp = `${styleId}:${tier}`;
  if (overlay.dataset.frame === stamp) return;
  overlay.dataset.frame = stamp;
  if (frameArt) { overlay.innerHTML = frameArt.frameSvg(styleId, tier); return; }
  overlay.innerHTML = '';
  framesWaiting.add(overlay);
  loadFrameArt();
}

export function frameStage(styleId, { size = 56, width = 4 } = {}) {
  const progress = state.profile.progress ?? {};
  const level = levelOf(progress);
  const node = document.createElement('span');
  node.className = 'frame-stage';
  node.setAttribute('aria-hidden', 'true');
  const ring = new Ring(node, { size, width });
  ring.fill.style.strokeDashoffset = String(ring.circumference * (1 - Math.min(Math.max(levelFraction(progress) || 0, 0), 1)));
  ring.label.textContent = String(level);
  paintFrameInto(node, styleId, frameTier(level));
  return node;
}

export function pickFrameStyle(styleId) {
  state.frameStyle = styleId;
  store.saveFrameStyle(styleId);
  if (noteIn(state.profile, 'framesWorn', styleId, 64)) store.saveProfile(state.profile);
  if (state.account?.profile) {
    state.account.profile.avatar = { ...(state.account.profile.avatar ?? {}), frame: { style: styleId } };
  }
  refreshLevelBadge();
  if (signedIn() && account.socialSchemaReady()) {
    const merged = { ...(state.account.profile?.avatar ?? {}), frame: { style: styleId } };
    account.updateProfileFields(userId(), { avatar: merged })
      .then(() => { if (state.account.profile) state.account.profile.avatar = merged; })
      .catch((error) => console.error('frame sync failed:', error?.message ?? error));
  }
}

export function refreshLevelBadge() {
  afterReveal(paintLevelBadge, 'levelBadge');
}

function paintLevelBadge() {
  const progress = state.profile.progress;
  const level = levelOf(progress);
  const atMax = atMaxLevel(progress);
  live.levelRing.set(levelFraction(progress), String(level));
  el.levelBadge.classList.toggle('is-max', atMax);
  el.levelBadge.setAttribute('aria-label', atMax ? t('levelMaxNote', { n: level }) : t('profileLevel', { n: level }));
  paintFrameInto(el.levelBadge, frameStyle(), frameTier(level));
}

export function updateBadges() {
  const timed = state.profile.timed.count ?? 0;
  live.nav.setBadge('timed', timed ? String(timed) : '');
  const held = Object.values(state.inventory ?? {})
    .reduce((n, slot) => n + (slot.count ?? 0), 0);
  live.nav.setBadge('packs', held ? String(held) : '');
  const achReady = achRedeemableCount();
  if (achReady != null) {
    if (state.lastAchReady != null && achReady > state.lastAchReady) {
      afterReveal(() => pushNote('trophy', t('notifAchReady', { n: achReady }), 'ach'), 'achReady');
    }
    state.lastAchReady = achReady;
  }
  paintBell();
  paintInbox();
}

let honours = null;
let honoursLoading = null;

export function loadHonours() {
  honoursLoading ??= import('./honours.js')
    .then((m) => { honours = m; return m; })
    .catch((error) => { honoursLoading = null; throw error; });
  return honoursLoading;
}

export const achRedeemableCount = () => honours?.achRedeemableCount() ?? null;
