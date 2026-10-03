import { SHOWCASE_MAX } from '../showcase.js';
import { withSpecialPhoto } from '../codedefs.js';
import * as account from '../account.js';
import { bump } from '../ledger.js';
import { getLanguage, t, tx } from '../i18n.js';
import { MAX_LEVEL, clampLevel, rankFor } from '../progression.js';
import { Bar, Segmented, press, reveal } from '../ui/components.js';
import { iconSvg } from '../data/icons.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { RARITIES, rarityById, rarityOfCard, rarityRank, rarityText } from '../data/rarities.js';
import { specId, specName } from '../booster.js';
import { frameTier } from '../frames.js';
import { isMature } from '../sensitive.js';
import { formatAmount } from '../pricing.js';
import { buildAlbums } from '../albums.js';
import { gameStage, reportQuest, seasonReached } from './arcade.js';
import { confirmBlock, isBlocked, openReport } from './safety.js';
import { econ, serverEconomy } from './econ.js';
import { buildAlbumCover, classicSections, renderBinder } from './binder.js';
import { el, esc, openSheet, showScreen, state, toast } from './core.js';
import { buildStaticCard, openCardDetail } from './detail.js';
import { whenText } from './drawer.js';
import { describeError, showGate, signedIn, syncSoon, userId } from './gate.js';
import { live } from './live.js';
import { gainBooster } from './open.js';
import { buildBooster, renderPacks } from './packs.js';
import { formatDuration, renderProfile } from './profile.js';
import { loadHonours, paintFrameInto } from './regalia.js';
import { keepPending, pending } from './pending.js';
import { recall, remember } from './memo.js';
import { spareRarity } from '../econ/rules.js';
import { makeBadge, paintSocialTabs } from './inbox.js';
import { fxOn, sceneFor, wearLook } from './lookview.js';
import { markThumb } from './mature.js';
import { lastSeenText, onlineNow, openChat, paintAvatarInto, paintRingFace, personRow, refreshTrades, socialAction, socialError, statsSeen, syncSocial } from './social.js';

export function isFavFriend(id) {
  return ((state.profile.favFriends ?? []).includes(id));
}

export function toggleFavFriend(id) {
  const list = state.profile.favFriends ??= [];
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1); else list.push(id);
  store.saveProfile(state.profile);
}

export function openGiftChooser(entry) {
  openSheet(t('giftChooseTitle', { name: entry.profile.username }), (body) => {
    const note = document.createElement('p');
    note.textContent = t('giftChooseNote');

    const choices = document.createElement('div');
    choices.className = 'gift-choices';
    const choice = (icon, labelKey, run) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost gift-choice';
      btn.innerHTML = `${iconSvg(icon, { size: 20 })}<span>${esc(t(labelKey))}</span>`;
      press(btn, { sound: null });
      btn.addEventListener('click', () => { synth.playTap(); live.sheet.hide(); run(); });
      return btn;
    };
    choices.append(
      choice('gift', 'giftCardOpen', () => openGiftCard(entry)),
      choice('packs', 'giftBoosterOpen', () => openGiftBooster(entry))
    );
    body.append(note, choices);
  });
}

export function openGiftCard(entry) {
  const mine = store.allEntries(state.collection)
    .filter((c) => !store.isLocked(c))
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  openSheet(t('giftCardTitle', { name: entry.profile.username }), (body) => {
    if (!mine.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('giftNothing');
      return;
    }
    const list = document.createElement('div');
    list.className = 'pick-list';
    list.replaceChildren(...mine.map((card) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick-row';
      row.innerHTML = `
        <span class="pick-thumb"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="chip tabular">×${card.count}</span>`;
      if (card.thumbnail) row.querySelector('.pick-thumb').style.backgroundImage = `url("${card.thumbnail}")`;
      markThumb(row.querySelector('.pick-thumb'), card);
      row.querySelector('b').textContent = card.title;
      const tier = row.querySelector('.pick-copy span');
      const print = spareRarity(card);
      tier.textContent = tx(rarityById(print).name);
      tier.style.color = rarityText(rarityById(print));
      press(row, { sound: null });
      keepPending(`gift:card:${card.key}`, row);
      row.addEventListener('click', () => pending(`gift:card:${card.key}`, row, async () => {
        const onServer = serverEconomy();
        const snapshot = onServer ? null : store.takeCardCopy(state.collection, card.key);
        if (!onServer && !snapshot) { synth.playDenied(); return; }
        try {
          if (onServer) await econ('gift', { to: entry.otherId, kind: 'card', ref: card.key });
          else await account.sendDelivery(userId(), entry.otherId, 'card', snapshot);
          reportQuest('gift');
          state.profile.giftsSent = (state.profile.giftsSent ?? 0) + 1;
          store.saveProfile(state.profile);
          toast(t('giftSent', { name: esc(entry.profile.username) }));
          synth.playTrade();
          if (row.isConnected) live.sheet.hide();
          renderBinder();
          syncSoon();
        } catch (error) {
          if (snapshot) store.receiveCardEntry(state.collection, snapshot);
          toast(esc(socialError(error)), 'error');
          synth.playDenied();
        }
      }));
      return row;
    }));
    body.appendChild(list);
  });
}

export function openGiftBooster(entry) {
  const owned = store.ownedBoosters(state.inventory).filter((slot) => slot.spec.kind !== 'code');
  openSheet(t('giftBoosterTitle', { name: entry.profile.username }), (body) => {
    if (!owned.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('giftNoBoosters');
      return;
    }
    const list = document.createElement('div');
    list.className = 'pick-list';
    list.replaceChildren(...owned.map((slot) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick-row';
      row.innerHTML = `
        <span class="pick-art"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="chip tabular">×${slot.count}</span>`;
      row.querySelector('.pick-art').appendChild(buildBooster(slot.spec, { size: 'is-tiny' }));
      row.querySelector('b').textContent = specName(slot.spec);
      row.querySelector('.pick-copy span').textContent = `${slot.spec.cards} ${t('cards', { n: slot.spec.cards })}`;
      press(row, { sound: null });
      keepPending(`gift:booster:${specId(slot.spec)}`, row);
      row.addEventListener('click', () => pending(`gift:booster:${specId(slot.spec)}`, row, async () => {
        const onServer = serverEconomy();
        if (!onServer && !store.takeBooster(state.inventory, specId(slot.spec))) { synth.playDenied(); return; }
        try {
          if (onServer) await econ('gift', { to: entry.otherId, kind: 'booster', ref: specId(slot.spec) });
          else await account.sendDelivery(userId(), entry.otherId, 'booster', { spec: slot.spec });
          reportQuest('gift');
          state.profile.giftsSent = (state.profile.giftsSent ?? 0) + 1;
          store.saveProfile(state.profile);
          toast(t('giftSent', { name: esc(entry.profile.username) }));
          synth.playTrade();
          if (row.isConnected) live.sheet.hide();
          renderPacks();
          syncSoon();
        } catch (error) {
          if (!onServer) gainBooster(slot.spec, 1);
          toast(esc(socialError(error)), 'error');
          synth.playDenied();
        }
      }));
      return row;
    }));
    body.appendChild(list);
  });
}

export function openTradeSheet(entry, { ask: wanted = [] } = {}) {
  const fetching = account.friendCollection(entry.otherId).then((rows) => {
    if (Array.isArray(rows)) remember('friendCards', entry.otherId, rows, { disk: false });
    return rows ?? [];
  }, () => recall('friendCards', entry.otherId) ?? []);
  const mine = store.allEntries(state.collection)
    .filter((c) => !store.isLocked(c))
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  const lead = new Set(wanted);
  let theirs = [];
  let loaded = false;

  const give = new Set();
  const ask = new Set();

  openSheet(t('tradeTitle', { name: entry.profile.username }), (body) => {
    body.innerHTML = `
      <p class="label" data-give-label style="margin-bottom:8px"></p>
      <div class="pick-list is-short" data-give></div>
      <p class="label" data-ask-label style="margin:16px 0 8px"></p>
      <div class="pick-list is-short" data-ask></div>
      <button class="btn btn-primary btn-block" type="button" data-send style="margin-top:16px"></button>`;
    body.querySelector('[data-give-label]').textContent = t('tradeGive');
    body.querySelector('[data-ask-label]').textContent = t('tradeAsk');
    const sendBtn = body.querySelector('[data-send]');
    const key = `trade:send:${entry.otherId}`;

    const paintSend = () => {
      sendBtn.textContent = t('tradeSend', { give: give.size, ask: ask.size });
      sendBtn.disabled = give.size === 0 || ask.size === 0;
      keepPending(key, sendBtn);
    };
    const pickRow = (card, bag, cap = 3) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `pick-row is-tick${bag.has(card.key) ? ' is-on' : ''}`;
      row.innerHTML = `
        <span class="pick-thumb"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="pick-tick">${iconSvg('check', { size: 15 })}</span>`;
      if (card.thumbnail) row.querySelector('.pick-thumb').style.backgroundImage = `url("${card.thumbnail}")`;
      markThumb(row.querySelector('.pick-thumb'), card);
      row.querySelector('b').textContent = card.title;
      const tier = row.querySelector('.pick-copy span');
      const print = spareRarity(card);
      tier.textContent = tx(rarityById(print).name);
      tier.style.color = rarityText(rarityById(print));
      press(row, { sound: null });
      row.addEventListener('click', () => {
        if (bag.has(card.key)) bag.delete(card.key);
        else if (bag.size < cap) bag.add(card.key);
        row.classList.toggle('is-on', bag.has(card.key));
        paintSend();
      });
      return row;
    };

    body.querySelector('[data-give]').replaceChildren(...mine.slice(0, 60).map((c) => pickRow(c, give)));
    const askBay = body.querySelector('[data-ask]');
    const paintTheirs = () => {
      if (!loaded) {
        askBay.innerHTML = '<p class="muted is-pending" style="font-size:.84rem"></p>';
        askBay.querySelector('p').textContent = t('tradeTheirsLoading');
      } else if (!theirs.length) {
        askBay.innerHTML = '<p class="muted" style="font-size:.84rem"></p>';
        askBay.querySelector('p').textContent = t('tradeTheirsHidden');
      } else {
        askBay.replaceChildren(...theirs.slice(0, 60).map((c) => pickRow(c, ask)));
      }
    };
    paintTheirs();
    fetching.then((rows) => {
      theirs = rows.filter((c) => !store.isLocked(c));
      theirs.sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
      if (lead.size) theirs.sort((a, b) => Number(lead.has(b.key)) - Number(lead.has(a.key)));
      if (!ask.size) for (const c of theirs.filter((x) => lead.has(x.key)).slice(0, 3)) ask.add(c.key);
      loaded = true;
      if (!askBay.isConnected) return;
      paintTheirs();
      paintSend();
    });

    paintSend();
    press(sendBtn, { sound: null });
    sendBtn.addEventListener('click', () => pending(key, sendBtn, async () => {
      if (!give.size || !ask.size) return;
      const onServer = serverEconomy();
      const offer = onServer ? [] : [...give].map((k) => store.takeCardCopy(state.collection, k)).filter(Boolean);
      const askList = [...ask].map((k) => {
        const card = theirs.find((c) => c.key === k);
        return card ? { key: card.key, title: card.title, rarityId: card.rarityId } : null;
      }).filter(Boolean);
      try {
        if (onServer) await econ('tradePropose', { to: entry.otherId, offer: [...give], ask: askList });
        else await account.proposeTrade(userId(), entry.otherId, offer, askList);
        toast(t('tradeSentToast', { name: esc(entry.profile.username) }));
        synth.playTrade();
        if (sendBtn.isConnected) live.sheet.hide();
        renderBinder();
        syncSoon();
        syncSocial();
      } catch (error) {
        for (const card of offer) store.receiveCardEntry(state.collection, card);
        toast(esc(socialError(error)), 'error');
        synth.playDenied();
      }
    }));
  });
}

export function openTradeAnswer(trade) {
  const who = state.social.friends.find((f) => f.otherId === trade.proposer);
  const name = who?.profile?.username ?? '?';
  openSheet(t('tradeFromTitle', { name }), (body) => {
    const line = (cards, labelKey) => `
      <p class="label" style="margin:10px 0 6px">${esc(t(labelKey))}</p>
      ${cards.map((c) => `<p class="trade-line"><b>${esc(c.title)}</b>
        <span style="color:${rarityText(rarityById(c.rarityId))}">${esc(tx(rarityById(c.rarityId).name))}</span></p>`).join('')}`;
    body.innerHTML = `
      ${line(trade.offer ?? [], 'tradeYouGet')}
      ${line(trade.ask ?? [], 'tradeYouGive')}
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-primary" type="button" data-accept style="flex:1"></button>
        <button class="btn btn-ghost" type="button" data-decline style="flex:1"></button>
      </div>
      <div style="display:flex;justify-content:center;margin-top:10px">
        <button class="btn btn-ghost btn-sm" type="button" data-report></button>
      </div>
      <p class="find-status" data-status role="status"></p>`;
    const acceptBtn = body.querySelector('[data-accept]');
    const declineBtn = body.querySelector('[data-decline]');
    acceptBtn.textContent = t('tradeAccept');
    declineBtn.textContent = t('tradeDecline');
    const reportBtn = body.querySelector('[data-report]');
    reportBtn.innerHTML = `${iconSvg('flag', { size: 14 })}<span style="margin-left:6px">${esc(t('reportTrade'))}</span>`;
    press(reportBtn, { sound: null });
    reportBtn.addEventListener('click', () => openReport({ kind: 'trade', ref: trade.id, name }));

    const missing = (trade.ask ?? []).filter((c) => !state.collection.entries[c.key] || store.isLocked(state.collection.entries[c.key]));
    if (missing.length) {
      acceptBtn.disabled = true;
      body.querySelector('[data-status]').textContent = t('tradeMissing');
    }

    const key = `trade:${trade.id}`;
    keepPending(key, acceptBtn);
    press(acceptBtn, { sound: null });
    acceptBtn.addEventListener('click', () => pending(key, acceptBtn, async () => {
      const onServer = serverEconomy();
      const paid = onServer ? [] : (trade.ask ?? []).map((c) => store.takeCardCopy(state.collection, c.key)).filter(Boolean);
      try {
        if (onServer) {
          const res = await econ('tradeAnswer', { id: trade.id, accept: true });
          seasonReached(res.season);
        } else {
          await account.sendDelivery(userId(), trade.proposer, 'trade-return', { cards: paid });
          for (const card of trade.offer ?? []) store.receiveCardEntry(state.collection, card);
          await account.setTradeStatus(trade.id, 'accepted');
        }
        state.profile.tradesDone = (state.profile.tradesDone ?? 0) + 1;
        toast(t('tradeDone', { name: esc(name) }));
        synth.playTrade();
        if (acceptBtn.isConnected) live.sheet.hide();
        renderBinder();
        syncSoon();
        syncSocial();
      } catch (error) {
        for (const card of paid) store.receiveCardEntry(state.collection, card);
        toast(esc(socialError(error)), 'error');
        synth.playDenied();
      }
    }));
    press(declineBtn, { sound: null });
    declineBtn.addEventListener('click', () => pending(key, declineBtn, async () => {
      try {
        if (serverEconomy()) await econ('tradeAnswer', { id: trade.id, accept: false });
        else await account.setTradeStatus(trade.id, 'declined');
        if (declineBtn.isConnected) live.sheet.hide();
        syncSocial();
      } catch (error) {
        toast(esc(describeError(error)), 'error');
        synth.playDenied();
      }
    }));
  });
}

export function openAvatarPicker() {
  const mine = store.allEntries(state.collection)
    .filter((c) => c.thumbnail)
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  openSheet(t('avatarTitle'), (body) => {
    if (!mine.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('avatarNoCards');
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'avatar-grid';
    grid.replaceChildren(...mine.map((card) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'avatar-cell';
      cell.style.backgroundImage = `url("${String(card.thumbnail).replace(/"/g, '%22')}")`;
      cell.toggleAttribute('data-adult', isMature(card));
      cell.setAttribute('aria-label', card.title);
      press(cell, { sound: null });
      cell.addEventListener('click', () => openAvatarCrop(card));
      return cell;
    }));
    body.appendChild(grid);
  });
}

export const CROP_CIRCLE = 0.72;

export const CROP_ZOOM = [0.3, 1];

export function openAvatarCrop(card) {
  openSheet(t('avatarCropTitle'), (body) => {
    body.innerHTML = `
      <p class="muted" style="font-size:.84rem;margin-bottom:12px" data-hint></p>
      <div class="crop-stage" data-stage>
        <div class="crop-img" data-img></div>
        <div class="crop-shade" aria-hidden="true"></div>
        <div class="crop-circle" aria-hidden="true"></div>
      </div>
      <div class="crop-zoom">
        <span class="crop-zoom-mark" aria-hidden="true"></span>
        <input class="crop-zoom-range" type="range" min="100" max="333" step="1" data-zoom />
        <span class="crop-zoom-mark" aria-hidden="true"></span>
      </div>
      <div class="crop-preview-row">
        <span class="person-mark crop-preview" data-preview aria-hidden="true"></span>
        <span class="muted" data-preview-label></span>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" type="button" data-save style="flex:1"></button>
      </div>`;
    body.querySelector('[data-hint]').textContent = t('avatarCropHint');
    body.querySelector('[data-preview-label]').textContent = t('avatarPreview');
    const saveBtn = body.querySelector('[data-save]');
    saveBtn.textContent = t('avatarSave');

    const stage = body.querySelector('[data-stage]');
    const img = body.querySelector('[data-img]');
    const zoom = body.querySelector('[data-zoom]');
    const preview = body.querySelector('[data-preview]');
    const marks = body.querySelectorAll('.crop-zoom-mark');
    marks[0].innerHTML = iconSvg('minus', { size: 14 });
    marks[1].innerHTML = iconSvg('plus', { size: 14 });
    zoom.setAttribute('aria-label', t('avatarZoom'));
    const url = String(card.thumbnail);
    img.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;

    const saved = state.account.profile?.avatar;
    const same = saved?.url === url && Number(saved.z) > 0;
    let x = same ? Number(saved.x) : 50;
    let y = same ? Number(saved.y) : 50;
    let z = same ? Number(saved.z) : 0.85;
    let ratio = same && Number(saved.r) > 0 ? Number(saved.r) : 1;
    if (!Number.isFinite(x)) x = 50;
    if (!Number.isFinite(y)) y = 50;

    const size = () => {
      const L = stage.clientWidth || 300;
      const C = L * CROP_CIRCLE;
      const short = C / z;
      return { L, C, W: ratio >= 1 ? short * ratio : short, H: ratio >= 1 ? short : short / ratio };
    };
    const clampAll = () => {
      z = Math.min(CROP_ZOOM[1], Math.max(CROP_ZOOM[0], z));
      const { C, W, H } = size();
      const minX = (C / 2 / W) * 100, minY = (C / 2 / H) * 100;
      x = Math.min(100 - minX, Math.max(minX, x));
      y = Math.min(100 - minY, Math.max(minY, y));
    };
    const current = () => ({ url, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 1000) / 1000, r: Math.round(ratio * 1000) / 1000 });
    const paint = () => {
      clampAll();
      const { L, W, H } = size();
      img.style.width = `${W}px`;
      img.style.height = `${H}px`;
      img.style.transform = `translate(${(L / 2 - (x / 100) * W).toFixed(2)}px, ${(L / 2 - (y / 100) * H).toFixed(2)}px)`;
      zoom.value = String(Math.round(100 / z));
      paintAvatarInto(preview, { avatar: current(), username: '' }, { frame: { style: null, tier: 0 } });
    };
    paint();

    const probe = new Image();
    probe.addEventListener('load', () => {
      if (probe.naturalWidth && probe.naturalHeight) ratio = probe.naturalWidth / probe.naturalHeight;
      paint();
    });
    probe.src = url;

    const pointers = new Map();
    let pinch = null;
    stage.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      stage.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.classList.add('is-held');
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z };
      }
    });
    stage.addEventListener('pointermove', (event) => {
      const was = pointers.get(event.pointerId);
      if (!was) return;
      const now = { x: event.clientX, y: event.clientY };
      pointers.set(event.pointerId, now);
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0 && pinch.d > 0) z = pinch.z * (pinch.d / d);
      } else {
        const { W, H } = size();
        x -= ((now.x - was.x) / W) * 100;
        y -= ((now.y - was.y) / H) * 100;
      }
      paint();
    });
    const lift = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) stage.classList.remove('is-held');
    };
    stage.addEventListener('pointerup', lift);
    stage.addEventListener('pointercancel', lift);
    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      z *= 1 + Math.sign(event.deltaY) * 0.06;
      paint();
    }, { passive: false });
    zoom.addEventListener('input', () => {
      z = 100 / Number(zoom.value || 100);
      paint();
    });

    press(saveBtn, { sound: null });
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      const avatar = current();
      if (state.account.profile?.avatar?.frame) avatar.frame = state.account.profile.avatar.frame;
      try {
        await account.updateProfileFields(userId(), { avatar });
        state.account.profile.avatar = avatar;
        bump(state.profile, 'avatarSet');
        store.saveProfile(state.profile);
        toast(t('avatarSaved'));
        synth.playResolved();
        live.sheet.hide();
        if (state.tab === 'profile') renderProfile();
        if (state.tab === 'customize') import('./settings.js').then((m) => m.renderCustomize());
      } catch (error) {
        toast(esc(describeError(error)), 'error');
        saveBtn.disabled = false;
      }
    });
  });
}

export function findStatus(key, kind = 'muted', vars = {}) {
  el.findStatus.textContent = key ? t(key, vars) : '';
  el.findStatus.className = `find-status${kind ? ` is-${kind}` : ''}`;
}

export function findMessage(text, kind = 'error') {
  el.findStatus.textContent = text;
  el.findStatus.className = `find-status${kind ? ` is-${kind}` : ''}`;
}

export async function runSearch(event) {
  event?.preventDefault();
  const term = el.findInput.value.trim();
  if (term.length < 2) {
    state.social.results = [];
    el.findResults.replaceChildren();
    return findStatus('friendsTypeMore');
  }
  findStatus('friendsSearching', 'working');
  synth.playTap();
  try {
    state.social.results = (await account.searchPlayers(term, userId())).filter((p) => !isBlocked(p.id));
    findStatus(state.social.results.length ? null : 'friendsNoResults');
    renderFriends();
  } catch (error) {
    findMessage(describeError(error));
  }
}

export function renderFriends() {
  el.friendsTitle.textContent = t('tabFriends');
  el.friendsIntro.textContent = t('friendsIntro');
  el.findMark.innerHTML = iconSvg('search', { size: 18 });
  el.findInput.placeholder = t('friendsFindPlaceholder');
  el.findInput.setAttribute('aria-label', t('friendsFind'));
  el.findGo.textContent = t('friendsSearch');
  el.resultsLabel.textContent = t('friendsResults');
  el.incomingLabel.textContent = t('friendsIncoming');
  el.friendsLabel.textContent = t('friendsYours');
  el.outgoingLabel.textContent = t('friendsOutgoing');
  el.tradesLabel.textContent = t('friendsTrades');

  const guest = !signedIn();
  document.getElementById('screen-friends')?.classList.toggle('is-guest', guest);
  el.find.hidden = guest;
  el.findStatus.hidden = guest;
  let gate = document.getElementById('friends-gate');
  if (guest && !gate) {
    gate = gameStage('friends', t('friendsSignIn'), account.configured ? { label: t('gateSignIn'), run: () => showGate() } : null);
    gate.id = 'friends-gate';
    el.find.after(gate);
  }
  if (gate) gate.hidden = !guest;

  paintSocialTabs();
  const { friends, incoming, outgoing, results } = state.social;
  const known = new Map();
  for (const entry of friends) known.set(entry.otherId, { kind: 'friend', entry });
  for (const entry of incoming) known.set(entry.otherId, { kind: 'incoming', entry });
  for (const entry of outgoing) known.set(entry.otherId, { kind: 'outgoing', entry });

  el.findResults.replaceChildren(...results.map((person) => {
    const link = known.get(person.id);
    if (link?.kind === 'friend') {
      return personRow(person, [], { onOpen: () => openFriend(link.entry) });
    }
    if (link?.kind === 'incoming') {
      return personRow(person, [['friendsAccept', 'btn-primary', () => socialAction(
        () => account.acceptRequest(link.entry.id), 'friendsAccepted', { name: person.username })]]);
    }
    if (link?.kind === 'outgoing') return personRow(person, [], { note: 'friendsPending' });
    return personRow(person, [['friendsAdd', 'btn-primary', () => socialAction(
      () => account.sendRequest(userId(), person.id), 'friendsSent', { name: person.username })]]);
  }));

  el.incomingList.replaceChildren(...incoming.filter((entry) => entry.profile && !entry.provisional && !isBlocked(entry.otherId)).map((entry) =>
    personRow(entry.profile, [
      ['friendsAccept', 'btn-primary', () => socialAction(
        () => account.acceptRequest(entry.id), 'friendsAccepted', { name: entry.profile.username })],
      ['friendsDecline', 'btn-ghost', () => socialAction(
        () => account.removeFriendship(entry.id), 'friendsRemoved')]
    ], { data: { request: entry.id } })));

  const orderedFriends = [...friends].sort((a, b) =>
    (isFavFriend(b.otherId) - isFavFriend(a.otherId))
    || ((onlineNow(b.profile) === true) - (onlineNow(a.profile) === true))
    || a.profile.username.localeCompare(b.profile.username));

  el.friendsList.replaceChildren(...orderedFriends.map((entry) => {
    const row = personRow(entry.profile, [], { onOpen: () => openFriend(entry) });
    const bay = row.querySelector('.person-actions');
    bay.innerHTML = '';

    const unread = state.social.unread?.get?.(entry.otherId) ?? 0;
    const chatBtn = document.createElement('button');
    chatBtn.type = 'button';
    chatBtn.className = 'icon-btn is-mini';
    chatBtn.setAttribute('aria-label', unread ? `${t('chatOpen')}: ${t('inboxUnread', { n: unread })}` : t('chatOpen'));
    chatBtn.innerHTML = iconSvg('chat', { size: 17 });
    if (unread) {
      const count = makeBadge('message', unread, { cap: 9 });
      count.classList.add('count');
      chatBtn.appendChild(count);
    }
    chatBtn.addEventListener('click', (e) => { e.stopPropagation(); synth.playTap(); openChat(entry); });

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = `icon-btn is-mini fav-friend${isFavFriend(entry.otherId) ? ' is-on' : ''}`;
    favBtn.setAttribute('aria-label', t('friendFavourite'));
    favBtn.innerHTML = iconSvg(isFavFriend(entry.otherId) ? 'starFilled' : 'star', { size: 16 });
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      synth.playTap();
      toggleFavFriend(entry.otherId);
      renderFriends();
    });

    const dropBtn = document.createElement('button');
    dropBtn.type = 'button';
    dropBtn.className = 'icon-btn is-mini drop-friend';
    dropBtn.setAttribute('aria-label', t('friendsRemove'));
    dropBtn.innerHTML = iconSvg('trash', { size: 15 });
    dropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!dropBtn.classList.contains('is-armed')) {
        dropBtn.classList.add('is-armed');
        toast(t('deleteArmed'));
        setTimeout(() => dropBtn.classList.remove('is-armed'), 3500);
        return;
      }
      socialAction(() => account.removeFriendship(entry.id), 'friendsRemoved');
    });

    bay.append(chatBtn, favBtn, dropBtn);
    return row;
  }));

  const myTrades = (state.social.trades ?? [])
    .filter((tr) => tr.status === 'pending' && tr.recipient === userId() && !isBlocked(tr.proposer));
  el.tradesHead.hidden = !myTrades.length;
  el.tradesList.replaceChildren(...myTrades.map((trade) => {
    const who = friends.find((f) => f.otherId === trade.proposer)?.profile
      ?? { username: '?' };
    return personRow(who, [
      ['tradeView', 'btn-primary', async () => {
        if (!trade.offer) await refreshTrades();
        const fresh = (state.social.trades ?? []).find((tr) => tr.id === trade.id);
        if (fresh?.status === 'pending') openTradeAnswer(fresh);
      }]
    ], { data: { trade: trade.id } });
  }));

  el.outgoingList.replaceChildren(...outgoing.map((entry) =>
    personRow(entry.profile, [
      ['friendsCancel', 'btn-ghost', () => socialAction(
        () => account.removeFriendship(entry.id), 'friendsRemoved')]
    ])));

  el.resultsHead.hidden = !results.length;
  el.incomingHead.hidden = !el.incomingList.childElementCount;
  el.friendsHead.hidden = !friends.length;
  el.outgoingHead.hidden = !outgoing.length;

  el.friendsStale.hidden = account.socialTablesReady();
  if (!account.socialTablesReady()) {
    el.friendsStale.textContent = t('schemaOldNote');
  }

  const nothing = !friends.length && !incoming.length && !outgoing.length && !results.length;
  el.friendsEmpty.hidden = !nothing;
  if (nothing) {
    el.friendsEmptyMark.innerHTML = iconSvg('friends', { size: 46 });
    el.friendsEmptyText.textContent = t('friendsEmpty');
  }
  reveal(el.friendsList.children, { step: 26, from: 10 });
}

export function openFriend(entry) {
  state.viewing = entry;
  renderFriend();
  showScreen('friend');
  loadFriendCards(entry);
}

export let friendSeg;

export function paintFriendPresence() {
  const person = state.viewing?.profile;
  if (!person) return;
  const level = clampLevel(person.level);
  const online = onlineNow(person);
  const since = online ? '' : lastSeenText(person);
  el.friendRank.innerHTML = (online === null ? ''
    : `<span class="presence-dot is-inline${online ? ' is-online' : ''}"></span> `
      + esc(online ? t('friendOnline') : t('friendOffline')) + ' · ')
    + esc(tx(rankFor(level).name))
    + (since ? `<small class="friend-seen">${esc(since)}</small>` : '');
}

export function renderFriend() {
  const entry = state.viewing;
  if (!entry) return;
  const person = entry.profile;
  const level = clampLevel(person.level);

  entry.look = wearLook(el.screens.friend, person.appearance);
  sceneFor(entry.look);
  el.friendBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.friendName.textContent = person.username ?? '';
  live.friendRing.set(level >= MAX_LEVEL ? 1 : 0, String(level));
  el.friendRing.classList.toggle('is-max', level >= MAX_LEVEL);
  paintFrameInto(el.friendRing, person.avatar?.frame?.style ?? null, person.avatar?.frame?.style ? frameTier(level) : 0);
  paintRingFace(el.friendRing, person);
  el.friendLevel.textContent = level >= MAX_LEVEL ? t('profileMax') : t('profileLevel', { n: level });
  paintFriendPresence();
  el.friendStatsLabel.textContent = t('profileStats');
  el.friendRarityLabel.textContent = t('statRarity');
  el.friendCardsLabel.textContent = t('friendCollection');
  el.friendRemove.textContent = t('friendsRemove');

  const actionBtn = (icon, labelKey, run, kind = 'btn-ghost') => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${kind}`;
    btn.innerHTML = `${iconSvg(icon, { size: 15 })}<span style="margin-left:6px">${esc(t(labelKey))}</span>`;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); run(); });
    return btn;
  };
  el.friendActions.replaceChildren(
    actionBtn('chat', 'chatOpen', () => openChat(entry), 'btn-primary'),
    actionBtn('trade', 'tradeOpen', () => openTradeSheet(entry)),
    actionBtn('gift', 'giftOpen', () => openGiftChooser(entry)),
    actionBtn('wish', 'wishTitle', () => openFriendWishlist(entry)),
    actionBtn('dice', 'friendChallenge', () => import('./versus.js').then((m) => { showScreen('versus'); m.renderVersus({ friendId: entry.otherId }); })),
    actionBtn('flag', 'reportPlayer', () => openReport({ kind: 'player', target: entry.otherId, name: person.username ?? '' })),
    actionBtn('block', 'blockPlayer', () => confirmBlock({ id: entry.otherId, name: person.username ?? '' }, () => {
      state.viewing = null;
      state.social.friends = state.social.friends.filter((f) => f.otherId !== entry.otherId);
      showScreen('friends');
      renderFriends();
      syncSocial();
    }))
  );

  if (!friendSeg) {
    friendSeg = new Segmented(el.friendSeg, [
      { id: 'albums', label: t('viewAlbums') },
      { id: 'classic', label: t('viewClassic') }
    ], (view) => {
      state.friendView = view;
      paintFriendCards();
    });
  }
  friendSeg.relabel([{ label: t('viewAlbums') }, { label: t('viewClassic') }]);
  friendSeg.select(state.friendView, { silent: true });

  paintFriendStats(entry);
  paintFriendShowcase(entry);
  paintFriendBadges(entry);
  freshFriendStats(entry);
}

export function friendAch(profile) {
  const raw = profile?.badges;
  return Array.isArray(raw) ? null : (Number.isFinite(raw?.ach) ? raw.ach : null);
}

export function paintFriendBadges(entry) {
  loadHonours().then((m) => m.paintFriendBadges(entry)).catch(() => {});
}

export async function paintFriendShowcase(entry) {
  const person = entry.profile;
  const pins = (Array.isArray(person?.showcase) ? person.showcase : []).filter((c) => c && c.key).slice(0, SHOWCASE_MAX).map((c) => withSpecialPhoto({ ...c }));
  el.friendShowcaseHead.hidden = !pins.length;
  el.friendShowcase.hidden = !pins.length;
  if (!pins.length) return;
  el.friendShowcaseLabel.textContent = t('showcaseFriendLabel');
  const me = userId();
  let hearts = recall('kudos', entry.otherId) ?? [];
  let touched = false;
  const painters = [];
  const count = (key) => hearts.filter((k) => k.key === key).length;
  const mine = (key) => hearts.some((k) => k.key === key && k.sender === me);
  const fetching = account.showcaseKudos(entry.otherId).then((rows) => rows ?? [], () => null);
  el.friendShowcase.replaceChildren(...pins.map((card) => {
    const slot = document.createElement('div');
    slot.className = 'showcase-slot';
    const node = fxOn(buildStaticCard(card, rarityOfCard(card), null, { fav: false, wish: false }), entry.look, rarityOfCard(card));
    node.addEventListener('click', () => openCardDetail(card.key, card, rarityOfCard(card)));
    const heart = document.createElement('button');
    heart.type = 'button';
    heart.className = `showcase-kudos${mine(card.key) ? ' is-on' : ''}`;
    const paint = () => {
      heart.classList.toggle('is-on', mine(card.key));
      heart.innerHTML = `${iconSvg('heart', { size: 14 })}<span class="tabular"></span>`;
      heart.querySelector('span').textContent = String(count(card.key));
      heart.setAttribute('aria-label', t(mine(card.key) ? 'showcaseKudosTaken' : 'showcaseKudosLabel'));
    };
    paint();
    const flip = (on) => {
      hearts = on ? [...hearts, { key: card.key, sender: me }] : hearts.filter((k) => !(k.key === card.key && k.sender === me));
      remember('kudos', entry.otherId, hearts, { disk: false });
    };
    let confirmed = mine(card.key);
    let sending = false;
    painters.push(() => { confirmed = mine(card.key); paint(); });
    const settle = async () => {
      if (sending) return;
      sending = true;
      while (mine(card.key) !== confirmed) {
        const on = mine(card.key);
        try {
          await account.setKudos(entry.otherId, card.key, me, on);
          confirmed = on;
          if (on) { bump(state.profile, 'kudosGiven'); store.saveProfile(state.profile); }
        } catch (error) {
          flip(confirmed);
          paint();
          toast(esc(describeError(error)), 'error');
          break;
        }
      }
      sending = false;
    };
    press(heart, { sound: null });
    heart.addEventListener('click', () => {
      touched = true;
      flip(!mine(card.key));
      synth.playTap();
      paint();
      settle();
    });
    slot.append(node, heart);
    return slot;
  }));
  const fresh = await fetching;
  if (!fresh || touched || state.viewing !== entry) return;
  hearts = fresh;
  remember('kudos', entry.otherId, hearts, { disk: false });
  for (const fn of painters) fn();
}

export const STATS_TTL = 30000;
const statsBusy = new Map();

export function statsAge(id) {
  const at = statsSeen.get(id);
  return at ? Date.now() - at : Infinity;
}

export function paintStamp(node, id) {
  if (!node) return;
  const busy = statsBusy.has(id);
  const age = statsAge(id);
  const fresh = age < STATS_TTL;
  node.classList.toggle('is-busy', busy);
  if (busy && !fresh) {
    node.hidden = false;
    node.textContent = t('statsUpdating');
  } else if (!fresh && Number.isFinite(age)) {
    node.hidden = false;
    node.textContent = t('statsUpdatedAt', { when: whenText(new Date(Date.now() - age).toISOString()) });
  } else {
    node.hidden = true;
    node.textContent = '';
  }
}

export function freshFriendStats(entry, { force = false } = {}) {
  const id = entry?.otherId;
  if (!id || !signedIn()) return Promise.resolve(false);
  if (!force && statsAge(id) < STATS_TTL) { paintStamp(el.friendStatsStamp, id); return Promise.resolve(false); }
  if (statsBusy.has(id)) return statsBusy.get(id);
  const run = (async () => {
    let changed = false;
    let lookMoved = false;
    try {
      const row = await account.profileStats(id);
      if (row) {
        const before = JSON.stringify(entry.profile);
        const lookBefore = JSON.stringify(entry.profile.appearance ?? null);
        Object.assign(entry.profile, row);
        lookMoved = lookBefore !== JSON.stringify(entry.profile.appearance ?? null);
        const friend = state.social.friends.find((f) => f.otherId === id);
        if (friend && friend !== entry) Object.assign(friend.profile, row);
        changed = before !== JSON.stringify(entry.profile);
        statsSeen.set(id, Date.now());
      }
    } catch {}
    statsBusy.delete(id);
    if (state.viewing?.otherId === id && state.tab === 'friend') {
      if (lookMoved) {
        entry.look = wearLook(el.screens.friend, entry.profile.appearance);
        sceneFor(entry.look);
        paintFriendShowcase(entry);
      }
      if (changed) { paintFriendStats(entry); paintFriendBadges(entry); }
      else paintStamp(el.friendStatsStamp, id);
    }
    return changed;
  })();
  statsBusy.set(id, run);
  if (state.viewing?.otherId === id) paintStamp(el.friendStatsStamp, id);
  return run;
}

export function paintFriendStats(entry) {
  const person = entry.profile;
  const cards = Array.isArray(entry.cards) ? entry.cards : null;
  const best = rarityById(person.best_rarity);
  const stats = [
    [t('statPlaytime'), formatDuration(person.play_ms ?? 0)],
    [t('statAccountAge'), new Date(person.created_at ?? Date.now())
      .toLocaleDateString(getLanguage(), { year: 'numeric', month: 'short', day: 'numeric' })],
    [t('statBoosters'), (person.boosters_opened ?? 0).toLocaleString()],
    [t('statCards'), (person.cards ?? 0).toLocaleString()],
    [t('statUnique'), (person.unique_cards ?? 0).toLocaleString()],
    [t('statValue'), formatAmount(person.collection_value ?? 0)],
    [t('statAchievements'), (() => { const n = friendAch(person); return n == null ? '…' : String(n); })()],
    [t('statBest'), person.best_rarity && best ? tx(best.name) : t('none')]
  ];
  paintStamp(el.friendStatsStamp, entry.otherId);
  import('./statsboard.js').then(({ paintPublicStatsBoard }) => {
    if (state.viewing && state.viewing.otherId !== entry.otherId) return;
    const board = paintPublicStatsBoard(el.friendStats, person.stats, person);
    el.friendStats.className = board ? 'stat-board' : 'stat-grid';
    if (!board) el.friendStats.replaceChildren(...stats.map(([label, value]) => {
      const cell = document.createElement('div');
      cell.className = 'stat-cell';
      cell.innerHTML = '<b></b><span></span>';
      cell.querySelector('b').textContent = value;
      cell.querySelector('span').textContent = label;
      return cell;
    }));
  }).catch(() => {});

  const counts = {};
  for (const card of cards ?? []) counts[card.rarityId] = (counts[card.rarityId] ?? 0) + (card.count ?? 1);
  const peak = Math.max(1, ...RARITIES.map((r) => counts[r.id] ?? 0));
  el.friendRarityLabel.parentElement.hidden = !cards;
  el.friendRarityBars.hidden = !cards;
  el.friendRarityBars.replaceChildren(...(cards ? RARITIES : []).map((rarity) => {
    const count = counts[rarity.id] ?? 0;
    const row = document.createElement('div');
    row.className = 'rarity-row';
    row.innerHTML = `<span class="rarity-name"></span><span class="rarity-track"></span><span class="rarity-count"></span>`;
    const name = row.querySelector('.rarity-name');
    name.textContent = tx(rarity.name);
    name.style.color = rarityText(rarity);
    const bar = new Bar(row.querySelector('.rarity-track'));
    bar.set(count / peak, { animate: false });
    bar.fill.style.background = rarity.color;
    row.querySelector('.rarity-count').textContent = count.toLocaleString();
    return row;
  }));
}
export async function findWishMatches() {
  const wanted = new Map([...state.wishlist.values()].map((c) => [c.key, c]));
  const matches = [];
  if (!wanted.size) return matches;
  for (const entry of state.social.friends.slice(0, 30)) {
    let theirs = [];
    try { theirs = (await account.friendCollection(entry.otherId)) ?? []; } catch { theirs = []; }
    const held = theirs.filter((c) => wanted.has(c.key) && !store.isLocked(c));
    if (held.length) matches.push({ entry, cards: held, spare: held.filter((c) => (c.count ?? 1) > 1).length });
  }
  return matches.sort((a, b) => b.spare - a.spare || b.cards.length - a.cards.length);
}

export function openWishMatches() {
  openSheet(t('wishMatchTitle'), async (body) => {
    body.innerHTML = `<p class="muted" style="font-size:.84rem" data-status></p><div class="settings-list" style="padding:0;margin-top:10px" data-list></div>`;
    const status = body.querySelector('[data-status]');
    const list = body.querySelector('[data-list]');
    if (!signedIn()) { status.textContent = t('wishMatchSignIn'); return; }
    if (!state.wishlist.size) { status.textContent = t('wishEmpty'); return; }
    if (!state.social.friends.length) { status.textContent = t('wishMatchNoFriends'); return; }
    status.textContent = t('wishMatchLooking', { n: state.social.friends.length });
    const matches = await findWishMatches();
    if (!body.isConnected) return;
    status.textContent = matches.length ? t('wishMatchFound', { n: matches.length }) : t('wishMatchNone');
    list.replaceChildren(...matches.map(({ entry, cards, spare }) => {
      const row = personRow(entry.profile, [], { onOpen: null });
      row.querySelector('.person-copy span').textContent = t(spare ? 'wishMatchLineSpare' : 'wishMatchLine', { n: cards.length, spare, cards: cards.slice(0, 3).map((c) => c.title).join(', ') });
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'btn btn-sm btn-primary';
      go.textContent = t('wishMatchTrade');
      press(go, { sound: null });
      go.addEventListener('click', () => {
        synth.playTap();
        live.sheet.hide();
        setTimeout(() => openTradeSheet(entry, { ask: cards.map((c) => c.key) }), 260);
      });
      row.querySelector('.person-actions').appendChild(go);
      return row;
    }));
  });
}

export function openFriendWishlist(entry) {
  const person = entry.profile;
  openSheet(t('friendWishTitle', { name: person.username ?? '?' }), async (body) => {
    body.innerHTML = `<p class="find-status is-working">${esc(t('friendLoading'))}</p>`;
    let wishes = [];
    let theirs = new Set();
    try {
      const [rows, cards] = await Promise.all([
        account.wishlistOf(entry.otherId),
        account.friendCollection(entry.otherId).catch(() => null)
      ]);
      wishes = rows;
      theirs = new Set((cards ?? []).map((card) => card.key));
    } catch (error) {
      body.innerHTML = `<p class="find-status is-error"></p>`;
      body.querySelector('p').textContent =
        error?.message === 'INDEX_UNSET' ? t('indexUnset') : describeError(error);
      return;
    }
    if (!wishes.length) {
      body.innerHTML = `<p class="empty-note"></p>`;
      body.querySelector('p').textContent = t('friendWishEmpty', { name: person.username ?? '?' });
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'market-list';
    grid.replaceChildren(...wishes.map((row) => {
      const card = row.card ?? {};
      const tile = document.createElement('div');
      tile.className = 'auction-tile';
      if (theirs.has(card.key)) {
        const band = document.createElement('span');
        band.className = 'auction-band is-good';
        band.textContent = t('friendOwnsBand', { name: person.username ?? '?' });
        tile.appendChild(band);
      }
      const rarity = rarityById(card.rarityId) ?? RARITIES[0];
      tile.appendChild(buildStaticCard({ ...card, description: '', extract: '' }, rarity, null,
        { fav: false, ownedTag: true }));
      return tile;
    }));
    body.replaceChildren(grid);
  });
}

export async function loadFriendCards(entry) {
  const kept = recall('friendCards', entry.otherId);
  entry.cards = Array.isArray(kept) ? kept : undefined;
  paintFriendCards();
  el.friendCardsLabel.classList.add('is-refreshing');
  try {
    const cards = await account.friendCollection(entry.otherId);
    if (state.viewing !== entry) return;
    if (Array.isArray(cards)) remember('friendCards', entry.otherId, cards, { disk: false });
    const same = JSON.stringify(cards) === JSON.stringify(entry.cards);
    entry.cards = cards;
    if (!same) {
      paintFriendCards();
      paintFriendStats(entry);
    }
  } catch (error) {
    if (state.viewing !== entry) return;
    if (Array.isArray(entry.cards)) return;
    entry.cards = null;
    paintFriendCards();
    el.friendCardsStatus.textContent = describeError(error);
    el.friendCardsStatus.className = 'find-status is-error';
  } finally {
    if (state.viewing === entry) el.friendCardsLabel.classList.remove('is-refreshing');
  }
}

export function paintFriendCards() {
  const entry = state.viewing;
  if (!entry) return;
  const classic = state.friendView === 'classic';
  const cards = entry.cards;
  el.friendAlbums.replaceChildren();
  el.friendClassic.replaceChildren();
  el.friendAlbums.hidden = classic;
  el.friendClassic.hidden = !classic;
  el.friendSegWrap.hidden = !Array.isArray(cards) || !cards.length;

  if (cards === undefined) {
    el.friendCardsStatus.textContent = t('friendLoading');
    el.friendCardsStatus.className = 'find-status is-working';
    return;
  }
  if (cards === null) {
    el.friendCardsStatus.textContent = t('friendPrivate');
    el.friendCardsStatus.className = 'find-status is-muted';
    return;
  }
  el.friendCardsStatus.textContent = cards.length ? '' : t('friendNoCards');
  el.friendCardsStatus.className = 'find-status is-muted';

  const albums = buildAlbums(cards, []).filter((a) => a.unlocked);
  if (classic) {
    const sorted = [...cards].sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
    el.friendClassic.replaceChildren(...classicSections(sorted, albums, (card) => {
      const rarity = rarityById(card.rarityId) ?? RARITIES[0];
      const node = fxOn(buildStaticCard(card, rarity, null, { fav: false }), entry.look, rarity);
      node.addEventListener('click', () => { synth.playTap(); openCardDetail(card.key, card, rarity); });
      return node;
    }));
    reveal(el.friendClassic.children, { step: 40 });
    return;
  }

  el.friendAlbums.replaceChildren(...albums.map((album) => {
    const cover = buildAlbumCover(album).cloneNode(true);
    press(cover, { sound: null });
    cover.addEventListener('click', () => {
      synth.playTap();
      openFriendAlbum(entry, album);
    });
    return cover;
  }));
  reveal(el.friendAlbums.children, { step: 22, from: 10 });
}

export function openFriendAlbum(entry, album) {
  openSheet(`${album.name} · ${entry.profile.username}`, (body) => {
    const grid = document.createElement('div');
    grid.className = 'sheet-card-grid';
    const sorted = [...album.entries]
      .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
    grid.replaceChildren(...sorted.map((card) => {
      const node = buildStaticCard(card, rarityById(card.rarityId), null, { fav: false });
      if ((card.count ?? 1) > 1) {
        const badge = document.createElement('span');
        badge.className = 'copy-badge';
        badge.textContent = `×${card.count}`;
        node.appendChild(badge);
      }
      return node;
    }));
    body.appendChild(grid);
  });
}
