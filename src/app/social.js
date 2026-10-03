import * as account from '../account.js';
import { bump, bumpMax, noteIn } from '../ledger.js';
import { t, tx } from '../i18n.js';
import { rankFor } from '../progression.js';
import { press } from '../ui/components.js';
import { iconSvg } from '../data/icons.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { frameTier } from '../framemeta.js';
import { CURRENCY_NAME, formatAmount } from '../pricing.js';
import { emit } from '../ui/bus.js';
import { reportQuest, seasonReached } from './arcade.js';
import { checkReportsAnswered, guardText, isBlocked, loadBlocks, openReport, reportOnHold } from './safety.js';
import { econ, econMessage, refreshEconomy, serverEconomy } from './econ.js';
import { applyStanding, liveNotice } from './notices.js';
import { renderBinder } from './binder.js';
import { el, esc, refreshWallet, showScreen, state, toast } from './core.js';
import { refreshWishes } from './detail.js';
import { pushNote, whenText } from './drawer.js';
import { noteTalk, noteTalkRead, onTalkLive } from './discussions.js';
import { describeError, pullSaveNow, signedIn, syncSoon, userId } from './gate.js';
import { live } from './live.js';
import { clearNotify, shouldNotify, systemNotify } from './notify.js';
import { gainBooster } from './open.js';
import { renderPacks } from './packs.js';
import { renderProfile } from './profile.js';
import { paintFrameInto, updateBadges } from './regalia.js';
import { pending } from './pending.js';
import { chatBubble } from './bubble.js';
import { inboxReady, paintInbox } from './inbox.js';
import { pruneCleared } from './drawer.js';

export function personRow(profile, actions, { onOpen = null, note = null, data = null } = {}) {
  const row = document.createElement(onOpen ? 'button' : 'div');
  if (onOpen) row.type = 'button';
  row.className = 'person';
  for (const [k, v] of Object.entries(data ?? {})) row.dataset[k] = String(v);
  row.innerHTML = `
    <span class="person-mark"></span>
    <span class="person-copy"><b></b><span></span></span>
    <span class="person-actions"></span>`;

  const mark = row.querySelector('.person-mark');
  paintAvatarInto(mark, profile);
  const live = onlineNow(profile);
  if (live !== null) {
    const dot = document.createElement('span');
    dot.className = `presence-dot${live ? ' is-online' : ''}`;
    mark.appendChild(dot);
  }
  row.querySelector('b').textContent = profile.username ?? '';
  row.querySelector('.person-copy span').textContent = t('friendsLevelLine', {
    n: profile.level ?? 1,
    rank: tx(rankFor(profile.level ?? 1).name)
  });

  const bay = row.querySelector('.person-actions');
  for (const [labelKey, kind, run] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm ${kind}`;
    button.textContent = t(labelKey);
    press(button, { sound: null });
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      run(button);
    });
    bay.appendChild(button);
  }
  if (note) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${iconSvg('hourglass', { size: 13 })}<span></span>`;
    chip.querySelector('span').textContent = t(note);
    bay.appendChild(chip);
  } else if (!actions.length) {
    bay.innerHTML = `<span class="muted">${iconSvg('chevron', { size: 18 })}</span>`;
  }

  if (onOpen) {
    press(row, { sound: null });
    row.addEventListener('click', () => { synth.playTap(); onOpen(); });
  }
  return row;
}

export async function socialAction(run, doneKey = null, vars = {}) {
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
  try {
    await run();
    await loadFriends();
    if (doneKey) toast(t(doneKey, safe));
  } catch (error) {
    toast(esc(describeError(error)), 'error');
    synth.playDenied();
  }
}

let friendsLoading = null;
let friendsAgain = false;

export function loadFriends() {
  if (!signedIn() || !state.account.profile) return Promise.resolve();
  if (friendsLoading) { friendsAgain = true; return friendsLoading; }
  friendsLoading = (async () => {
    try {
      const lists = await account.listFriendships(userId());
      Object.assign(state.social, lists, { loaded: true });
      const now = Date.now();
      for (const entry of lists.friends) statsSeen.set(entry.otherId, now);
    } catch {
      state.social.loaded = false;
    }
    updateBadges();
    paintInbox();
    if (state.tab === 'friends') renderFriends();
    if (state.tab === 'profile') renderProfile();
    if (state.tab === 'discussions') import('./discussions.js').then((m) => m.renderDiscussions()).catch(() => {});
    refreshWishes();
  })().finally(() => {
    friendsLoading = null;
    if (friendsAgain) { friendsAgain = false; loadFriends(); }
  });
  return friendsLoading;
}

export async function refreshTrades() {
  try {
    state.social.trades = await account.openTrades(userId());
    await reconcileTrades();
  } catch {}
  paintInbox();
  if (state.tab === 'friends') renderFriends();
}

export async function syncChallenges() {
  if (!signedIn()) return;
  try {
    const rows = await account.myChallenges();
    const v = state.versus ??= { rows: [], loaded: false, view: 'table', draft: null };
    v.rows = rows;
    v.loaded = true;
  } catch {}
  paintInbox();
}

const BEAT_GAP = 240000;
let beatAt = 0;

export const POLL_PARTS = ['friends', 'social', 'wishes'];
const DIGEST_FRESH_MS = 30000;
let lastDigest = null;
const digestWaiters = new Set();

export function freshDigest(ms = DIGEST_FRESH_MS) {
  return lastDigest && lastDigest.user === userId() && Date.now() - lastDigest.at < ms ? lastDigest.data : null;
}

export function fullDigest(ms = DIGEST_FRESH_MS) {
  return lastDigest?.full ? freshDigest(ms) : null;
}

export function waitFullDigest(ms) {
  const held = fullDigest();
  if (held || !signedIn() || !account.digestReady()) return Promise.resolve(held);
  return new Promise((resolve) => {
    const done = (value) => { clearTimeout(timer); digestWaiters.delete(done); resolve(value); };
    const timer = setTimeout(() => done(null), ms);
    digestWaiters.add(done);
  });
}

export async function readDigest(parts = null) {
  if (!signedIn()) return null;
  const me = userId();
  let data = null;
  try { data = await account.socialDigest(parts); } catch { data = null; }
  if (data && userId() === me) lastDigest = { at: Date.now(), data, user: me, full: parts == null };
  if (parts == null || !data) for (const fn of [...digestWaiters]) fn(data && parts == null ? data : null);
  return data;
}

export const giftsWaiting = () => {
  const held = freshDigest(DIGEST_FRESH_MS * 4);
  return !held || !('grants' in held) || Number(held.grants) > 0;
};

function takeFriends(digest) {
  const lists = account.friendLists(userId(), digest.friendships ?? [], digest.people ?? []);
  Object.assign(state.social, lists, { loaded: true });
  const now = Date.now();
  for (const entry of lists.friends) statsSeen.set(entry.otherId, now);
  if (Array.isArray(digest.wishes)) {
    state.wishlist = new Map(digest.wishes.map((row) => [row.key, row.card]));
    store.saveWishlist([...state.wishlist.values()]);
  }
  if (Array.isArray(digest.friendWishes)) {
    const wishes = new Map();
    for (const row of digest.friendWishes) {
      const name = state.social.friends.find((f) => f.otherId === row.owner)?.profile?.username ?? null;
      if (!name) continue;
      if (!wishes.has(row.key)) wishes.set(row.key, []);
      wishes.get(row.key).push(name);
    }
    state.friendWishes = wishes;
  }
}

async function takeDigest(digest, { collected = false } = {}) {
  if ('guild' in digest) {
    try { (await import('./guilds.js')).takeGuild(digest.guild); } catch {}
  }
  if (Array.isArray(digest.friendships)) {
    takeFriends(digest);
    updateBadges();
    if (state.tab === 'profile') renderProfile();
    if (!Array.isArray(digest.wishes)) refreshWishes();
  }
  if (Date.now() - beatAt > BEAT_GAP && Date.now() - account.lastKeySync() > 90000) { beatAt = Date.now(); account.heartbeat(userId()).catch(() => { beatAt = 0; }); }
  if (Number(digest.deliveries) > 0 && !collected) { try { await collectDeliveries(); } catch {} }
  if (Array.isArray(digest.blocks)) state.blocked = new Set(digest.blocks.map((r) => r.blocked));
  if (Array.isArray(digest.reports)) { try { await checkReportsAnswered(digest.reports); } catch {} }
  if (Array.isArray(digest.invites)) { try { await takeGuildInvites(digest.invites.map(account.inviteShape)); } catch {} }
  if (Array.isArray(digest.unread)) {
    const unread = account.unreadFrom(digest.unread);
    state.social.unread = unread.counts;
    state.social.unreadLast = unread.last;
  }
  if (Array.isArray(digest.trades)) {
    state.social.trades = digest.trades;
    try { await reconcileTrades(); } catch {}
  }
  if (Array.isArray(digest.challenges)) {
    const v = state.versus ??= { rows: [], loaded: false, view: 'table', draft: null };
    v.rows = digest.challenges.map(account.challengeShape);
    v.loaded = true;
  }
}

export async function syncSocial({ full = false, digest = null, collected = false } = {}) {
  if (!signedIn() || !state.account.profile) return;
  const got = digest ?? await readDigest(full ? null : POLL_PARTS);
  if (got) {
    await takeDigest(got, { collected });
    afterSocial();
    return;
  }
  await loadFriends();
  if (Date.now() - beatAt > BEAT_GAP && Date.now() - account.lastKeySync() > 90000) { beatAt = Date.now(); account.heartbeat(userId()).catch(() => { beatAt = 0; }); }
  try { await collectDeliveries(); } catch {}
  try { await loadBlocks(); } catch {}
  try { await checkReportsAnswered(); } catch {}
  try { await syncGuildInvites(); } catch {}
  try {
    const unread = await account.unreadSummary(userId());
    state.social.unread = unread.counts;
    state.social.unreadLast = unread.last;
  } catch {}
  try {
    state.social.trades = await account.openTrades(userId());
    await reconcileTrades();
  } catch {}
  await syncChallenges();
  afterSocial();
}

function afterSocial() {
  pruneCleared();
  updateBadges();
  paintInbox();
  inboxReady();
  if (state.tab === 'friends') renderFriends();
  if (state.tab === 'chat' && state.chat) refreshChat();
  if (state.tab === 'friend' && state.viewing) freshFriendStats(state.viewing);
  if (state.tab === 'discussions') import('./discussions.js').then((m) => m.loadDiscussions({ quiet: true })).catch(() => {});
}
let invitesUnavailable = false;

export async function syncGuildInvites() {
  if (invitesUnavailable || state.guild) { state.social.guildInvites = []; return; }
  let invites = [];
  try { invites = await account.myGuildInvites(); } catch (error) {
    if (String(error?.message) === 'SCHEMA') invitesUnavailable = true;
    throw error;
  }
  takeGuildInvites(invites);
}

function takeGuildInvites(invites) {
  if (state.guild) { state.social.guildInvites = []; return; }
  state.social.guildInvites = invites;
  const seen = state.profile.guildInviteSeen ?? [];
  const fresh = invites.filter((invite) => !seen.includes(invite.id));
  for (const invite of fresh) {
    const line = t('notifGuildInvite', { name: invite.inviterName, guild: invite.name });
    pushNote('shield', line, 'guilds', 'guilds');
    if (shouldNotify()) systemNotify(t('notifTitle'), line, 'guilds');
  }
  const ids = invites.map((invite) => invite.id);
  if (fresh.length || seen.length !== ids.length) {
    state.profile.guildInviteSeen = ids;
    store.saveProfile(state.profile);
  }
  emit('guild-invite', { invites });
  paintInbox();
}

export const liveSocial = { feed: null, off: [], presence: null, online: null, timer: null, grantTimer: null, econTimer: null, parkTimer: null, parked: false };

const PARK_AFTER_MS = 3 * 60 * 1000;

export function parkLiveSocial() {
  clearTimeout(liveSocial.parkTimer);
  liveSocial.parkTimer = setTimeout(() => {
    liveSocial.parkTimer = null;
    if (document.visibilityState === 'visible' || !liveSocial.feed) return;
    stopLiveSocial();
    liveSocial.parked = true;
  }, PARK_AFTER_MS);
}

export function unparkLiveSocial() {
  clearTimeout(liveSocial.parkTimer);
  liveSocial.parkTimer = null;
}

export const liveSocialUp = () => Boolean(liveSocial.feed?.alive?.());

export const presenceHidden = () => state.account.profile?.presence === 'hidden';

export function onlineNow(profile) {
  if (!profile) return null;
  if (liveSocial.online && account.hasPresence(profile)) {
    if (profile.presence !== 'online') return false;
    return liveSocial.online.has(profile.id);
  }
  return account.isOnline(profile);
}

export function lastSeenText(profile) {
  if (!account.hasPresence(profile) || profile.presence !== 'online') return '';
  if (onlineNow(profile)) return '';
  const at = Date.parse(profile.last_seen_at ?? '');
  if (!Number.isFinite(at)) return '';
  const mins = Math.floor(Math.max(0, Date.now() - at) / 60000);
  if (mins < 60) return t('lastSeenMins', { n: Math.max(1, mins) });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('lastSeenHours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days <= 1) return t('lastSeenYesterday');
  return t('lastSeenDays', { n: days });
}

export function startLiveSocial({ keep = false } = {}) {
  if (keep && liveSocial.feed?.alive?.()) return;
  stopLiveSocial();
  if (!signedIn() || !account.configured) return;
  liveSocial.feed = account.openLive(userId());
  liveSocial.off = [
    ...['message', 'read', 'seen', 'delivery', 'friendship', 'trade'].map((kind) => account.onLive(kind, onSocialEvent)),
    account.onLive('challenge', ({ row, type }) => {
      onChallengeLive(row, type);
      import('./versus.js').then((m) => m.noteChallenge(row, type));
    }),
    account.onLive('guild-invite', ({ row, type }) => onInviteLive(row, type)),
    account.onLive('lot', ({ payload }) => { import('./market.js').then((m) => m.heardNote(payload)).catch(() => {}); }),
    account.onLive('grant', () => {
      clearTimeout(liveSocial.grantTimer);
      liveSocial.grantTimer = setTimeout(() => { import('./gifts.js').then((m) => m.collectGifts()).catch(() => {}); }, 500);
    }),
    account.onLive('econ', () => {
      clearTimeout(liveSocial.econTimer);
      liveSocial.econTimer = setTimeout(refreshFromServer, 300);
    }),
    account.onLive('standing', ({ payload }) => applyStanding(payload)),
    account.onLive('notice', ({ payload }) => { liveNotice(payload); }),
    account.onLive('announcement', ({ payload }) => { liveNotice(payload); }),
    account.onLive('profile', () => { refreshOwnProfile(); }),
    account.onLive('guild', () => {
      import('./guilds.js').then(async (m) => {
        await m.loadMyGuild({ fresh: true });
        if (state.tab === 'guilds') m.renderGuilds();
      }).catch(() => {});
    }),
    account.onLive('save', () => { pullSaveNow(); }),
    account.onLive('removed', ({ payload }) => dropRemoved(payload))
  ];
  liveSocial.presence = account.openPresence(userId(), { hidden: presenceHidden() || document.visibilityState !== 'visible' }, onPresenceSync);
  if (liveSocial.parked) {
    liveSocial.parked = false;
    clearTimeout(liveSocial.econTimer);
    liveSocial.econTimer = setTimeout(refreshFromServer, 300);
    import('./liveops.js').then((m) => m.refreshLive()).catch(() => {});
  }
}

async function refreshFromServer() {
  if (!serverEconomy()) return;
  await refreshEconomy().catch(() => {});
  refreshWallet();
  renderBinder();
  renderPacks();
  import('./shop.js').then((m) => m.renderShop()).catch(() => {});
}

async function refreshOwnProfile() {
  const me = userId();
  if (!me) return;
  try {
    const fresh = await account.getProfile(me);
    if (!fresh || userId() !== me) return;
    state.account.profile = fresh;
  } catch { return; }
  if (state.tab === 'profile') renderProfile();
  if (state.tab === 'customize') import('./settings.js').then((m) => m.renderCustomize());
}

function dropRemoved(payload) {
  const ids = new Set((Array.isArray(payload?.ids) ? payload.ids : []).map(String));
  if (!ids.size || payload?.table !== 'messages') return;
  if (state.tab === 'chat' && state.chatRows?.some((m) => ids.has(String(m.id)))) {
    paintChat(state.chatRows.filter((m) => !ids.has(String(m.id))));
    refreshChat().catch(() => {});
  }
  clearTimeout(liveSocial.timer);
  liveSocial.timer = setTimeout(() => { syncSocial().catch(() => {}); }, 1500);
}

export function stopLiveSocial() {
  for (const timer of soonTimers.values()) clearTimeout(timer);
  soonTimers.clear();
  for (const off of liveSocial.off) off();
  liveSocial.off = [];
  liveSocial.feed?.close();
  liveSocial.presence?.close();
  liveSocial.feed = null;
  liveSocial.presence = null;
  liveSocial.online = null;
  clearTimeout(liveSocial.timer);
  clearTimeout(liveSocial.grantTimer);
  clearTimeout(liveSocial.econTimer);
}

export function settlePresence() {
  liveSocial.presence?.setHidden(presenceHidden() || document.visibilityState !== 'visible');
}

const soonTimers = new Map();
const SYNC_SOON = 700;

function soon(key, run, ms) {
  clearTimeout(soonTimers.get(key));
  soonTimers.set(key, setTimeout(() => {
    soonTimers.delete(key);
    Promise.resolve().then(run).catch(() => {});
  }, ms));
}

const heard = new Set();

function firstTime(key) {
  if (heard.has(key)) return false;
  heard.add(key);
  if (heard.size > 400) heard.delete(heard.values().next().value);
  return true;
}

function onSocialEvent(event) {
  const row = event.row ?? {};
  const me = userId();
  shadeLine(event, row);
  if (event.kind === 'message') {
    if (row.recipient !== me || (row.id && !firstTime(`m:${row.id}`))) return;
    if (state.tab === 'chat' && state.chat?.otherId === row.sender) {
      onTalkLive(row);
      showTyping(false);
      refreshChat({ markRead: true });
      return;
    }
    if (isBlocked(row.sender)) return;
    state.social.unread.set(row.sender, (state.social.unread.get(row.sender) ?? 0) + 1);
    (state.social.unreadLast ??= new Map()).set(row.sender, { id: row.id ?? null, at: row.created_at ?? new Date().toISOString() });
    onTalkLive(row);
    paintInbox();
    if (state.tab === 'friends') renderFriends();
    return;
  }
  if (event.kind === 'read') {
    if (row.sender !== me) return;
    onTalkLive(row, 'read');
    if (row.read_at && state.tab === 'chat' && state.chat?.otherId === row.recipient) {
      for (const m of state.chatRows) if (m.id === row.id || (m.sender === me && !m.read_at && m.created_at <= row.created_at)) m.read_at = m.read_at ?? row.read_at;
      paintChat(state.chatRows);
    }
    return;
  }
  if (event.kind === 'seen') {
    if (row.recipient !== me || !row.sender) return;
    state.social.unread.delete(row.sender);
    noteTalkRead(row.sender);
    clearNotify(`chat:${row.sender}`);
    paintInbox();
    if (state.tab === 'friends') renderFriends();
    return;
  }
  if (event.kind === 'friendship') { onFriendshipLive(event.type, row); return; }
  if (event.kind === 'trade') { onTradeLive(event.type, row); return; }
  if (event.kind === 'delivery') soon('sync', () => syncSocial(), SYNC_SOON);
}

function onFriendshipLive(type, row) {
  if (!row?.id) return;
  const me = userId();
  const other = row.requester === me ? row.addressee : row.requester;
  const drop = (list) => (list ?? []).filter((e) => e.id !== row.id);
  state.social.incoming = drop(state.social.incoming);
  state.social.outgoing = drop(state.social.outgoing);
  if (type === 'DELETE') state.social.friends = drop(state.social.friends);
  if (type !== 'DELETE' && row.status === 'pending' && row.addressee === me && !isBlocked(other)) {
    state.social.incoming = [...state.social.incoming,
      { ...row, otherId: other, provisional: true, profile: { id: other, username: t('friendSomeone') } }];
  }
  paintInbox();
  if (state.tab === 'friends') renderFriends();
  soon('sync', () => syncSocial(), SYNC_SOON);
}

function onTradeLive(type, row) {
  if (!row?.id) return;
  const held = (state.social.trades ?? []).find((tr) => tr.id === row.id);
  const rest = (state.social.trades ?? []).filter((tr) => tr.id !== row.id);
  state.social.trades = type !== 'DELETE' && row.status === 'pending'
    ? [{ offer: null, ask: null, ...held, ...row }, ...rest]
    : rest;
  paintInbox();
  if (state.tab === 'friends') renderFriends();
  const party = state.viewing?.otherId;
  if (row.status === 'accepted' && party && (party === row.proposer || party === row.recipient)) freshFriendStats(state.viewing, { force: true });
  soon('sync', () => syncSocial(), SYNC_SOON);
}

function onChallengeLive(row, type) {
  if (!row?.id) return;
  const v = state.versus ??= { rows: [], loaded: false, view: 'table', draft: null };
  const held = v.rows.find((c) => c.id === row.id);
  if (type === 'DELETE') v.rows = v.rows.filter((c) => c.id !== row.id);
  else if (held) {
    if (row.status) held.status = row.status;
    if (Array.isArray(row.claimed)) held.claimed = row.claimed;
    if (row.result?.winner) held.result = { ...(held.result ?? {}), winner: row.result.winner };
  } else {
    v.rows = [{
      id: row.id, kind: row.kind, challenger: row.challenger, opponent: row.opponent,
      challengerName: row.challenger_name ?? null, opponentName: row.opponent_name ?? null,
      status: row.status, payload: {}, reply: null, result: row.result?.winner ? { winner: row.result.winner } : null,
      claimed: Array.isArray(row.claimed) ? row.claimed : [], createdAt: row.created_at, updatedAt: row.updated_at
    }, ...v.rows];
  }
  paintInbox();
  const party = state.viewing?.otherId;
  if (row.status === 'done' && party && (party === row.challenger || party === row.opponent)) freshFriendStats(state.viewing, { force: true });
  soon('challenges', () => syncChallenges(), 400);
}

function onInviteLive(row, type) {
  const list = state.social.guildInvites ?? [];
  if (type === 'DELETE') state.social.guildInvites = list.filter((i) => i.id !== row?.id);
  else if (row?.id && !list.some((i) => i.id === row.id)) state.social.guildInvites = [...list, { id: row.id, guildId: row.guild_id, provisional: true }];
  paintInbox();
  soon('invites', async () => {
    try { await syncGuildInvites(); } catch {}
    paintInbox();
  }, 300);
}

async function nameOf(id) {
  const known = state.social.friends.find((f) => f.otherId === id)?.profile?.username
    ?? state.social.incoming.find((f) => f.otherId === id)?.profile?.username;
  if (known) return known;
  try { return (await account.getProfile(id))?.username ?? t('friendSomeone'); } catch { return t('friendSomeone'); }
}

async function shadeLine(event, row) {
  if (!shouldNotify()) return;
  const me = userId();
  if (event.kind === 'message' && row.sender && row.recipient === me) {
    if (state.tab === 'chat' && state.chat?.otherId === row.sender && document.visibilityState === 'visible') return;
    systemNotify(await nameOf(row.sender), String(row.body ?? ''), `chat:${row.sender}`);
  } else if (event.kind === 'friendship' && event.type === 'INSERT' && row.addressee === me && row.status === 'pending') {
    systemNotify(t('notifTitle'), t('notifRequest', { name: await nameOf(row.requester) }), `request:${row.id}`);
  } else if (event.kind === 'friendship' && event.type === 'UPDATE' && row.requester === me && row.status === 'accepted') {
    systemNotify(t('notifTitle'), t('friendsAccepted', { name: await nameOf(row.addressee) }), `chat:${row.addressee}`);
  } else if (event.kind === 'delivery' && row.recipient === me) {
    const from = await nameOf(row.sender);
    const line = row.kind === 'booster' ? t('notifGiftBooster', { name: from })
      : row.kind === 'card' ? t('notifGiftCard', { name: from, card: row.payload?.title ?? '?' })
        : row.kind === 'auction-card' ? t('notifAuctionCard', { card: row.payload?.title ?? '?' })
          : row.kind === 'auction-money' ? t(row.payload?.reason === 'sale' ? 'notifAuctionSold' : 'notifAuctionRefund', { amount: `${formatAmount(row.payload?.amount ?? 0)} ${CURRENCY_NAME}`, card: row.payload?.title ?? '?' })
            : row.kind === 'trade-return' ? t('notifTradeDone', { name: from }) : '';
    if (line) systemNotify(t('notifTitle'), line, 'postbox');
  } else if (event.kind === 'trade' && event.type === 'INSERT' && row.recipient === me) {
    systemNotify(t('notifTitle'), t('notifTrade', { name: await nameOf(row.proposer) }), `trade:${row.id}`);
  } else if (event.kind === 'trade' && event.type === 'UPDATE' && row.proposer === me && row.status === 'declined') {
    systemNotify(t('notifTitle'), t('notifTradeDeclined', { name: await nameOf(row.recipient) }), 'friends');
  }
}

function onPresenceSync(ids) {
  liveSocial.online = ids;
  repaintPresence();
}

export function repaintPresence() {
  if (state.tab === 'friends') renderFriends();
  if (state.tab === 'friend') paintFriendPresence();
  if (state.tab === 'chat') paintChatPresence();
}

export async function collectDeliveries(given = null) {
  const onServer = serverEconomy();
  let waiting;
  let season = null;
  if (onServer) {
    const res = given ?? await econ('collect', {}, { quiet: true });
    waiting = res.landed ?? [];
    season = res.season;
  } else {
    waiting = await account.pendingDeliveries(userId());
  }
  if (!waiting.length) return;
  for (const item of waiting) {
    const from = state.social.friends.find((f) => f.otherId === item.sender)?.profile?.username
      ?? t('friendSomeone');
    if (item.kind === 'booster' && item.payload?.spec) {
      gainBooster(item.payload.spec, item.payload.count ?? 1);
      bump(state.profile, 'giftsReceived');
      pushNote('gift', t('notifGiftBooster', { name: from }), 'packs');
    } else if (item.kind === 'card' && item.payload?.key) {
      if (!onServer) store.receiveCardEntry(state.collection, item.payload);
      bump(state.profile, 'giftsReceived');
      pushNote('gift', t('notifGiftCard', { name: from, card: item.payload.title }), 'binder');
    } else if (item.kind === 'trade-return' && Array.isArray(item.payload?.cards)) {
      if (!onServer) for (const card of item.payload.cards) store.receiveCardEntry(state.collection, card);
      reportQuest('trade');
      pushNote('trade', t('notifTradeDone', { name: from }), 'binder');
      if (state.viewing?.otherId === item.sender) freshFriendStats(state.viewing, { force: true });
    } else if (item.kind === 'auction-card' && item.payload?.key) {
      if (!onServer) store.receiveCardEntry(state.collection, item.payload);
      if (item.sender !== userId()) {
        state.profile.auctionsWon = (state.profile.auctionsWon ?? 0) + 1;
        store.saveProfile(state.profile);
      }
      pushNote('trade', t('notifAuctionCard', { card: item.payload.title ?? '?' }), 'binder');
    } else if (item.kind === 'auction-money' && Number.isFinite(item.payload?.amount)) {
      if (!onServer) store.saveWallet(store.loadWallet() + item.payload.amount);
      refreshWallet();
      if (item.payload.reason === 'sale') {
        state.profile.auctionsSold = (state.profile.auctionsSold ?? 0) + 1;
        bumpMax(state.profile, 'auctionBest', item.payload.amount);
        store.saveProfile(state.profile);
      }
      pushNote('trade', t(item.payload.reason === 'sale' ? 'notifAuctionSold' : 'notifAuctionRefund',
        { amount: `${formatAmount(item.payload.amount)} ${CURRENCY_NAME}`, card: item.payload.title ?? '?' }), 'shop');
    }
    if (!onServer) await account.claimDelivery(item.id);
  }
  seasonReached(season);
  synth.playTrade();
  renderPacks();
  if (state.tab === 'binder') renderBinder();
  syncSoon();
}

const SEEN_TRADES_KEY = 'wikster.tradesSeen.v1';
const seenTrades = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_TRADES_KEY) ?? '[]')); } catch { return new Set(); } };
const saveSeenTrades = (seen) => { try { localStorage.setItem(SEEN_TRADES_KEY, JSON.stringify([...seen].slice(-200))); } catch {} };

export async function reconcileTrades() {
  if (serverEconomy()) {
    const seen = seenTrades();
    for (const trade of state.social.trades) {
      if (trade.proposer !== userId() || trade.status === 'pending' || seen.has(trade.id)) continue;
      seen.add(trade.id);
      if (trade.status === 'declined' || trade.status === 'cancelled') {
        const who = state.social.friends.find((f) => f.otherId === trade.recipient)?.profile?.username ?? '?';
        if (trade.status === 'declined') pushNote('trade', t('notifTradeDeclined', { name: who }), 'binder');
      } else if (trade.status === 'accepted') {
        state.profile.tradesDone = (state.profile.tradesDone ?? 0) + 1;
        store.saveProfile(state.profile);
      }
    }
    saveSeenTrades(seen);
    state.social.trades = state.social.trades.filter((tr) => tr.status === 'pending');
    return;
  }
  for (const trade of state.social.trades) {
    if (trade.proposer !== userId()) continue;
    if (trade.status === 'declined' || trade.status === 'cancelled') {
      for (const card of trade.offer ?? []) store.receiveCardEntry(state.collection, card);
      await account.setTradeStatus(trade.id, 'closed');
      const who = state.social.friends.find((f) => f.otherId === trade.recipient)?.profile?.username ?? '?';
      pushNote('trade', t('notifTradeDeclined', { name: who }), 'binder');
      syncSoon();
    } else if (trade.status === 'accepted') {
      await account.setTradeStatus(trade.id, 'closed');
      state.profile.tradesDone = (state.profile.tradesDone ?? 0) + 1;
      store.saveProfile(state.profile);
    }
  }
  state.social.trades = state.social.trades.filter((tr) => tr.status === 'pending');
}

const SOCIAL_CODES = {
  NOT_FRIENDS: 'econNotFriends', GIFT_LIMIT: 'econGiftLimit', NOT_OWNED: 'tradeMissing', LOCKED: 'specialLocked',
  NOT_HELD: 'econFailed', TOO_MANY: 'econTooMany', GONE: 'econGone', SETTLED: 'econGone', SUSPENDED: 'econSuspended'
};

export function socialError(error) {
  const key = SOCIAL_CODES[String(error?.message ?? '')];
  if (key) return t(key);
  return serverEconomy() ? econMessage(error, t) : describeError(error);
}

live.chatTimer = null;

export let chatWire = null;

export let typingTimer = null;

export let typedAt = 0;

export function openChat(entry, { from = null } = {}) {
  state.chat = entry;
  state.chatFrom = from ?? (state.tab === 'discussions' ? 'discussions' : state.tab === 'friend' ? 'friend' : 'friends');
  clearNotify(`chat:${entry.otherId}`);
  state.chatRows = [];
  renderChatFrame();
  showScreen('chat');
  refreshChat({ markRead: true });
  clearInterval(live.chatTimer);
  let chatTicks = 0;
  live.chatTimer = setInterval(() => {
    chatTicks++;
    if (state.tab !== 'chat' || document.visibilityState !== 'visible') return;
    if (liveSocialUp() && chatTicks % 6) return;
    refreshChat();
  }, 10000);
  closeChatWire();
  chatWire = account.openChatChannel(userId(), entry.otherId, onChatEvent);
}

export function closeChatWire() {
  chatWire?.close();
  chatWire = null;
  typedAt = 0;
  showTyping(false);
}

export function onChatEvent(payload) {
  if (state.tab !== 'chat' || !state.chat || payload.from !== state.chat.otherId) return;
  if (payload.kind === 'typing') showTyping(true);
  else if (payload.kind === 'sent') { showTyping(false); refreshChat({ markRead: true }); }
  else if (payload.kind === 'read') {
    const at = new Date(payload.at ?? Date.now()).toISOString();
    const mine = userId();
    for (const m of state.chatRows) if (m.sender === mine && !m.read_at) m.read_at = at;
    paintChat(state.chatRows);
  }
}

export function showTyping(on) {
  clearTimeout(typingTimer);
  const person = state.chat?.profile;
  const wasHidden = el.chatTyping.hidden;
  el.chatTyping.hidden = !on;
  if (on) {
    el.chatTyping.innerHTML = `<span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span></span>`;
    el.chatTyping.lastElementChild.textContent = t('chatTyping', { name: person?.username ?? '' });
    if (wasHidden) keepChatBottom();
    typingTimer = setTimeout(() => showTyping(false), 4000);
  }
}

export function keepChatBottom() {
  if (state.tab !== 'chat') return;
  requestAnimationFrame(() => { el.chatLog.scrollTop = el.chatLog.scrollHeight; });
}

export function paintChatPresence() {
  const person = state.chat?.profile;
  if (!person) return;
  const online = onlineNow(person);
  const since = online ? '' : lastSeenText(person);
  el.chatPresence.textContent = online === null ? ''
    : (online ? t('friendOnline') : `${t('friendOffline')}${since ? ` · ${since}` : ''}`);
  el.chatPresence.className = `chat-presence${online ? ' is-online' : ''}`;
}

export function renderChatFrame() {
  const entry = state.chat;
  const person = entry?.profile;
  if (!person) return;
  el.chatBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.chatName.textContent = person.username ?? '';
  paintAvatarInto(el.chatAvatar, person);
  paintChatPresence();
  el.chatWho.setAttribute('aria-label', t('chatSeeProfile', { name: person.username ?? '' }));
  el.chatInput.placeholder = t('chatPlaceholder');
  el.chatSend.textContent = t('chatSend');

  const tool = (icon, labelKey, run) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn is-mini chat-tool';
    btn.setAttribute('aria-label', t(labelKey));
    btn.title = t(labelKey);
    btn.innerHTML = iconSvg(icon, { size: 16 });
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); run(); });
    return btn;
  };
  el.chatTools.replaceChildren(
    tool('gift', 'giftOpen', () => openGiftChooser(entry)),
    tool('trade', 'tradeOpen', () => openTradeSheet(entry))
  );
}

export async function refreshChat({ markRead = false } = {}) {
  const entry = state.chat;
  if (!entry) return;
  try {
    const rows = await account.listMessages(userId(), entry.otherId);
    if (state.chat !== entry) return;
    paintChat(rows);
    noteTalk(entry.otherId, rows.at(-1) ?? null);
    if (markRead || rows.some((m) => m.recipient === userId() && !m.read_at)) {
      await account.markConversationRead(userId(), entry.otherId);
      state.social.unread.delete(entry.otherId);
      noteTalkRead(entry.otherId);
      updateBadges();
      paintInbox();
      chatWire?.send('read');
    }
  } catch {}
}

const chatDrafts = [];

function draftBubble(d) {
  const { bubble, meta } = chatBubble({ own: true, body: d.body, when: t(d.failed ? 'chatFailed' : 'chatSending'), kind: d.failed ? 'is-failed' : 'is-sending' });
  if (d.failed) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'chat-retry';
    retry.textContent = t('retry');
    retry.addEventListener('click', () => { synth.playTap(); deliverChat(d); });
    meta.appendChild(retry);
  }
  return bubble;
}

function repaintChat() {
  paintChat(state.chatRows ?? []);
  keepChatBottom();
}

async function deliverChat(d) {
  d.failed = false;
  if (state.chat?.otherId === d.otherId) repaintChat();
  try {
    const row = await account.sendChatMessage(d.sender, d.otherId, d.body);
    const at = chatDrafts.indexOf(d);
    if (at >= 0) chatDrafts.splice(at, 1);
    bump(state.profile, 'messagesSent');
    noteIn(state.profile, 'conversations', d.otherId, 500);
    store.saveProfile(state.profile);
    if (row) noteTalk(d.otherId, row);
    if (state.chat?.otherId === d.otherId) {
      if (row?.id && !state.chatRows.some((m) => m.id === row.id)) state.chatRows = [...state.chatRows, row];
      repaintChat();
      chatWire?.send('sent');
      refreshChat();
    }
  } catch (error) {
    d.failed = true;
    if (state.chat?.otherId === d.otherId) repaintChat();
    toast(esc(describeError(error)), 'error');
  }
}

export function paintChat(rows) {
  const mine = userId();
  state.chatRows = rows;
  const atBottom = el.chatLog.scrollHeight - el.chatLog.scrollTop - el.chatLog.clientHeight < 60;
  const lastMine = [...rows].reverse().find((m) => m.sender === mine);
  const drafts = chatDrafts.filter((d) => d.otherId === state.chat?.otherId && d.sender === mine);
  el.chatLog.replaceChildren(...rows.flatMap((m) => {
    const own = m.sender === mine;
    const { bubble } = chatBubble({ own, body: m.body, when: whenText(m.created_at), status: own ? (m.read_at ? 'read' : 'sent') : null });
    if (!own && m.id) {
      reportOnHold(bubble, () => openReport({ kind: 'message', ref: m.id, target: m.sender, name: state.chat?.profile?.username ?? '' }));
    }
    if (own && m === lastMine) {
      const receipt = document.createElement('span');
      receipt.className = `chat-receipt${m.read_at ? ' is-read' : ''}`;
      receipt.textContent = m.read_at ? t('chatSeenAt', { when: whenText(m.read_at) }) : t('chatSent');
      return [bubble, receipt];
    }
    return [bubble];
  }), ...drafts.map(draftBubble));
  if (atBottom || rows.length || drafts.length) el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

export function chatTyped() {
  if (!el.chatInput.value.trim()) return;
  const now = Date.now();
  if (now - typedAt < 2000) return;
  typedAt = now;
  chatWire?.send('typing');
}

export async function sendChat(event) {
  event.preventDefault();
  const entry = state.chat;
  const text = el.chatInput.value.trim();
  if (!entry || !text) return;
  if (!guardText(text, 'chat')) return;
  el.chatInput.value = '';
  typedAt = 0;
  const draft = { sender: userId(), otherId: entry.otherId, body: text, failed: false };
  chatDrafts.push(draft);
  synth.playMessage();
  await deliverChat(draft);
}

export function avatarPlacement(avatar) {
  const x = Number(avatar?.x), y = Number(avatar?.y);
  const z = Number(avatar?.z), r = Number(avatar?.r);
  if (!(z > 0) || !(r > 0)) {
    return { size: 'cover', position: `${Number.isFinite(x) ? x : 50}% ${Number.isFinite(y) ? y : 50}%` };
  }
  const short = 1 / z;
  const w = r >= 1 ? short * r : short;
  const h = r >= 1 ? short : short / r;
  const ox = 0.5 - (x / 100) * w;
  const oy = 0.5 - (y / 100) * h;
  const px = Math.abs(1 - w) < 1e-6 ? 0 : (ox / (1 - w)) * 100;
  const py = Math.abs(1 - h) < 1e-6 ? 0 : (oy / (1 - h)) * 100;
  return { size: `${(w * 100).toFixed(3)}% ${(h * 100).toFixed(3)}%`, position: `${px.toFixed(3)}% ${py.toFixed(3)}%` };
}

export function paintAvatarInto(node, profile, { frame = null } = {}) {
  const avatar = profile?.avatar;
  if (avatar?.url) {
    node.textContent = '';
    const place = avatarPlacement(avatar);
    node.style.backgroundImage = `url("${String(avatar.url).replace(/"/g, '%22')}")`;
    node.style.backgroundSize = place.size;
    node.style.backgroundPosition = place.position;
    node.style.backgroundRepeat = 'no-repeat';
    node.classList.add('has-avatar');
  } else {
    node.style.backgroundImage = '';
    node.classList.remove('has-avatar');
    node.textContent = String(profile?.username ?? '?').slice(0, 1);
  }
  const worn = frame ?? { style: avatar?.frame?.style, tier: frameTier(profile?.level) };
  paintFrameInto(node, worn.style ?? null, worn.style ? worn.tier : 0);
}
export function paintRingFace(ring, profile) {
  if (!ring) return;
  const url = profile?.avatar?.url;
  let face = ring.querySelector(':scope > .ring-face');
  if (!url) { face?.remove(); ring.classList.remove('has-face'); return; }
  if (!face) {
    face = document.createElement('span');
    face.className = 'ring-face';
    face.setAttribute('aria-hidden', 'true');
    ring.insertBefore(face, ring.querySelector(':scope > .frame-overlay'));
  }
  const place = avatarPlacement(profile.avatar);
  face.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`;
  face.style.backgroundSize = place.size;
  face.style.backgroundPosition = place.position;
  ring.classList.add('has-face');
}

export const statsSeen = new Map();

let friendsUi = null;

export const loadFriendsUi = () => (friendsUi ??= import('./friends.js').catch((error) => { friendsUi = null; throw error; }));

const later = (name) => (...args) => loadFriendsUi().then((m) => m[name](...args), () => null);

export const renderFriends = later('renderFriends');
export const openFriend = later('openFriend');
export const freshFriendStats = later('freshFriendStats');
export const paintFriendPresence = later('paintFriendPresence');
export const openGiftChooser = later('openGiftChooser');
export const openTradeSheet = later('openTradeSheet');
export const openTradeAnswer = later('openTradeAnswer');
export const openWishMatches = later('openWishMatches');
export const openAvatarPicker = later('openAvatarPicker');

export function runSearch(event) {
  event?.preventDefault();
  return loadFriendsUi().then((m) => m.runSearch(event), () => null);
}

