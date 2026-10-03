import * as account from '../account.js';
import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { press, reveal } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { el, state } from './core.js';
import { showGate, signedIn, userId } from './gate.js';
import { whenText } from './drawer.js';
import { isBlocked } from './safety.js';
import { makeBadge, paintInbox, paintSocialTabs } from './inbox.js';
import { gameStage } from './arcade.js';
import { loadFriends, onlineNow, openChat, paintAvatarInto } from './social.js';

export const TALK_TTL = 30000;

export function talks() {
  const me = userId();
  if (!state.talks || state.talks.owner !== me) {
    state.talks = { owner: me, rows: [], loadedAt: 0, more: false, loading: null, failed: false };
  }
  return state.talks;
}

const byLatest = (a, b) => (Date.parse(b.lastAt ?? 0) || 0) - (Date.parse(a.lastAt ?? 0) || 0);

function upsert(other, patch) {
  if (!other) return null;
  const log = talks();
  let row = log.rows.find((r) => r.other === other);
  if (!row) {
    row = { other, lastId: null, lastSender: null, lastBody: '', lastAt: null, lastReadAt: null, unread: 0 };
    log.rows.push(row);
  }
  Object.assign(row, patch);
  log.rows.sort(byLatest);
  return row;
}

function repaintSoon() {
  if (state.tab === 'discussions') renderDiscussions();
}

export function noteTalk(other, m) {
  if (!other || !m) return;
  const row = talks().rows.find((r) => r.other === other);
  if (row?.lastAt && Date.parse(row.lastAt) > Date.parse(m.created_at ?? 0)) return;
  upsert(other, { lastId: m.id ?? null, lastSender: m.sender, lastBody: m.body ?? '', lastAt: m.created_at ?? new Date().toISOString(), lastReadAt: m.read_at ?? null });
  repaintSoon();
}

export function noteTalkRead() {
  repaintSoon();
}

export function onTalkLive(row, kind = 'message') {
  const me = userId();
  if (!row) return;
  if (kind === 'read') {
    const talk = talks().rows.find((r) => r.other === row.recipient);
    if (talk && talk.lastSender === me && Date.parse(talk.lastAt ?? 0) <= Date.parse(row.created_at ?? 0)) talk.lastReadAt = row.read_at;
    repaintSoon();
    return;
  }
  const other = row.sender === me ? row.recipient : row.sender;
  upsert(other, {
    lastId: row.id ?? null, lastSender: row.sender, lastBody: row.body ?? '',
    lastAt: row.created_at ?? new Date().toISOString(), lastReadAt: row.read_at ?? null
  });
  repaintSoon();
}

export function unreadOf(other) {
  return state.social.unread?.get?.(other) ?? 0;
}

export function loadDiscussions({ more = false, quiet = false, force = false } = {}) {
  if (!signedIn()) { renderDiscussions(); return Promise.resolve(); }
  const log = talks();
  if (log.loading) return log.loading;
  if (!more && !force && quiet && Date.now() - log.loadedAt < TALK_TTL) return Promise.resolve();
  const before = more ? log.rows.at(-1)?.lastAt ?? null : null;
  const me = userId();
  log.loading = (async () => {
    if (!state.social.loaded) await loadFriends();
    try {
      const page = await account.listConversations(me, { before });
      if (userId() !== me) return;
      if (!more) log.rows = [];
      for (const r of page.rows) {
        upsert(r.other, r);
        if (r.unread > 0) {
          state.social.unread.set(r.other, r.unread);
          if (r.lastSender === r.other) (state.social.unreadLast ??= new Map()).set(r.other, { id: r.lastId, at: r.lastAt });
        } else state.social.unread.delete(r.other);
      }
      log.more = page.more;
      log.loadedAt = Date.now();
      log.failed = false;
    } catch {
      log.failed = true;
    }
  })().finally(() => {
    log.loading = null;
    paintInbox();
    repaintSoon();
  });
  if (!quiet) repaintSoon();
  return log.loading;
}

function talkRow(row, entry) {
  const me = userId();
  const person = entry.profile;
  const unread = unreadOf(row.other);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `talk-row${unread ? ' is-unread' : ''}`;
  btn.dataset.other = row.other;
  btn.innerHTML = `
    <span class="person-mark"></span>
    <span class="talk-copy">
      <span class="talk-top"><b class="talk-name"></b><span class="talk-when"></span></span>
      <span class="talk-bottom"><span class="talk-last"></span></span>
    </span>`;
  const mark = btn.querySelector('.person-mark');
  paintAvatarInto(mark, person);
  const online = onlineNow(person);
  if (online !== null) {
    const dot = document.createElement('span');
    dot.className = `presence-dot${online ? ' is-online' : ''}`;
    dot.setAttribute('aria-hidden', 'true');
    mark.appendChild(dot);
  }
  btn.querySelector('.talk-name').textContent = person.username ?? '';
  btn.querySelector('.talk-when').textContent = whenText(row.lastAt);
  const last = btn.querySelector('.talk-last');
  if (row.lastSender === me) {
    const ticks = document.createElement('span');
    ticks.className = `talk-ticks${row.lastReadAt ? ' is-read' : ''}`;
    ticks.innerHTML = iconSvg(row.lastReadAt ? 'checks' : 'check', { size: 13 });
    ticks.setAttribute('aria-label', t(row.lastReadAt ? 'chatSeen' : 'chatSent'));
    last.appendChild(ticks);
    const you = document.createElement('span');
    you.className = 'talk-you';
    you.textContent = t('talkYou');
    last.appendChild(you);
  }
  last.appendChild(document.createTextNode(row.lastBody ?? ''));
  if (unread) {
    const badge = makeBadge('message', unread, { cap: 99, label: t('inboxUnread', { n: unread }) });
    btn.querySelector('.talk-bottom').appendChild(badge);
  }
  const label = [person.username, online ? t('friendOnline') : '', unread ? t('inboxUnread', { n: unread }) : '', row.lastBody].filter(Boolean).join(', ');
  btn.setAttribute('aria-label', label);
  press(btn, { sound: null });
  btn.addEventListener('click', () => { synth.playTap(); openChat(entry, { from: 'discussions' }); });
  return btn;
}

export function renderDiscussions() {
  if (!el.discussionsTitle) return;
  el.discussionsTitle.textContent = t('tabDiscussions');
  el.discussionsIntro.textContent = t('talksIntro');
  paintSocialTabs();
  const guest = !signedIn();
  document.getElementById('screen-discussions')?.classList.toggle('is-guest', guest);
  el.discussionsList.hidden = guest;
  let gate = document.getElementById('discussions-gate');
  if (guest && !gate) {
    gate = gameStage('chat', t('talksSignIn'), account.configured ? { label: t('gateSignIn'), run: () => showGate() } : null);
    gate.id = 'discussions-gate';
    el.discussionsList.before(gate);
  }
  if (gate) gate.hidden = !guest;
  el.discussionsMore.hidden = true;
  el.discussionsEmpty.hidden = true;
  if (guest) return;

  const log = talks();
  const friends = new Map(state.social.friends.map((f) => [f.otherId, f]));
  const rows = log.rows.filter((r) => friends.has(r.other) && !isBlocked(r.other));
  const before = new Set([...el.discussionsList.children].map((n) => n.dataset.other));
  el.discussionsList.replaceChildren(...rows.map((r) => talkRow(r, friends.get(r.other))));
  el.discussionsList.classList.toggle('is-loading', Boolean(log.loading) && !log.loadedAt);
  const fresh = [...el.discussionsList.children].filter((n) => !before.has(n.dataset.other));
  if (fresh.length) reveal(fresh, { step: 24, from: 8 });

  if (!el.discussionsMore.dataset.bound) {
    el.discussionsMore.dataset.bound = '1';
    press(el.discussionsMore, { sound: null });
    el.discussionsMore.addEventListener('click', () => { synth.playTap(); loadDiscussions({ more: true }); });
  }
  el.discussionsMore.hidden = !log.more;
  el.discussionsMore.textContent = t('talksMore');
  el.discussionsMore.disabled = Boolean(log.loading);

  const nothing = !rows.length && log.loadedAt > 0;
  el.discussionsEmpty.hidden = !nothing;
  if (nothing) {
    el.discussionsEmptyMark.innerHTML = iconSvg('chat', { size: 46 });
    el.discussionsEmptyText.textContent = t(state.social.friends.length ? 'talksEmpty' : 'talksNoFriends');
  }
  el.discussionsStatus.hidden = !log.failed;
  el.discussionsStatus.textContent = log.failed ? t('talksFailed') : '';
}
