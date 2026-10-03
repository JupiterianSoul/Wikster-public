import { t } from '../i18n.js';
import { emit } from '../ui/bus.js';
import { el, showScreen, state } from './core.js';
import { userId } from './gate.js';
import { isBlocked } from './safety.js';
import { goToScreen, paintBell, paintDrawerLinks } from './drawer.js';

export const KIND_RANK = ['gift', 'versus', 'message', 'social', 'system'];

export function friendIds() {
  return new Set((state.social.friends ?? []).map((f) => f.otherId));
}

export function unreadMessages() {
  const friends = state.social.loaded ? friendIds() : null;
  let n = 0;
  for (const [sender, count] of state.social.unread ?? []) {
    if (isBlocked(sender) || (friends && !friends.has(sender))) continue;
    n += count;
  }
  return n;
}

export function pendingTrades() {
  const me = userId();
  return (state.social.trades ?? []).filter((tr) => tr.status === 'pending' && tr.recipient === me && !isBlocked(tr.proposer));
}

export function waitingChallenges() {
  const me = userId();
  const rows = state.versus?.rows ?? [];
  return rows.filter((c) => (c.status === 'open' && c.opponent === me) || (c.status === 'done' && !(c.claimed ?? []).includes(me)));
}

export function inboxCounts() {
  return {
    message: unreadMessages(),
    request: (state.social.incoming ?? []).filter((e) => !isBlocked(e.otherId)).length,
    trade: pendingTrades().length,
    guild: (state.social.guildInvites ?? []).length,
    challenge: waitingChallenges().length
  };
}

export function topKind(parts) {
  return KIND_RANK.find((kind) => (parts[kind] ?? 0) > 0) ?? 'system';
}

export function socialBadge() {
  const c = inboxCounts();
  const parts = { gift: c.trade, versus: c.challenge, message: c.message, social: c.request + c.guild };
  const n = c.trade + c.challenge + c.message + c.request + c.guild;
  return { n, kind: topKind(parts) };
}

export function friendsBadge() {
  const c = inboxCounts();
  return { n: c.request + c.trade, kind: c.trade ? 'gift' : 'social' };
}

export const badgeText = (n, cap = 99) => (n > cap ? `${cap}+` : String(n));

export function paintBadge(node, kind, n, { cap = 99, label = '' } = {}) {
  if (!node) return;
  const count = Math.max(0, Number(n) || 0);
  const before = Number(node.dataset.n ?? 0);
  node.classList.add('nb');
  for (const k of KIND_RANK) node.classList.toggle(`is-${k}`, k === kind);
  node.textContent = count ? badgeText(count, cap) : '';
  node.hidden = count === 0;
  node.dataset.n = String(count);
  node.dataset.kind = kind;
  if (label) node.setAttribute('aria-label', label);
  if (count > before && node.isConnected) {
    node.classList.remove('is-new');
    void node.offsetWidth;
    node.classList.add('is-new');
    clearTimeout(node.newTimer);
    node.newTimer = setTimeout(() => node.classList.remove('is-new'), 900);
  }
}

export function makeBadge(kind, n, opts) {
  const node = document.createElement('span');
  node.className = 'nb';
  paintBadge(node, kind, n, opts);
  return node;
}

export function paintInbox() {
  const social = socialBadge();
  if (el.menuBadge) paintBadge(el.menuBadge, social.kind, social.n, { cap: 9, label: t('inboxWaiting', { n: social.n }) });
  paintBell();
  paintDrawerLinks();
  paintSocialTabs();
  emit('inbox', inboxCounts());
}

export function paintSocialTabs() {
  const c = inboxCounts();
  const friends = friendsBadge();
  for (const bar of document.querySelectorAll('[data-social-tabs]')) {
    if (!bar.childElementCount) buildSocialTabs(bar);
    const on = state.tab === 'discussions' ? 'discussions' : 'friends';
    for (const btn of bar.querySelectorAll('.social-tab')) {
      const id = btn.dataset.go;
      btn.classList.toggle('is-on', id === on);
      btn.setAttribute('aria-selected', String(id === on));
      btn.querySelector('.social-tab-label').textContent = t(id === 'friends' ? 'tabFriends' : 'tabDiscussions');
      const badge = btn.querySelector('.nb');
      if (id === 'friends') paintBadge(badge, friends.kind, friends.n);
      else paintBadge(badge, 'message', c.message);
    }
  }
}

function buildSocialTabs(bar) {
  bar.setAttribute('role', 'tablist');
  for (const id of ['friends', 'discussions']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'social-tab';
    btn.dataset.go = id;
    btn.setAttribute('role', 'tab');
    const label = document.createElement('span');
    label.className = 'social-tab-label';
    btn.append(label, makeBadge(id === 'friends' ? 'social' : 'message', 0));
    btn.addEventListener('click', () => {
      if (state.tab === id) return;
      openTarget(id);
    });
    bar.appendChild(btn);
  }
}

function spotlight(node) {
  if (!node) return;
  node.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  node.classList.remove('is-spotlit');
  void node.offsetWidth;
  node.classList.add('is-spotlit');
  setTimeout(() => node.classList.remove('is-spotlit'), 2400);
}

async function friendEntry(id) {
  const social = await import('./social.js');
  let entry = state.social.friends.find((f) => f.otherId === id);
  if (!entry) {
    await social.loadFriends();
    entry = state.social.friends.find((f) => f.otherId === id);
  }
  return entry ?? null;
}

export async function openTarget(tag) {
  const raw = String(tag ?? '');
  const at = raw.indexOf(':');
  const kind = at < 0 ? raw : raw.slice(0, at);
  const ref = at < 0 ? '' : raw.slice(at + 1);
  const social = await import('./social.js');
  if (kind === 'chat' && ref) {
    const entry = await friendEntry(ref);
    if (entry) { social.openChat(entry); return true; }
    await openTarget('discussions');
    return false;
  }
  if (kind === 'discussions') {
    const talks = await import('./discussions.js');
    talks.renderDiscussions();
    showScreen('discussions');
    talks.loadDiscussions({ quiet: true });
    return true;
  }
  if (kind === 'trade' || kind === 'trades') {
    social.renderFriends();
    showScreen('friends');
    let trade = (state.social.trades ?? []).find((tr) => tr.id === ref);
    if (ref && (!trade || !trade.offer)) {
      await social.refreshTrades();
      trade = (state.social.trades ?? []).find((tr) => tr.id === ref);
    }
    if (trade && trade.status === 'pending' && trade.recipient === userId()) { social.openTradeAnswer(trade); return true; }
    spotlight(el.tradesList?.firstElementChild);
    return Boolean(trade);
  }
  if (kind === 'request' || kind === 'friends') {
    social.renderFriends();
    showScreen('friends');
    if (kind === 'request') {
      if (ref && !state.social.incoming.some((e) => e.id === ref)) await social.loadFriends();
      requestAnimationFrame(() => spotlight(document.querySelector(`#incoming-list [data-request="${CSS.escape(ref)}"]`) ?? el.incomingList?.firstElementChild));
    }
    return true;
  }
  if (kind === 'versus') {
    const versus = await import('./versus.js');
    showScreen('versus');
    versus.renderVersus({ focus: ref || null });
    return true;
  }
  if (kind === 'guilds' || kind === 'guild') {
    goToScreen('guilds');
    setTimeout(() => spotlight(el.guildInvitesRoom && !el.guildInvitesRoom.hidden ? el.guildInvitesRoom : null), 500);
    return true;
  }
  if (kind === 'postbox') { goToScreen('packs'); return true; }
  goToScreen(kind || 'packs');
  return true;
}

if (typeof window !== 'undefined') {
  const queued = [];
  let ready = false;
  window.wiksterOpenTag = (tag) => {
    if (ready) { openTarget(tag).catch(() => {}); return true; }
    queued.push(tag);
    return true;
  };
  window.addEventListener('wikster:inbox-ready', () => {
    ready = true;
    while (queued.length) openTarget(queued.shift()).catch(() => {});
  });
}

export function inboxReady() {
  window.dispatchEvent(new Event('wikster:inbox-ready'));
}
