import { SHOWCASE_MAX } from '../showcase.js';
import { withSpecialPhoto } from '../codedefs.js';
import * as account from '../account.js';
import { bump, bumpMax, bumpMin, noteIn } from '../ledger.js';
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
import { CURRENCY_NAME, formatAmount } from '../pricing.js';
import { buildAlbums } from '../albums.js';
import { emit } from '../ui/bus.js';
import { gameStage, reportQuest, seasonReached } from './arcade.js';
import { checkReportsAnswered, confirmBlock, guardText, isBlocked, loadBlocks, openReport, reportOnHold } from './safety.js';
import { econ, econMessage, refreshEconomy, serverEconomy } from './econ.js';
import { applyStanding, liveNotice } from './notices.js';
import { buildAlbumCover, classicSections, renderBinder } from './binder.js';
import { el, esc, openSheet, refreshWallet, showScreen, state, toast } from './core.js';
import { buildStaticCard, openCardDetail, refreshWishes } from './detail.js';
import { pushNote, whenText } from './drawer.js';
import { noteTalk, noteTalkRead, onTalkLive } from './discussions.js';
import { describeError, pullSaveNow, showGate, signedIn, syncSoon, userId } from './gate.js';
import { live } from './live.js';
import { clearNotify, shouldNotify, systemNotify } from './notify.js';
import { gainBooster } from './open.js';
import { buildBooster, renderPacks } from './packs.js';
import { formatDuration, renderProfile } from './profile.js';
import { badgeChip, paintFrameInto, updateBadges } from './regalia.js';
import { badgeStateFromRank } from '../badges.js';
import { renderCustomize } from './settings.js';
import { keepPending, pending } from './pending.js';
import { recall, remember } from './memo.js';
import { spareRarity } from '../econ/rules.js';
import { chatBubble } from './bubble.js';
import { inboxReady, makeBadge, paintInbox, paintSocialTabs } from './inbox.js';
import { pruneCleared } from './drawer.js';
import { markThumb } from './mature.js';
import { freshFriendStats, markStatsSeen, openFriend, openPlayer, paintFriendPresence, refreshViewedRelation } from './player.js';

export {
  freshFriendStats, leaveFriend, markPlayer, openFriend, openFriendWishlist, openPlayer, paintFriendPresence,
  paintFriendStats, relationOf, renderFriend, returnToFriend, STATS_TTL, statsAge
} from './player.js';

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
      for (const entry of lists.friends) markStatsSeen(entry.otherId, now);
    } catch {
      state.social.loaded = false;
    }
    updateBadges();
    paintInbox();
    if (state.tab === 'friends') renderFriends();
    if (state.tab === 'profile') renderProfile();
    if (state.tab === 'friend') refreshViewedRelation();
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
  for (const entry of lists.friends) markStatsSeen(entry.otherId, now);
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
  if (state.tab === 'friend' && state.viewing) { refreshViewedRelation(); freshFriendStats(state.viewing); }
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
  if (state.tab === 'customize') renderCustomize();
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
  if (state.tab === 'friend') refreshViewedRelation();
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

function socialError(error) {
  const key = SOCIAL_CODES[String(error?.message ?? '')];
  if (key) return t(key);
  return serverEconomy() ? econMessage(error, t) : describeError(error);
}

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
        if (state.tab === 'customize') renderCustomize();
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
