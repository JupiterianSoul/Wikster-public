import { el, navTabFor, showScreen, state } from './core.js';
import { live } from './live.js';
import { closeDrawer } from './drawer.js';
import { skipToSummary } from './open.js';
import { renderFriends } from './social.js';
import { on } from '../ui/bus.js';
import { updateLocked } from './update.js';

const HOME = 'packs';
const PARENT = { friend: 'friends', chat: 'friends', wikdle: 'games', duel: 'games', reveal: 'games', versus: 'games' };

const bridge = () => (typeof window !== 'undefined' ? window.WiksterBack : null);

const openPhase = (name) => el.openScreen?.classList.contains(`phase-${name}`);

function screenNow() {
  const active = Object.entries(el.screens).find(([, node]) => node.classList.contains('is-active'));
  return active?.[0] ?? state.tab;
}

function parentOf(screen) {
  if (screen === 'chat' && state.chatFrom === 'discussions') return 'discussions';
  if (PARENT[screen]) return PARENT[screen];
  const tab = navTabFor(screen);
  if (tab !== screen) return tab;
  return screen === HOME ? null : HOME;
}

export function canGoBack() {
  if (updateLocked()) return true;
  if (!el.drawer.hidden) return true;
  if (live.sheet?.open) return true;
  if (!el.gate.hidden || !el.welcome.hidden) return false;
  if (document.querySelector('.tour:not([hidden])')) return false;
  const screen = screenNow();
  if (screen === 'open') return true;
  return parentOf(screen) != null;
}

export function goBack() {
  if (updateLocked()) return true;
  if (!el.drawer.hidden) { closeDrawer(); return true; }
  if (live.sheet?.open) { live.sheet.hide(); return true; }
  if (!canGoBack()) return false;
  const screen = screenNow();
  if (screen === 'open') {
    if (openPhase('reveal')) skipToSummary();
    else if (!openPhase('opening')) el.openBack?.click();
    return true;
  }
  const parent = parentOf(screen);
  if (!parent) return false;
  if (screen === 'friend') { state.viewing = null; renderFriends(); }
  if (parent === 'discussions') { import('./inbox.js').then((m) => m.openTarget('discussions')); return true; }
  if (parent === 'friends') renderFriends();
  showScreen(parent);
  return true;
}

let armed = null;

export function syncBack() {
  const b = bridge();
  if (!b?.armed) return;
  const now = canGoBack();
  if (now === armed) return;
  armed = now;
  try { b.armed(now); } catch {}
}

export function initBack() {
  window.wiksterBack = () => {
    const done = goBack();
    queueMicrotask(syncBack);
    return done;
  };
  if (!bridge()) return;
  addEventListener('wikster:update-lock', () => syncBack());
  on('screen', () => queueMicrotask(syncBack));
  const watch = new MutationObserver(() => syncBack());
  for (const node of [el.drawer, el.sheet, el.gate, el.welcome, el.openScreen]) {
    if (node) watch.observe(node, { attributes: true, attributeFilter: ['hidden', 'class'] });
  }
  syncBack();
}
