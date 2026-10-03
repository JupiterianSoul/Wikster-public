import * as store from '../collection.js';
import { rarityById } from '../data/rarities.js';
import { synth } from '../ui/sound.js';
import * as account from '../account.js';
import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { trackDrag } from '../ui/components.js';
import { printsOf, sortedPrints, sparesOf } from '../econ/rules.js';
import { TILT_REACH, clamp, esc, settings, state, toast } from './core.js';
import { signedIn, userId } from './gate.js';
import { CARD_FRONT_MARKUP, applyRarityVars, favButtonNode, fillFront, wireFavButton } from './open.js';

export function wishSnapshot(data) {
  return {
    key: data.key, title: data.title, rarityId: data.rarityId ?? null,
    price: data.price ?? null, views: data.views ?? null,
    thumbnail: data.thumbnail ?? null, lang: data.lang ?? null
  };
}

export function toggleWish(data) {
  if (!data?.key) return false;
  const on = !state.wishlist.has(data.key);
  if (on) state.wishlist.set(data.key, wishSnapshot(data));
  else state.wishlist.delete(data.key);
  store.saveWishlist([...state.wishlist.values()]);
  synth.playFav(on);
  if (signedIn()) {
    account.wishlistSet(userId(), wishSnapshot(data), on).catch(() => {});
  }
  return on;
}

export function wireWishButton(button, data) {
  const paint = () => {
    const on = state.wishlist.has(data.key);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', t('wishTitle'));
    button.innerHTML = iconSvg('wish', { size: 15 });
  };
  paint();
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const on = toggleWish(data);
    toast(t(on ? 'wishAdded' : 'wishRemoved', { card: esc(data.title) }), 'ok');
    paint();
  });
}

export async function refreshWishes() {
  if (!signedIn() || !account.indexSchemaReady()) return;
  try {
    const mine = await account.wishlistMine(userId());
    state.wishlist = new Map(mine.map((row) => [row.key, row.card]));
    store.saveWishlist([...state.wishlist.values()]);
  } catch {}
  try {
    const ids = state.social.friends.map((f) => f.otherId);
    state.friendWishes = await account.friendsWishes(ids,
      (id) => state.social.friends.find((f) => f.otherId === id)?.profile?.username ?? null);
  } catch {}
}

export const litWatcher = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) {
        target.classList.add('is-lit');
        if (!target.dataset.tilted) { target.dataset.tilted = '1'; attachTilt(target); }
        tilt.watch(target);
      } else {
        if (target.closest('.is-away')) continue;
        target.classList.remove('is-lit');
        tilt.forget(target);
      }
    }
  }, { rootMargin: '80px 0px', threshold: 0.05 })
  : null;

export function forgetCards(root) {
  if (!root) return;
  for (const node of root.querySelectorAll('.card')) {
    litWatcher?.unobserve(node);
    tilt.forget(node);
  }
}

export function lightWhenVisible(card) {
  if (!litWatcher) { card.classList.add('is-lit'); return; }
  litWatcher.observe(card);
}

export function buildStaticCard(data, rarity, entryKey = null, { fav = true, lit = 'auto', ownedTag = false, wish = true } = {}) {
  const card = document.createElement('article');
  card.className = `card is-revealed${lit === true ? ' is-lit' : ''}`;
  applyRarityVars(card, rarity);
  card.innerHTML = `<div class="card-inner"><div class="card-face card-front">${CARD_FRONT_MARKUP}</div></div>`;
  const front = card.querySelector('.card-front');
  fillFront(front, data, rarity, { ownedTag, lazy: true });
  if (fav && entryKey) wireFavButton(card.appendChild(favButtonNode()), entryKey);
  if (wish && data.key && !data.creator && data.sourceId !== 'special') {
    const wishButton = document.createElement('button');
    wishButton.type = 'button';
    wishButton.className = `wish-button${fav && entryKey ? '' : ' is-alone'}`;
    card.appendChild(wishButton);
    wireWishButton(wishButton, data);
  }
  if (entryKey) card.addEventListener('click', () => openCardDetail(entryKey, data, rarity));
  if (lit === true) { attachTilt(card); queueMicrotask(() => tilt.watch(card)); }
  else if (lit === 'auto') lightWhenVisible(card);
  return card;
}

let sheet = null;

export const loadCardSheet = () => (sheet ??= import('./cardsheet.js').catch((error) => { sheet = null; throw error; }));

export function openCardDetail(entryKey, data, rarity) {
  return loadCardSheet().then((m) => m.openCardDetail(entryKey, data, rarity), () => null);
}

export const mixedPrints = (entry) => Object.keys(printsOf(entry)).length > 1;

export function sparesText(entry) {
  return sortedPrints(sparesOf(entry)).map(([id, n]) => `${n} ${tx(rarityById(id).name)}`).join(', ');
}

export function printsBadge(entry) {
  if (!entry || !mixedPrints(entry)) return null;
  const badge = document.createElement('span');
  badge.className = 'prints-badge';
  badge.title = t('printsSpares', { list: sparesText(entry) });
  for (const [id, n] of sortedPrints(sparesOf(entry))) {
    const dot = document.createElement('i');
    dot.style.setProperty('--rarity', rarityById(id).color);
    dot.textContent = String(n);
    badge.appendChild(dot);
  }
  return badge;
}

const SWAY_FRAME_MS = 30;

export const tilt = {
  cards: new Map(),
  gyro: null,
  raf: 0,
  drawnAt: 0,
  asked: false,
  listening: false,
  reduce: matchMedia('(prefers-reduced-motion: reduce)'),

  watch(card) {
    if (this.cards.has(card)) return;
    this.cards.set(card, { tx: 0, ty: 0, drag: null, phase: Math.random() * Math.PI * 2 });
    this.wake();
  },
  forget(card) {
    this.cards.delete(card);
    card.style.removeProperty('--tilt-x');
    card.style.removeProperty('--tilt-y');
  },
  hold(card, tx, ty) {
    const c = this.cards.get(card);
    if (!c) return;
    c.drag = { tx: clamp(tx, -1, 1), ty: clamp(ty, -1, 1) };
    this.wake();
  },
  release(card) {
    const c = this.cards.get(card);
    if (c) c.drag = null;
    this.wake();
  },
  wake() {
    if (!this.raf && !document.hidden && this.cards.size) {
      this.raf = requestAnimationFrame((now) => this.frame(now));
    }
  },
  frame(now) {
    this.raf = 0;
    const lowPower = document.documentElement.dataset.lowpower === '1';
    const pc = document.documentElement.classList.contains('is-pc');
    const sway = !lowPower && !this.reduce.matches && (!pc || this.cards.size <= 2);
    const t = now / 1000;
    const steered = Boolean(this.gyro && !lowPower) || [...this.cards.values()].some((c) => c.drag);
    if (!steered && this.drawnAt && now - this.drawnAt < SWAY_FRAME_MS) { this.wake(); return; }
    const step = 1 - (1 - 0.16) ** Math.min(4, Math.max(1, (now - (this.drawnAt || now - 16.7)) / 16.7));
    this.drawnAt = now;
    let busy = false;
    for (const [card, c] of this.cards) {
      if (!card.isConnected || !card.classList.contains('is-lit')) {
        this.cards.delete(card);
        continue;
      }
      let tx = 0;
      let ty = 0;
      if (c.drag) ({ tx, ty } = c.drag);
      else if (this.gyro && !lowPower) ({ tx, ty } = this.gyro);
      else if (sway) {
        tx = Math.sin(t * 0.9 + c.phase) * 0.45;
        ty = Math.sin(t * 1.3 + c.phase) * 0.3;
      }
      c.tx += (tx - c.tx) * step;
      c.ty += (ty - c.ty) * step;
      if (!tx && !ty && Math.abs(c.tx) < 0.002 && Math.abs(c.ty) < 0.002) { c.tx = 0; c.ty = 0; }
      else busy = true;
      const mark = `${c.tx.toFixed(3)}|${c.ty.toFixed(3)}`;
      if (mark === c.mark) continue;
      c.mark = mark;
      card.style.setProperty('--tx', c.tx.toFixed(3));
      card.style.setProperty('--ty', c.ty.toFixed(3));
      card.style.setProperty('--lx', (-c.tx).toFixed(3));
      card.style.setProperty('--ly', (-c.ty).toFixed(3));
    }
    if (busy) this.wake();
  },

  listen() {
    if (this.listening) return;
    this.listening = true;
    let base = null;
    window.addEventListener('deviceorientation', (event) => {
      if (settings().tilt === false) return;
      if (event.gamma == null || event.beta == null) return;
      if (!base) base = { beta: event.beta, gamma: event.gamma };
      base.beta += (event.beta - base.beta) * 0.012;
      base.gamma += (event.gamma - base.gamma) * 0.012;
      this.gyro = {
        tx: clamp((event.gamma - base.gamma) / 22, -1, 1),
        ty: clamp((event.beta - base.beta) / 22, -1, 1)
      };
      this.wake();
    });
  },
  async arm() {
    if (this.asked || !('DeviceOrientationEvent' in window)) return;
    this.asked = true;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') return;
      } else if (!matchMedia('(pointer: coarse)').matches) {
        return;
      }
      this.listen();
    } catch {}
  },
  init() {
    if ('DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function'
      && matchMedia('(pointer: coarse)').matches) {
      this.asked = true;
      this.listen();
    }
    document.addEventListener('visibilitychange', () => this.wake());
    document.addEventListener('pointerdown', (event) => {
      const card = event.target.closest?.('.card.is-lit');
      if (!card) return;
      this.arm();
      if (card.dataset.rarity === 'rare') flare(card);
    }, { passive: true });
  }
};

export const flareTimers = new WeakMap();

export function flare(card) {
  card.classList.add('is-hot');
  clearTimeout(flareTimers.get(card));
  flareTimers.set(card, setTimeout(() => card.classList.remove('is-hot'), 900));
}

export function attachTilt(card) {
  card.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || event.buttons || !document.documentElement.classList.contains('is-pc')) return;
    const box = card.getBoundingClientRect();
    tilt.hold(card, ((event.clientX - box.left) / box.width - 0.5) * 1.6, ((event.clientY - box.top) / box.height - 0.5) * 1.6);
  });
  card.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') tilt.release(card); });
  card.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a')) return;
    trackDrag(event, {
      onMove: (dx, dy) => tilt.hold(card, dx / TILT_REACH, dy / TILT_REACH),
      onEnd: () => tilt.release(card)
    });
  });
}
