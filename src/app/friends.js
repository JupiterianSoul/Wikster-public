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
import { openFriend, openPlayer } from './player.js';
import './playertag.js';

export {
  freshFriendStats, leaveFriend, openFriend, openFriendWishlist, openPlayer, paintFriendPresence,
  paintFriendStats, refreshViewedRelation, relationOf, renderFriend, returnToFriend, STATS_TTL, statsAge
} from './player.js';

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
    const face = document.createElement('button');
    face.type = 'button';
    face.className = 'trade-who';
    face.dataset.player = trade.proposer;
    face.dataset.playerName = name;
    face.innerHTML = `<span class="person-mark" aria-hidden="true"></span><span class="trade-who-name"></span>${iconSvg('chevronRight', { size: 16 })}`;
    face.querySelector('.trade-who-name').textContent = t('chatSeeProfile', { name });
    paintAvatarInto(face.querySelector('.person-mark'), who?.profile ?? { username: name });
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
    body.prepend(face);
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

  const seeOf = (person) => () => openPlayer(person.id, { name: person.username, level: person.level, from: 'friends' });
  el.findResults.replaceChildren(...results.map((person) => {
    const link = known.get(person.id);
    if (link?.kind === 'friend') {
      return personRow(person, [], { onOpen: () => openFriend(link.entry) });
    }
    if (link?.kind === 'incoming') {
      return personRow(person, [['friendsAccept', 'btn-primary', () => socialAction(
        () => account.acceptRequest(link.entry.id), 'friendsAccepted', { name: person.username })]], { onOpen: seeOf(person) });
    }
    if (link?.kind === 'outgoing') return personRow(person, [], { note: 'friendsPending', onOpen: seeOf(person) });
    return personRow(person, [['friendsAdd', 'btn-primary', () => socialAction(
      () => account.sendRequest(userId(), person.id), 'friendsSent', { name: person.username })]], { onOpen: seeOf(person) });
  }));

  el.incomingList.replaceChildren(...incoming.filter((entry) => entry.profile && !entry.provisional && !isBlocked(entry.otherId)).map((entry) =>
    personRow(entry.profile, [
      ['friendsAccept', 'btn-primary', () => socialAction(
        () => account.acceptRequest(entry.id), 'friendsAccepted', { name: entry.profile.username })],
      ['friendsDecline', 'btn-ghost', () => socialAction(
        () => account.removeFriendship(entry.id), 'friendsRemoved')]
    ], { data: { request: entry.id }, onOpen: () => openPlayer(entry.otherId, { name: entry.profile.username, level: entry.profile.level, from: 'friends' }) })));

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
    ], { onOpen: () => openPlayer(entry.otherId, { name: entry.profile.username, level: entry.profile.level, from: 'friends' }) })));

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
