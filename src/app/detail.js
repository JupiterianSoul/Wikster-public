import { creditLine } from './about.js';
import * as store from '../collection.js';
import { renderPacks } from './packs.js';
import { RARITIES, rarityById, rarityRank } from '../data/rarities.js';
import { repairCard } from '../wiki.js';
import { synth } from '../ui/sound.js';
import * as account from '../account.js';
import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { isMature } from '../sensitive.js';
import { press, trackDrag } from '../ui/components.js';
import { bandFor, formatViews } from '../pricing.js';
import { FUSE_COPIES, canFuse, fuseCopies, fuseFrom, fuseTierFor, sellPriceFor } from '../economy.js';
import { bestPrint, printPrice, printsOf, sortedPrints, sparesOf, spareRarity } from '../econ/rules.js';
import { reportQuest } from './arcade.js';
import { renderBinder } from './binder.js';
import { TILT_REACH, clamp, esc, money, openSheet, plainText, refreshWallet, settings, state, toast } from './core.js';
import { signedIn, userId } from './gate.js';
import { live } from './live.js';
import { canShare, share } from '../ui/native.js';
import { CARD_FRONT_MARKUP, applyRarityVars, dressFront, favButtonNode, fillFront, gainBooster, wireFavButton } from './open.js';
import { econ, econMessage, serverEconomy } from './econ.js';
import { updateBadges } from './regalia.js';
import { matureAllowed } from './mature.js';
import { skinOf } from '../codedefs.js';

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

function smoothWheel(box) {
  let target = 0;
  let frame = 0;
  const paintEnd = () => {
    box.classList.toggle('is-end', box.scrollTop + box.clientHeight >= box.scrollHeight - 2);
    box.classList.toggle('is-scrolled', box.scrollTop > 2);
  };
  const step = () => {
    const gap = target - box.scrollTop;
    if (Math.abs(gap) < 0.5) { box.scrollTop = target; frame = 0; paintEnd(); return; }
    box.scrollTop += gap * 0.2;
    paintEnd();
    frame = requestAnimationFrame(step);
  };
  box.addEventListener('wheel', (event) => {
    if (box.scrollHeight <= box.clientHeight + 1) return;
    event.preventDefault();
    event.stopPropagation();
    if (!frame) target = box.scrollTop;
    const lines = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? box.clientHeight : 1;
    target = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, target + event.deltaY * lines));
    if (!frame) frame = requestAnimationFrame(step);
  }, { passive: false });
  box.addEventListener('scroll', paintEnd, { passive: true });
  requestAnimationFrame(paintEnd);
}

export function openCardDetail(entryKey, data, rarity) {
  const entry = state.collection.entries[entryKey] ?? null;
  state.detail = { key: entryKey, data, rarity, sellArmed: false };
  reportQuest('view');

  openSheet(data.title, (body) => {
    const card = document.createElement('article');
    card.className = 'card giant-card is-revealed is-lit';
    applyRarityVars(card, rarity);
    if (data.special) card.dataset.special = skinOf(data) ?? 'special';
    if (isMature(data)) card.toggleAttribute('data-adult', true);
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-front">
          <div class="fx fx-a" aria-hidden="true"></div>
          <div class="fx-code" aria-hidden="true"></div>
          <div class="fx-art" aria-hidden="true"></div>
          <div class="card-art"></div>
          <button class="fav-button is-giant" type="button" aria-pressed="false"></button>
          <div class="card-body">
            <h3 class="card-title"></h3>
            <p class="card-desc"></p>
            <div class="detail-facts giant-facts"></div>
            <p class="giant-extract selectable"></p>
          </div>
          <div class="card-stats">
            <span class="card-price"></span><span class="card-views"></span>
          </div>
          <div class="giant-actions">
            <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer"></a>
            <button class="btn btn-ghost btn-sm wish-giant" type="button"></button>
            <button class="btn btn-ghost btn-sm fuse" type="button" hidden></button>
            <button class="btn btn-ghost btn-sm sell" type="button" hidden></button>
          </div>
          <div class="fx-p" aria-hidden="true"></div>
          <div class="fx fx-b" aria-hidden="true"></div>
          <div class="fx fx-c" aria-hidden="true"></div>
          <div class="fx fx-v" aria-hidden="true"></div>
          <div class="fx-ring" aria-hidden="true"></div>
        </div>
      </div>`;
    body.appendChild(card);

    const giantFav = card.querySelector('.fav-button');
    if (entry) wireFavButton(giantFav, entryKey, { size: 20 });
    else giantFav.remove();

    const owned = Boolean(state.collection.entries[entryKey]);
    if (entry) checkArticle(card, entryKey, entry);

    const wishBtn = card.querySelector('.wish-giant');
    const paintWish = () => {
      const on = state.wishlist.has(entryKey);
      wishBtn.innerHTML = `${iconSvg('wish', { size: 14 })}<span style="margin-left:6px">${esc(t(on ? 'wishOn' : 'wishTitle'))}</span>`;
      wishBtn.classList.toggle('is-wished', on);
    };
    paintWish();
    press(wishBtn, { sound: null });
    wishBtn.addEventListener('click', () => {
      toggleWish({ ...data, key: entryKey });
      paintWish();
    });
    const wishers = state.friendWishes.get(entryKey) ?? [];
    if (wishers.length) {
      const line = document.createElement('p');
      line.className = 'wish-friends';
      line.textContent = t('wishFriends', { names: wishers.join(', ') });
      card.querySelector('.giant-facts').after(line);
    }

    const art = card.querySelector('.card-art');
    if (data.thumbnail) {
      const img = document.createElement('img');
      img.src = data.thumbnail;
      img.alt = '';
      img.addEventListener('error', () => {
        img.remove();
        art.classList.add('is-no-art');
        art.insertAdjacentHTML('afterbegin', `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 54 })}</div>`);
      });
      art.appendChild(img);
    } else {
      art.classList.add('is-no-art');
      art.innerHTML = `<div class="card-art-fallback">${iconSvg(data.packIcon ?? 'packs', { size: 54 })}</div>`;
    }

    card.querySelector('.card-title').textContent = data.title;
    card.querySelector('.card-desc').textContent = data.description || data.sourceName || '';
    card.querySelector('.giant-extract').textContent = data.extract;
    const credit = creditLine(data);
    const extract = card.querySelector('.giant-extract');
    const scroller = document.createElement('div');
    scroller.className = 'giant-scroll';
    extract.before(scroller);
    scroller.append(extract);
    if (credit) scroller.append(credit);
    smoothWheel(scroller);
    if (card.hasAttribute('data-adult') && !matureAllowed()) {
      const locked = document.createElement('span');
      locked.className = 'adult-reveal is-locked';
      locked.innerHTML = `${iconSvg('lock', { size: 14 })}<span>${esc(t('matureLockedCard'))}</span>`;
      card.querySelector('.card-art').appendChild(locked);
    } else if (card.hasAttribute('data-adult') && settings().blurAdult) {
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.className = 'adult-reveal';
      reveal.innerHTML = `${iconSvg('spark', { size: 15 })}<span>${esc(t('adultReveal'))}</span>`;
      press(reveal, { sound: null });
      reveal.addEventListener('click', (event) => {
        event.stopPropagation();
        card.removeAttribute('data-adult');
        reveal.remove();
      });
      card.querySelector('.card-art').appendChild(reveal);
    }
    dressFront(card.querySelector('.card-front'), data, rarity);
    attachTilt(card);
    tilt.watch(card);
    if (rarity.id === 'rare') setTimeout(() => flare(card), 350);
    card.querySelector('.card-price').innerHTML = money(data.price);
    const readership = data.creator || data.sourceId === 'special' ? ''
      : data.views ? t('viewsPerMonth', { views: formatViews(data.views) })
        : bandFor(data.popularity ?? 0).name;
    card.querySelector('.card-views').textContent = readership;
    card.querySelector('.giant-facts').innerHTML = [
      `<span class="chip" style="color:${rarity.color};border-color:${rarity.color}">${tx(rarity.name)}</span>`,
      owned ? `<span class="chip chip-owned">${esc(t('ownedTag'))}</span>` : '',
      entry && entry.count > 1 ? `<span class="chip">${t('copiesOwned', { n: entry.count })}</span>` : '',
      entry && mixedPrints(entry) ? `<span class="chip chip-prints">${esc(t('printsSpares', { list: sparesText(entry) }))}</span>` : ''
    ].filter(Boolean).join('');

    const read = card.querySelector('.giant-actions a');
    if (data.url) {
      read.href = data.url;
      read.classList.add('giant-read');
      read.innerHTML = `${iconSvg('book', { size: 15 })}<span>${esc(t('readShort'))}</span>`;
      press(read, { sound: null });
      if (canShare()) {
        const give = document.createElement('button');
        give.type = 'button';
        give.className = 'btn btn-ghost btn-sm giant-share';
        give.innerHTML = `${iconSvg('share', { size: 14 })}<span>${esc(t('shareCard'))}</span>`;
        press(give, { sound: null });
        give.addEventListener('click', () => share({
          title: data.title,
          text: t('shareCardText', { title: data.title, rarity: tx(rarity.name) }),
          url: data.url
        }));
        read.after(give);
      }
    } else {
      read.remove();
      wishBtn.remove();
    }

    const fuse = card.querySelector('.fuse');
    fuse.hidden = !canFuse(entry);
    if (!fuse.hidden) {
      state.detail.fuseButton = fuse;
      paintFuseButton();
      press(fuse, { sound: null });
      fuse.addEventListener('click', handleFuse);
    }

    const sell = card.querySelector('.sell');
    sell.hidden = !entry || store.isLocked(entry);
    if (store.isLocked(entry ?? data)) {
      const lock = document.createElement('span');
      lock.className = 'chip is-lock';
      lock.innerHTML = `${iconSvg('lock', { size: 12 })}<span>${esc(t('specialLockedShort'))}</span>`;
      lock.title = t('specialLocked');
      card.querySelector('.giant-facts').appendChild(lock);
    }
    if (entry && !store.isLocked(entry)) {
      state.detail.sellButton = sell;
      paintSellButton();
      press(sell, { sound: null });
      sell.addEventListener('click', handleSell);
    }
  }, { onClose: () => { state.detail = null; } });

  synth.playCardOpen();
}

function noteGone(card) {
  if (card.querySelector('.giant-gone')) return;
  const line = document.createElement('p');
  line.className = 'giant-gone';
  line.textContent = t('detailGone');
  card.querySelector('.giant-facts').after(line);
}

function checkArticle(card, entryKey, entry) {
  if (entry.gone) noteGone(card);
  repairCard(entry).then((fix) => {
    if (!fix) return;
    entry.checkedAt = Date.now();
    if (fix.gone) entry.gone = true;
    else {
      delete entry.gone;
      for (const field of ['title', 'description', 'extract', 'thumbnail']) if (fix[field]) entry[field] = fix[field];
    }
    store.saveCollection(state.collection);
    if (state.detail?.key !== entryKey || !card.isConnected) return;
    if (fix.gone) { noteGone(card); return; }
    card.querySelector('.giant-gone')?.remove();
    if (fix.title) {
      const title = card.querySelector('.card-title');
      const tag = title.querySelector('.owned-tag');
      title.textContent = entry.title;
      if (tag) title.appendChild(tag);
    }
    if (fix.description) card.querySelector('.card-desc').textContent = entry.description;
    if (fix.extract) card.querySelector('.giant-extract').textContent = entry.extract;
  }).catch(() => {});
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

export const sellAmountFor = (entry) => sellPriceFor(printPrice(entry.price, bestPrint(printsOf(entry)), spareRarity(entry)));

export function paintSellButton() {
  const detail = state.detail;
  if (!detail?.sellButton) return;
  const entry = state.collection.entries[detail.key];
  if (!entry) { detail.sellButton.hidden = true; return; }
  const amount = sellAmountFor(entry);
  const print = spareRarity(entry);
  if (!detail.sellArmed && print !== bestPrint(printsOf(entry))) {
    detail.sellButton.classList.remove('btn-danger', 'is-armed');
    label(detail.sellButton, t('sellPrint', { amount: money(amount), rarity: esc(tx(rarityById(print).name)) }));
    return;
  }
  detail.sellButton.classList.toggle('btn-danger', detail.sellArmed);
  detail.sellButton.classList.toggle('is-armed', detail.sellArmed);
  label(detail.sellButton, detail.sellArmed ? t('sellConfirm') : t('sell', { amount: money(amount) }));
}

function label(btn, html) {
  btn.innerHTML = `<span class="giant-label">${html}</span>`;
  btn.title = plainText(html);
}

export { FUSE_COPIES, canFuse, fuseTierFor };

export function paintFuseButton() {
  const detail = state.detail;
  const btn = detail?.fuseButton;
  if (!btn) return;
  const entry = state.collection.entries[detail.key];
  if (!entry || !canFuse(entry)) { btn.hidden = true; return; }
  const from = fuseFrom(entry);
  label(btn, esc(detail.fuseArmed
    ? t('fuseConfirm', { tier: tx(fuseTierFor(entry).name) })
    : mixedPrints(entry)
      ? t('fusePrint', { n: fuseCopies(), rarity: tx(rarityById(from).name), tier: tx(fuseTierFor(entry).name) })
      : t('fuse', { n: fuseCopies(), tier: tx(fuseTierFor(entry).name) })));
  btn.classList.toggle('is-armed', Boolean(detail.fuseArmed));
}

export async function handleFuse() {
  const detail = state.detail;
  if (!detail) return;
  const entry = state.collection.entries[detail.key];
  if (!canFuse(entry)) { synth.playDenied(); return; }

  if (!detail.fuseArmed) {
    detail.fuseArmed = true;
    paintFuseButton();
    synth.playArm();
    setTimeout(() => {
      if (state.detail === detail && detail.fuseArmed) { detail.fuseArmed = false; paintFuseButton(); }
    }, 4000);
    return;
  }

  const tier = fuseTierFor(entry);
  const from = fuseFrom(entry);
  const spec = { kind: 'open', themeId: null, rarityId: tier.id, cards: 1 };
  if (serverEconomy()) {
    detail.fuseArmed = false;
    try { await econ('fuse', { key: detail.key, rarityId: from }); } catch (error) {
      synth.playDenied(); toast(esc(econMessage(error, t)), 'error'); paintFuseButton(); return;
    }
    gainBooster(spec);
  } else {
    for (let i = 0, n = fuseCopies(); i < n; i++) store.takeCardCopy(state.collection, detail.key, from);
    gainBooster(spec);
    state.profile.fused = (state.profile.fused ?? 0) + 1;
    store.saveProfile(state.profile);
  }
  reportQuest('fuse');
  updateBadges();
  synth.playCoins();
  toast(t('fused', { n: fuseCopies(), tier: tx(tier.name) }), 'ok');
  detail.fuseArmed = false;
  const left = state.collection.entries[detail.key];
  if (left) openCardDetail(detail.key, detail.data, detail.rarity);
  else live.sheet.hide();
  renderBinder();
  renderPacks();
}

export async function handleSell() {
  const detail = state.detail;
  if (!detail) return;
  const entry = state.collection.entries[detail.key];
  if (!entry) return;
  if (store.isLocked(entry)) { synth.playDenied(); toast(t('specialLocked'), 'error'); return; }

  if (!detail.sellArmed) {
    detail.sellArmed = true;
    paintSellButton();
    synth.playArm();
    setTimeout(() => {
      if (state.detail === detail && detail.sellArmed) {
        detail.sellArmed = false;
        paintSellButton();
      }
    }, 4000);
    return;
  }

  let amount = sellAmountFor(entry);
  const print = spareRarity(entry);
  if (serverEconomy()) {
    detail.sellArmed = false;
    try {
      amount = Number((await econ('sell', { key: detail.key, rarityId: print }))?.amount) || amount;
    } catch (error) {
      synth.playDenied();
      toast(esc(econMessage(error, t)), 'error');
      return;
    }
    renderBinder();
    reportQuest('sell', { amount });
  } else {
    store.sellCopy(state.collection, detail.key, print);
    reportQuest('sell', { amount });
    state.profile.cardsSold = (state.profile.cardsSold ?? 0) + 1;
    store.saveProfile(state.profile);
    store.saveWallet(store.loadWallet() + amount);
  }
  refreshWallet();
  updateBadges();
  synth.playCoins();
  toast(t('sold', { amount: money(amount) }), 'ok');
  live.sheet.hide();
  renderBinder();
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
