import { SHOWCASE_MAX } from '../showcase.js';
import { withSpecialPhoto } from '../codedefs.js';
import * as account from '../account.js';
import { bump } from '../ledger.js';
import { getLanguage, t, tx } from '../i18n.js';
import { MAX_LEVEL, clampLevel, rankFor } from '../progression.js';
import { Bar, Segmented, press, reveal } from '../ui/components.js';
import { iconSvg } from '../data/icons.js';
import { synth } from '../ui/sound.js';
import { h } from '../ui/dom.js';
import * as store from '../collection.js';
import { RARITIES, rarityById, rarityOfCard, rarityRank, rarityText } from '../data/rarities.js';
import { frameTier } from '../frames.js';
import { buildAlbums } from '../albums.js';
import { badgeStateFromRank } from '../badges.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { el, esc, openSheet, showScreen, state, toast } from './core.js';
import { buildStaticCard, openCardDetail } from './detail.js';
import { whenText } from './drawer.js';
import { describeError, showGate, signedIn, userId } from './gate.js';
import { live } from './live.js';
import { recall, remember } from './memo.js';
import { pending } from './pending.js';
import { paintFrameInto } from './regalia.js';
import { badgeChip, friendShelf } from './honours.js';
import { buildAlbumCover, classicSections } from './binder.js';
import { confirmBlock, isBlocked, openReport } from './safety.js';
import { fxOn, sceneFor, wearLook } from './lookview.js';
import { paintPartialStatsBoard, paintPublicStatsBoard } from './statsboard.js';
import { renderProfile } from './profile.js';
import { lastSeenText, onlineNow, openChat, paintRingFace, socialAction, statsSeen, syncSocial } from './social.js';
import { openGiftChooser, openTradeSheet, renderFriends } from './friends.js';

const $ = (id) => document.getElementById(id);
const OPEN_WAIT_MS = 8000;
const GUILD_TTL = 5 * 60 * 1000;

const dateText = (ms) => new Date(ms).toLocaleDateString(getLanguage(), { day: 'numeric', month: 'short', year: 'numeric' });

export function relationOf(id) {
  const social = state.social;
  const friend = social.friends.find((f) => f.otherId === id);
  if (friend) return { kind: 'friend', entry: friend };
  const incoming = social.incoming.find((f) => f.otherId === id);
  if (incoming) return { kind: 'incoming', entry: incoming };
  const outgoing = social.outgoing.find((f) => f.otherId === id);
  if (outgoing) return { kind: 'outgoing', entry: outgoing };
  return { kind: 'none', entry: null };
}

const isFriend = (entry) => relationOf(entry?.otherId).kind === 'friend';

function originNow() {
  if (state.tab === 'friend') return state.friendFrom ?? 'friends';
  return state.tab || 'friends';
}

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
]);

export function openFriend(entry, { from = null } = {}) {
  let origin = from ?? originNow();
  if (origin === 'chat' && state.chatFrom === 'friend' && state.viewing?.otherId === entry.otherId) {
    entry = state.viewing;
    origin = state.friendFrom ?? 'friends';
  } else if (origin === 'chat') {
    state.friendChatFrom = state.chatFrom ?? 'friends';
  }
  state.friendFrom = origin === 'friend' ? 'friends' : origin;
  state.viewing = entry;
  delete entry.failed;
  delete entry.hidden;
  renderFriend();
  showScreen('friend');
  loadFriendCards(entry);
  loadGuildOf(entry);
}

const opening = new Set();

export async function openPlayer(id, { name = '', level = null, from = null, node = null } = {}) {
  if (!id) return;
  if (id === userId()) {
    renderProfile();
    showScreen('profile');
    return;
  }
  if (!signedIn()) { showGate(); return; }
  const rel = relationOf(id);
  if (rel.kind === 'friend') { openFriend(rel.entry, { from }); return; }
  if (opening.has(id)) return;
  const origin = from ?? originNow();
  const kept = recall('player', id);
  const base = rel.entry?.profile ?? kept ?? null;
  const entry = {
    id: rel.entry?.id ?? null,
    otherId: id,
    stranger: true,
    profile: { id, username: name || '?', level: Number(level) || 1, ...(base ?? {}) }
  };
  if (!base) {
    const tabAt = state.tab;
    opening.add(id);
    node?.classList.add('is-busy');
    node?.setAttribute('aria-busy', 'true');
    try {
      const row = await withTimeout(account.profileStats(id), OPEN_WAIT_MS);
      if (row) {
        Object.assign(entry.profile, row);
        remember('player', id, row, { disk: false });
        statsSeen.set(id, Date.now());
      } else {
        entry.hidden = true;
      }
    } catch (error) {
      entry.failed = error;
    } finally {
      opening.delete(id);
      node?.classList.remove('is-busy');
      node?.removeAttribute('aria-busy');
    }
    if (state.tab !== tabAt) return;
  }
  state.friendFrom = origin === 'friend' ? 'friends' : origin;
  state.viewing = entry;
  renderFriend();
  showScreen('friend');
  loadFriendCards(entry);
  if (!entry.failed && !entry.hidden) loadGuildOf(entry);
}

export function leaveFriend() {
  const from = state.friendFrom ?? 'friends';
  const entry = state.viewing;
  state.viewing = null;
  state.friendFrom = null;
  if (from === 'chat') {
    const talk = state.chat ?? (entry && relationOf(entry.otherId).entry);
    if (talk && isFriend(talk)) { openChat(talk, { from: state.friendChatFrom ?? 'friends' }); return; }
  }
  if (from === 'discussions') { import('./inbox.js').then((m) => m.openTarget('discussions')); return; }
  if (from === 'profile') { renderProfile(); showScreen('profile'); return; }
  if (from === 'friends' || from === 'chat' || !el.screens[from]) {
    renderFriends();
    showScreen('friends');
    return;
  }
  showScreen(from);
}

export function returnToFriend() {
  if (!state.viewing) { renderFriends(); showScreen('friends'); return; }
  renderFriend();
  showScreen('friend');
}

export let friendSeg;

export function paintFriendPresence() {
  const entry = state.viewing;
  const person = entry?.profile;
  const node = el.friendRank;
  if (!person || !node) return;
  const online = isFriend(entry) ? onlineNow(person) : account.isOnline(person);
  if (online === null || entry.failed || entry.hidden) {
    node.hidden = true;
    node.replaceChildren();
    return;
  }
  node.hidden = false;
  const since = online ? '' : lastSeenText(person);
  node.classList.toggle('is-online', online);
  node.replaceChildren(...[
    h('span.presence-dot.is-inline', { class: online ? 'is-online' : null, 'aria-hidden': 'true' }),
    h('span', online ? t('friendOnline') : t('friendOffline')),
    since ? h('small.friend-seen', since) : null
  ].filter(Boolean));
}

function metaChip(icon, text, kind) {
  return h('span.friend-chip', { dataset: { meta: kind } }, h('span.friend-chip-icon', { html: iconSvg(icon, { size: 14 }), 'aria-hidden': 'true' }), h('span', text));
}

function paintMeta(entry) {
  const person = entry.profile ?? {};
  const chips = [];
  const guild = entry.guild;
  if (guild?.name) chips.push(metaChip('shield', guild.tag ? `${guild.name} [${guild.tag}]` : guild.name, 'guild'));
  const joined = Date.parse(person.created_at ?? '');
  if (Number.isFinite(joined)) chips.push(metaChip('calendar', t('friendJoined', { date: dateText(joined) }), 'joined'));
  const rel = relationOf(entry.otherId);
  const since = Date.parse(rel.entry?.created_at ?? '');
  if (rel.kind === 'friend' && Number.isFinite(since)) chips.push(metaChip('friends', t('friendSince', { date: dateText(since) }), 'friends'));
  const meta = $('friend-meta');
  meta.replaceChildren(...chips);
  meta.hidden = !chips.length;
}

function paintHero(entry) {
  const person = entry.profile ?? {};
  const level = clampLevel(person.level);
  const known = !entry.failed;
  live.friendRing.set(known && level >= MAX_LEVEL ? 1 : 0, known ? String(level) : String(person.username ?? '?').slice(0, 1).toUpperCase());
  el.friendRing.classList.toggle('is-max', level >= MAX_LEVEL);
  paintFrameInto(el.friendRing, person.avatar?.frame?.style ?? null, person.avatar?.frame?.style ? frameTier(level) : 0);
  paintRingFace(el.friendRing, person);
  el.friendName.textContent = person.username ?? '';
  el.friendLevel.hidden = !known;
  el.friendLevel.textContent = level >= MAX_LEVEL
    ? `${t('profileMax')} · ${tx(rankFor(level).name)}`
    : t('friendsLevelLine', { n: level, rank: tx(rankFor(level).name) });
  paintFriendPresence();
  paintMeta(entry);
  paintFriendBadges(entry);
}

function actionButton(kind, icon, label, run, { id = null, disabled = false } = {}) {
  const btn = h(`button.btn.${kind}`, { type: 'button', dataset: id ? { act: id } : null, disabled },
    h('span.friend-act-icon', { html: iconSvg(icon, { size: 18 }), 'aria-hidden': 'true' }),
    h('span.friend-act-label', label));
  press(btn, { sound: null });
  btn.addEventListener('click', () => { synth.playTap(); run(btn); });
  return btn;
}

function afterRelation(id) {
  const entry = state.viewing;
  if (!entry || entry.otherId !== id) return;
  const rel = relationOf(id);
  if (rel.kind === 'friend' && rel.entry !== entry && !entry.stranger) {
    paintFriendActions(entry);
    paintMeta(entry);
    return;
  }
  if (rel.kind === 'friend' && rel.entry !== entry) {
    rel.entry.profile = { ...entry.profile, ...rel.entry.profile };
    rel.entry.guild = entry.guild;
    state.viewing = rel.entry;
    renderFriend();
    loadFriendCards(rel.entry);
    return;
  }
  if (rel.kind !== 'friend') { entry.cards = null; entry.stranger = true; }
  renderFriend();
}

function startChat(entry) {
  const rel = relationOf(entry.otherId);
  if (rel.kind !== 'friend') return;
  if (state.friendFrom === 'chat' && state.chat?.otherId === entry.otherId) { leaveFriend(); return; }
  openChat(rel.entry, { from: 'friend' });
}

export function paintFriendActions(entry) {
  const box = el.friendActions;
  const id = entry.otherId;
  const name = entry.profile?.username ?? '';
  const rel = relationOf(id);
  box.dataset.relation = rel.kind;
  if (entry.failed || isBlocked(id)) { box.replaceChildren(); box.hidden = true; return; }
  box.hidden = false;
  if (rel.kind === 'friend') {
    const versus = () => import('./versus.js').then((m) => { showScreen('versus'); m.renderVersus({ friendId: id }); });
    box.replaceChildren(
      actionButton('btn-primary.friend-go', 'chat', t('chatOpen'), () => startChat(entry), { id: 'message' }),
      h('div.friend-tiles',
        actionButton('btn-ghost.friend-tile', 'trade', t('tradeOpen'), () => openTradeSheet(rel.entry), { id: 'trade' }),
        actionButton('btn-ghost.friend-tile', 'gift', t('giftOpen'), () => openGiftChooser(rel.entry), { id: 'gift' }),
        actionButton('btn-ghost.friend-tile', 'dice', t('friendChallenge'), versus, { id: 'challenge' }),
        actionButton('btn-ghost.friend-tile', 'wish', t('friendWishShort'), () => openFriendWishlist(rel.entry), { id: 'wishlist' })));
    return;
  }
  if (rel.kind === 'incoming') {
    box.replaceChildren(
      h('p.friend-ask', t('friendAsked', { name })),
      h('div.friend-pair',
        actionButton('btn-primary.friend-go', 'check', t('friendsAccept'), (btn) => pending(`friend:accept:${id}`, btn, () =>
          socialAction(() => account.acceptRequest(rel.entry.id), 'friendsAccepted', { name }).then(() => afterRelation(id))), { id: 'accept' }),
        actionButton('btn-ghost.friend-go', 'close', t('friendsDecline'), (btn) => pending(`friend:decline:${id}`, btn, () =>
          socialAction(() => account.removeFriendship(rel.entry.id), 'friendsRemoved').then(() => afterRelation(id))), { id: 'decline' })));
    return;
  }
  if (rel.kind === 'outgoing') {
    box.replaceChildren(
      actionButton('btn-ghost.friend-go.is-waiting', 'hourglass', t('friendsPending'), () => {}, { id: 'pending', disabled: true }),
      h('button.btn.btn-ghost.btn-sm.friend-cancel', {
        type: 'button', dataset: { act: 'cancel' },
        onclick: (event) => {
          synth.playTap();
          pending(`friend:cancel:${id}`, event.currentTarget, () =>
            socialAction(() => account.removeFriendship(rel.entry.id), 'friendsRemoved').then(() => afterRelation(id)));
        }
      }, t('friendCancelRequest')));
    return;
  }
  box.replaceChildren(
    actionButton('btn-primary.friend-go', 'addFriend', t('friendAddFriend'), (btn) => pending(`friend:add:${id}`, btn, () =>
      socialAction(() => account.sendRequest(userId(), id), 'friendsSent', { name }).then(() => afterRelation(id))), { id: 'add' }));
}

function removeFriend(entry) {
  const rel = relationOf(entry.otherId);
  if (rel.kind !== 'friend') return;
  socialAction(() => account.removeFriendship(rel.entry.id), 'friendsRemoved').then(() => afterRelation(entry.otherId));
}

export function openFriendMenu() {
  const entry = state.viewing;
  if (!entry) return;
  const id = entry.otherId;
  const name = entry.profile?.username ?? '';
  const rel = relationOf(id);
  openSheet(name, (body) => {
    const row = (icon, label, run, { danger = false, act = '' } = {}) => {
      const btn = h('button.btn.btn-ghost.friend-menu-row', { type: 'button', class: danger ? 'is-danger' : null, dataset: { act } },
        h('span.friend-menu-icon', { html: iconSvg(icon, { size: 18 }), 'aria-hidden': 'true' }),
        h('span.friend-menu-label', label));
      press(btn, { sound: null });
      btn.addEventListener('click', () => { synth.playTap(); run(btn); });
      return btn;
    };
    const list = h('div.friend-menu');
    if (rel.kind === 'friend') {
      list.append(row('trash', t('friendsRemove'), (btn) => {
        if (btn.dataset.armed !== '1') {
          btn.dataset.armed = '1';
          btn.querySelector('.friend-menu-label').textContent = t('friendsRemoveConfirm');
          btn.classList.add('is-armed');
          synth.playArm();
          return;
        }
        live.sheet.hide();
        removeFriend(entry);
      }, { danger: true, act: 'remove' }));
    }
    list.append(
      row('flag', t('reportPlayer'), () => openReport({ kind: 'player', target: id, name }), { act: 'report' }),
      row('block', t('blockPlayer'), () => confirmBlock({ id, name }, () => {
        state.viewing = null;
        state.friendFrom = null;
        state.social.friends = state.social.friends.filter((f) => f.otherId !== id);
        showScreen('friends');
        renderFriends();
        syncSocial();
      }), { danger: true, act: 'block' }));
    body.append(list);
  });
}

function paintState(entry) {
  const box = $('friend-state');
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!entry.failed && !entry.hidden) { box.hidden = true; box.replaceChildren(); return; }
  const icon = entry.hidden ? 'lock' : offline ? 'cloud' : 'block';
  const text = entry.hidden ? t('friendPrivateProfile') : offline ? t('friendOfflineNote') : t('friendLoadError');
  const parts = [h('span.friend-state-icon', { html: iconSvg(icon, { size: 30 }), 'aria-hidden': 'true' }), h('p', text)];
  if (entry.failed) {
    const retry = h('button.btn.btn-primary.btn-sm', { type: 'button', dataset: { act: 'retry' } }, t('retry'));
    press(retry, { sound: null });
    retry.addEventListener('click', () => {
      synth.playTap();
      const { otherId, profile } = entry;
      state.viewing = null;
      openPlayer(otherId, { name: profile?.username ?? '', level: profile?.level ?? null, from: state.friendFrom, node: retry });
    });
    parts.push(retry);
  }
  box.replaceChildren(...parts);
  box.hidden = false;
}

export function renderFriend() {
  const entry = state.viewing;
  if (!entry) return;
  const person = entry.profile ?? {};
  const screen = el.screens.friend;
  entry.look = wearLook(screen, person.appearance);
  sceneFor(entry.look);
  const rel = relationOf(entry.otherId);
  const open = !entry.failed && !entry.hidden;
  screen.dataset.relation = rel.kind;
  screen.dataset.state = entry.failed ? 'error' : entry.hidden ? 'private' : 'ready';
  el.friendBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.friendBack.setAttribute('aria-label', t('back'));
  $('friend-title').textContent = t('friendProfileTitle');
  const more = $('friend-more');
  more.innerHTML = iconSvg('more', { size: 18 });
  more.setAttribute('aria-label', t('friendMore'));
  more.title = t('friendMore');
  more.style.visibility = entry.failed ? 'hidden' : '';
  more.tabIndex = entry.failed ? -1 : 0;
  if (!more.dataset.wired) {
    more.dataset.wired = '1';
    press(more, { sound: null });
    more.addEventListener('click', () => { synth.playTap(); openFriendMenu(); });
  }
  paintHero(entry);
  paintFriendActions(entry);
  paintState(entry);

  el.friendStatsLabel.textContent = t('profileStats');
  el.friendRarityLabel.textContent = t('statRarity');
  el.friendCardsLabel.textContent = t('friendCollection');
  el.friendShowcaseLabel.textContent = t('showcaseFriendLabel');
  for (const id of ['friend-showcase-head', 'friend-stats-head', 'friend-cards-head']) $(id).hidden = !open;
  for (const id of ['friend-showcase', 'friend-stats', 'friend-albums', 'friend-best', 'friend-seg-wrap', 'friend-cards-status']) {
    if (!open) $(id).hidden = true;
    else if (id === 'friend-stats' || id === 'friend-albums' || id === 'friend-cards-status') $(id).hidden = false;
  }
  if (!open) {
    $('friend-showcase-empty').hidden = true;
    $('friend-stats-note').hidden = true;
    $('friend-rarity-head').hidden = true;
    el.friendRarityBars.hidden = true;
    el.friendClassic.hidden = true;
    return;
  }

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

  paintFriendShowcase(entry);
  paintFriendStats(entry);
  paintFriendCards();
  freshFriendStats(entry);
}

export function paintFriendBadges(entry) {
  const { earned, worn } = friendShelf(entry.profile);
  const wrap = $('friend-worn');
  el.friendBadges.replaceChildren(...worn.slice(0, 4).map((st) => badgeChip(st, { readOnly: true })));
  wrap.querySelector('.badges-manage')?.remove();
  wrap.hidden = !earned.length || Boolean(entry.failed);
  if (!earned.length) return;
  const all = h('button.friend-all.badges-manage', { type: 'button', 'aria-label': t('friendBadgesTitle', { name: entry.profile?.username ?? '' }) },
    h('span.friend-all-mark', { html: iconSvg('grid', { size: 22 }), 'aria-hidden': 'true' }),
    h('b', t('friendBadgesAll', { n: earned.length })));
  press(all, { sound: null });
  all.addEventListener('click', () => { synth.playTap(); openFriendBadges(entry, earned); });
  el.friendBadges.appendChild(all);
}

export function openFriendBadges(entry, earned) {
  openSheet(t('friendBadgesTitle', { name: entry.profile?.username ?? '' }), (body) => {
    const grid = document.createElement('div');
    grid.className = 'badge-grid is-all';
    grid.replaceChildren(...earned.map((st) => badgeChip(st, { readOnly: true })));
    body.appendChild(grid);
  });
}

const showcasePins = (person) => (Array.isArray(person?.showcase) ? person.showcase : [])
  .filter((c) => c && c.key).slice(0, SHOWCASE_MAX).map((c) => withSpecialPhoto({ ...c }));

export async function paintFriendShowcase(entry) {
  const person = entry.profile;
  const pins = showcasePins(person);
  const empty = $('friend-showcase-empty');
  $('friend-showcase-note').textContent = `${pins.length} / ${SHOWCASE_MAX}`;
  el.friendShowcaseHead.hidden = false;
  empty.hidden = pins.length > 0;
  empty.textContent = t('friendShowcaseEmpty', { name: person?.username ?? '' });
  el.friendShowcase.hidden = !pins.length;
  el.friendShowcase.dataset.count = String(pins.length);
  if (!pins.length) { el.friendShowcase.replaceChildren(); return; }
  const friend = isFriend(entry);
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
    const rarity = rarityOfCard(card);
    const node = fxOn(buildStaticCard(card, rarity, null, { fav: false, wish: false }), entry.look, rarity);
    node.addEventListener('click', () => openCardDetail(card.key, card, rarity));
    const heart = document.createElement('button');
    heart.type = 'button';
    heart.className = `showcase-kudos${mine(card.key) ? ' is-on' : ''}`;
    heart.disabled = !friend;
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
      if (heart.disabled) return;
      touched = true;
      flip(!mine(card.key));
      synth.playTap();
      paint();
      settle();
    });
    slot.append(node, heart);
    return slot;
  }));
  reveal(el.friendShowcase.children, { step: 30 });
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
        if (entry.stranger) remember('player', id, row, { disk: false });
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
      if (changed) { paintHero(entry); paintFriendStats(entry); }
      else paintStamp(el.friendStatsStamp, id);
    }
    return changed;
  })();
  statsBusy.set(id, run);
  if (state.viewing?.otherId === id) paintStamp(el.friendStatsStamp, id);
  return run;
}

export function paintFriendStats(entry) {
  const person = entry.profile ?? {};
  const cards = Array.isArray(entry.cards) ? entry.cards : null;
  const name = person.username ?? '';
  const note = $('friend-stats-note');
  paintStamp(el.friendStatsStamp, entry.otherId);
  el.friendStats.className = 'stat-board';
  const guild = entry.guild ?? null;
  const full = paintPublicStatsBoard(el.friendStats, person.stats, person, { guild });
  if (full) {
    note.hidden = true;
    note.textContent = '';
  } else {
    paintPartialStatsBoard(el.friendStats, person, {
      entries: cards,
      albums: cards ? buildAlbums(cards, []) : null,
      ach: friendShelf(person).ach,
      achTotal: ACHIEVEMENTS.length,
      showcase: showcasePins(person).length,
      showcaseMax: SHOWCASE_MAX,
      guild,
      pending: entry.cards === undefined && isFriend(entry)
    });
    note.hidden = false;
    note.textContent = person.stats?.off ? t('statOffNote', { name }) : t('statPartialNote', { name });
  }

  const counts = {};
  for (const card of cards ?? []) counts[card.rarityId] = (counts[card.rarityId] ?? 0) + (card.count ?? 1);
  const peak = Math.max(1, ...RARITIES.map((r) => counts[r.id] ?? 0));
  $('friend-rarity-head').hidden = !cards;
  el.friendRarityBars.hidden = !cards;
  el.friendRarityBars.replaceChildren(...(cards ? RARITIES : []).map((rarity) => {
    const count = counts[rarity.id] ?? 0;
    const row = document.createElement('div');
    row.className = 'rarity-row';
    row.innerHTML = `<span class="rarity-name"></span><span class="rarity-track"></span><span class="rarity-count"></span>`;
    const label = row.querySelector('.rarity-name');
    label.textContent = tx(rarity.name);
    label.style.color = rarityText(rarity);
    const bar = new Bar(row.querySelector('.rarity-track'));
    bar.set(count / peak, { animate: false });
    bar.fill.style.background = rarity.color;
    row.querySelector('.rarity-count').textContent = count.toLocaleString();
    return row;
  }));
}

async function loadGuildOf(entry) {
  const id = entry.otherId;
  const kept = recall('guildOf', id);
  if (kept && Date.now() - kept.at < GUILD_TTL) {
    if (entry.guild !== kept.guild) { entry.guild = kept.guild; repaintGuild(entry); }
    return;
  }
  let guild;
  try { guild = await account.playerGuild(id); } catch { return; }
  remember('guildOf', id, { guild, at: Date.now() }, { disk: false });
  const moved = JSON.stringify(entry.guild ?? null) !== JSON.stringify(guild ?? null);
  entry.guild = guild;
  if (moved) repaintGuild(entry);
}

function repaintGuild(entry) {
  if (state.viewing !== entry || state.tab !== 'friend') return;
  paintMeta(entry);
  if (!entry.failed && !entry.hidden) paintFriendStats(entry);
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
  if (entry.failed || entry.hidden) return;
  if (!isFriend(entry)) {
    entry.cards = null;
    if (state.viewing === entry) paintFriendCards();
    return;
  }
  const kept = recall('friendCards', entry.otherId);
  entry.cards = Array.isArray(kept) ? kept : undefined;
  paintFriendCards();
  if (Array.isArray(kept)) paintFriendStats(entry);
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
    entry.cardsError = describeError(error);
    paintFriendCards();
    paintFriendStats(entry);
  } finally {
    if (state.viewing === entry) el.friendCardsLabel.classList.remove('is-refreshing');
  }
}

function skeletonCovers(count) {
  return Array.from({ length: count }, () => h('div.album-cover.is-skel', { 'aria-hidden': 'true' },
    h('span.skel-disc'), h('span.skel-line'), h('span.skel-line.is-short')));
}

function lockedPanel(entry) {
  const rel = relationOf(entry.otherId);
  const panel = h('div.friend-locked',
    h('span.friend-locked-icon', { html: iconSvg('lock', { size: 26 }), 'aria-hidden': 'true' }),
    h('p', entry.cardsError && rel.kind === 'friend' ? entry.cardsError : rel.kind === 'friend' ? t('friendPrivate') : t('friendCollectionLocked', { name: entry.profile?.username ?? '' })));
  if (rel.kind === 'none') {
    const add = h('button.btn.btn-primary.btn-sm', { type: 'button', dataset: { act: 'add-locked' } }, t('friendAddFriend'));
    press(add, { sound: null });
    add.addEventListener('click', () => el.friendActions.querySelector('[data-act="add"]')?.click());
    panel.append(add);
  }
  return panel;
}

function bestCards(cards, size = 6) {
  return [...cards]
    .filter((c) => !c.special || c.rarityId)
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId) || (Number(b.price) || 0) - (Number(a.price) || 0))
    .slice(0, size);
}

export function paintFriendCards() {
  const entry = state.viewing;
  if (!entry || entry.failed || entry.hidden) return;
  const classic = state.friendView === 'classic';
  const cards = entry.cards;
  const best = $('friend-best');
  const note = $('friend-albums-note');
  el.friendAlbums.replaceChildren();
  el.friendClassic.replaceChildren();
  el.friendAlbums.hidden = classic && Array.isArray(cards) && cards.length > 0;
  el.friendClassic.hidden = !(classic && Array.isArray(cards) && cards.length > 0);
  el.friendSegWrap.hidden = !Array.isArray(cards) || !cards.length;
  best.hidden = true;
  best.replaceChildren();
  note.textContent = '';
  el.friendCardsStatus.hidden = false;

  if (cards === undefined) {
    el.friendCardsStatus.textContent = t('friendLoading');
    el.friendCardsStatus.className = 'find-status is-working';
    el.friendAlbums.hidden = false;
    el.friendAlbums.replaceChildren(...skeletonCovers(4));
    return;
  }
  if (cards === null) {
    el.friendCardsStatus.textContent = '';
    el.friendCardsStatus.className = 'find-status is-muted';
    el.friendCardsStatus.hidden = true;
    el.friendAlbums.hidden = false;
    el.friendAlbums.replaceChildren(lockedPanel(entry));
    return;
  }
  el.friendCardsStatus.textContent = cards.length ? '' : t('friendNoCards');
  el.friendCardsStatus.className = 'find-status is-muted';
  el.friendCardsStatus.hidden = cards.length > 0;
  if (!cards.length) return;

  const albums = buildAlbums(cards, []).filter((a) => a.unlocked);
  note.textContent = t('friendAlbumsNote', { started: albums.filter((a) => a.owned > 0).length, complete: albums.filter((a) => a.complete).length });

  const top = bestCards(cards);
  if (top.length) {
    best.hidden = false;
    best.append(
      h('p.friend-best-label', t('friendBestCards')),
      h('div.friend-best-row', top.map((card) => {
        const rarity = rarityById(card.rarityId) ?? RARITIES[0];
        const node = fxOn(buildStaticCard(card, rarity, null, { fav: false, wish: false }), entry.look, rarity);
        node.addEventListener('click', () => { synth.playTap(); openCardDetail(card.key, card, rarity); });
        return node;
      })));
  }

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

export function refreshViewedRelation() {
  const entry = state.viewing;
  if (!entry || state.tab !== 'friend') return;
  const rel = relationOf(entry.otherId);
  const was = entry.stranger ? 'none' : 'friend';
  if ((rel.kind === 'friend') !== (was === 'friend')) { afterRelation(entry.otherId); return; }
  paintFriendActions(entry);
  paintMeta(entry);
}
