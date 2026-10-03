import { canClaim } from '../daily.js';
import { claimableTiers } from '../season.js';
import * as quests from '../quests.js';
import * as account from '../account.js';
import { iconSvg, logoSvg } from '../data/icons.js';
import { getLanguage, t } from '../i18n.js';
import { dur, press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { questUserKey, renderGames } from './arcade.js';
import { renderBinder } from './binder.js';
import { el, esc, navTabFor, openSheet, placeDrawerLinks, plainText, showScreen, state } from './core.js';
import { openDaily } from './daily.js';
import { userId } from './gate.js';
import { live } from './live.js';
import { showPacks, renderTimed } from './packs.js';
import { renderProfile } from './profile.js';
import { renderLeaderboard, renderQuests } from './quests.js';
import { achRedeemableCount, renderAchievements, renderBadgesScreen } from './regalia.js';
import { renderCustomize, renderSettings } from './settings.js';
import { payStipend, showShop } from './shop.js';
import { loadFriends, renderFriends } from './social.js';
import { friendsBadge, inboxCounts, openTarget, paintBadge, waitingChallenges } from './inbox.js';
import { isBlocked } from './safety.js';
import { emit } from '../ui/bus.js';
import { liveVersion } from '../live.js';
import { profileStamp, uiKey } from './keep.js';

const kept = new Map();

const KEPT = {
  glossary: () => '',
  atelier: () => `${profileStamp()}|${state.wallet}|${state.ink}`,
  season: () => `${profileStamp()}|${liveVersion()}|${Math.floor(Date.now() / 3600000)}`
};

const keptKey = (screen) => `${uiKey()}#${KEPT[screen]()}`;

export function drawerItems() {
  const go = (screen, paint) => async () => {
    const keep = KEPT[screen];
    if (!keep || kept.get(screen) !== keptKey(screen)) {
      await paint?.();
      if (keep) kept.set(screen, keptKey(screen));
    }
    showScreen(screen);
  };
  const lazy = (load, name) => () => load().then((m) => m[name]());
  return [
    { id: 'packs',  icon: 'packs',      key: 'tabBoosters',    run: go('packs', showPacks) },
    { id: 'timed',  icon: 'hourglass',  key: 'tabTimed',       run: go('timed', renderTimed) },
    { id: 'shop',   icon: 'gem',        key: 'tabShop',        run: go('shop', () => { payStipend(); showShop(); }) },
    { id: 'binder', icon: 'collection', key: 'tabCollection',  run: go('binder', renderBinder) },
    { id: 'selling', icon: 'label',     key: 'tabSelling',     run: go('selling', lazy(() => import('./selling.js'), 'renderSelling')) },
    { id: 'market', icon: 'trade',      key: 'tabMarket',      run: go('market', lazy(() => import('./market.js'), 'renderMarket')) },
    { id: 'cardindex', icon: 'search',  key: 'tabIndex',       run: go('cardindex', lazy(() => import('./cardindex.js'), 'renderCardIndex')) },
    { id: 'glossary', icon: 'filter',   key: 'tabGlossary',    run: go('glossary', lazy(() => import('./cardindex.js'), 'renderGlossary')) },
    { id: 'daily',  icon: 'gift',       key: 'dailyTitle', dot: () => canClaim(state.profile.daily),
      run: () => openDaily() },
    { id: 'ach',    icon: 'trophy',     key: 'achTitle',
      badge: () => achRedeemableCount(),
      run: go('ach', renderAchievements) },
    { id: 'badges', icon: 'star',       key: 'badgesTitle',    run: go('badges', renderBadgesScreen) },
    { id: 'quiz',   icon: 'quiz',       key: 'tabQuiz',        run: go('quiz', lazy(() => import('./quiz.js'), 'renderQuiz')) },
    { id: 'games',  icon: 'dice',       key: 'tabGames', kind: 'versus',
      badge: () => waitingChallenges().length,
      run: go('games', renderGames) },
    { id: 'quests', icon: 'scroll',     key: 'tabQuests',
      badge: () => quests.claimableCount(questUserKey()),
      run: go('quests', renderQuests) },
    { id: 'season', icon: 'calendar', key: 'tabSeason',
      dot: () => claimableTiers(state.profile) > 0,
      run: go('season', lazy(() => import('./season.js'), 'renderSeason')) },
    { id: 'leaderboard', icon: 'podium', key: 'tabLeaderboard', run: go('leaderboard', renderLeaderboard) },
    ...(account.configured
      ? [{ id: 'guilds', icon: 'shield', key: 'tabGuilds', kind: 'social',
           badge: () => inboxCounts().guild,
           run: go('guilds', lazy(() => import('./guilds.js'), 'renderGuilds')) }]
      : []),
    { sep: true },
    ...(account.configured
      ? [{ id: 'friends', icon: 'friends', key: 'tabFriends', kind: () => friendsBadge().kind,
           badge: () => friendsBadge().n,
           run: go('friends', () => { renderFriends(); loadFriends(); }) },
         { id: 'discussions', icon: 'chat', key: 'tabDiscussions', kind: 'message',
           badge: () => inboxCounts().message,
           run: () => openTarget('discussions') }]
      : []),
    { id: 'bell', icon: 'bell', key: 'notifTitle', kind: () => bellKind(),
      badge: () => unreadCount(),
      run: () => openNotifications() },
    { id: 'profile',  icon: 'profile',  key: 'tabProfile',  run: go('profile', renderProfile) },
    { id: 'updates',   icon: 'spark',    key: 'tabUpdates',   run: go('updates', lazy(() => import('./updates.js'), 'renderUpdates')) },
    { id: 'customize', icon: 'wand',     key: 'tabCustomize', run: go('customize', renderCustomize) },
    { id: 'atelier', icon: 'ink',        key: 'tabAtelier',   run: go('atelier', lazy(() => import('./atelier.js'), 'renderAtelier')) },
    { id: 'settings',  icon: 'settings', key: 'tabSettings',  run: go('settings', renderSettings) }
  ];
}

let drawerBuilt = '';

export function buildDrawer() {
  const items = drawerItems();
  const signature = `${getLanguage()}|${items.map((i) => i.sep ? '-' : i.id).join(',')}`;
  if (signature === drawerBuilt && el.drawerLinks.children.length) {
    placeDrawerLinks();
    paintDrawerLinks();
    return;
  }
  drawerBuilt = signature;
  el.drawerMark.innerHTML = logoSvg({ size: 34 });
  el.drawerLinks.replaceChildren(...items.map((item) => {
    if (item.sep) {
      const rule = document.createElement('div');
      rule.className = 'drawer-sep';
      return rule;
    }
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'drawer-link';
    row.dataset.link = item.id;
    row.innerHTML = `<span class="drawer-icon">${iconSvg(item.icon, { size: 20 })}</span>
      <span></span><span class="chip" hidden></span>`;
    row.querySelector('span:nth-child(2)').textContent = t(item.key);
    press(row, { sound: null });
    row.addEventListener('click', () => {
      synth.playTap();
      closeDrawer();
      item.run();
    });
    return row;
  }));
  placeDrawerLinks();
  paintDrawerLinks();
}

export const kindOf = (item) => (typeof item?.kind === 'function' ? item.kind() : item?.kind) ?? 'system';

export function paintDrawerLinks() {
  if (!el.drawerLinks) return;
  const items = new Map(drawerItems().filter((i) => !i.sep).map((i) => [i.id, i]));
  el.drawerLinks.querySelectorAll('.drawer-link').forEach((row) => {
    const item = items.get(row.dataset.link);
    row.classList.toggle('is-current', row.dataset.link === navTabFor(state.tab) || row.dataset.link === state.tab);
    const chip = row.querySelector('.chip');
    const n = item?.badge?.() ?? 0;
    const dot = !n && (item?.dot?.() ?? false);
    paintBadge(chip, kindOf(item), n);
    chip.classList.toggle('is-dot', dot);
    if (dot) chip.hidden = false;
  });
}

export function openDrawer() {
  buildDrawer();
  el.drawer.hidden = false;
  el.menuBtn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => el.drawer.classList.add('is-open'));
  synth.resume();
  synth.playDrawer(true);
}

export function closeDrawer() {
  if (el.drawer.hidden) return;
  synth.playDrawer(false);
  el.drawer.classList.remove('is-open');
  el.menuBtn.setAttribute('aria-expanded', 'false');
  setTimeout(() => { el.drawer.hidden = true; }, dur(300));
}

export function pushNote(icon, title, screen = 'friends', to = null) {
  const feed = state.profile.notifFeed ??= [];
  feed.unshift({ id: `note-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    icon, title: plainText(title), when: new Date().toISOString(), screen, ...(to ? { to } : {}) });
  if (feed.length > 30) feed.length = 30;
  store.saveProfile(state.profile);
  paintBell();
  paintDrawerLinks();
}

export function goToScreen(screen) {
  const item = drawerItems().find((entry) => entry.id === screen);
  if (item?.run) { item.run(); return; }
  showScreen(screen);
}

export function noteKind(icon, screen) {
  if (icon === 'addFriend') return 'request';
  if (icon === 'trade') return 'trade';
  if (icon === 'chat') return 'message';
  if (icon === 'gift') return 'gift';
  if (screen === 'versus' || icon === 'dice') return 'challenge';
  if (screen === 'guilds' || icon === 'shield') return 'guild';
  if (screen === 'quests') return 'quest';
  if (screen === 'season') return 'quest';
  if (screen === 'ach') return 'achievement';
  if (screen === 'market' || icon === 'bell') return 'auction';
  if (screen === 'packs' || icon === 'packs') return 'booster';
  return 'news';
}

export const NOTE_GROUPS = [
  ['action', ['trade', 'gift', 'challenge']],
  ['message', ['message']],
  ['request', ['request']],
  ['guild', ['guild']],
  ['news', ['auction', 'quest', 'achievement', 'booster', 'news']]
];

export const BADGE_KIND = {
  trade: 'gift', gift: 'gift', auction: 'gift', booster: 'gift',
  challenge: 'versus', message: 'message', request: 'social', guild: 'social',
  quest: 'system', achievement: 'system', news: 'system'
};

export const groupOf = (kind) => {
  const at = NOTE_GROUPS.findIndex(([, kinds]) => kinds.includes(kind));
  return at < 0 ? NOTE_GROUPS.length - 1 : at;
};

export function chatMark(sender, n) {
  const last = state.social.unreadLast?.get?.(sender);
  return { id: `chat-${sender}-${last?.id ?? n}`, at: last?.at ?? null };
}

export function notifications() {
  const rows = [];
  const me = userId();
  const friends = new Map((state.social.friends ?? []).map((f) => [f.otherId, f]));

  for (const entry of state.social.incoming) {
    if (isBlocked(entry.otherId)) continue;
    rows.push({ id: entry.id, icon: 'addFriend', kind: 'request', derived: true,
      title: t('notifRequest', { name: entry.profile?.username ?? t('friendSomeone') }),
      when: entry.created_at, to: `request:${entry.id}` });
  }
  for (const trade of state.social.trades ?? []) {
    if (trade.status !== 'pending' || trade.recipient !== me || isBlocked(trade.proposer)) continue;
    const who = friends.get(trade.proposer)?.profile?.username ?? '?';
    rows.push({ id: `trade-${trade.id}`, icon: 'trade', kind: 'trade', derived: true,
      title: t('notifTrade', { name: who }), when: trade.created_at, to: `trade:${trade.id}` });
  }
  for (const [sender, n] of state.social.unread ?? []) {
    const who = friends.get(sender);
    if (!who || !n || isBlocked(sender)) continue;
    const last = chatMark(sender, n);
    rows.push({ id: last.id, icon: 'chat', kind: 'message', derived: true,
      title: t('notifMessages', { n, name: who.profile.username }),
      when: last.at, to: `chat:${sender}` });
  }
  for (const note of state.profile.notifFeed ?? []) {
    rows.push({ id: note.id, icon: note.icon, kind: noteKind(note.icon, note.screen), title: note.title,
      when: note.when, to: note.to ?? note.screen });
  }
  const cleared = new Set(state.profile.notifCleared ?? []);
  return rows.filter((row) => !cleared.has(row.id)).map((row) => ({ ...row, run: () => openTarget(row.to) }));
}

const stamp = (row) => { const at = Date.parse(row.when ?? ''); return Number.isFinite(at) ? at : Date.now(); };

export function sortNotes(rows) {
  return [...rows].sort((a, b) => (groupOf(a.kind) - groupOf(b.kind)) || (Number(Boolean(b.derived)) - Number(Boolean(a.derived))) || (stamp(b) - stamp(a)));
}

export function isRead(id) {
  return ((state.profile.notifRead ?? []).includes(id));
}

export function unreadNotes() {
  return notifications().filter((n) => !isRead(n.id));
}

export function unreadCount() {
  return unreadNotes().length;
}

export function bellKind() {
  const unread = sortNotes(unreadNotes());
  return unread.length ? BADGE_KIND[unread[0].kind] ?? 'system' : 'system';
}

function keepLive(ids) {
  const live = new Set(notifications().map((n) => n.id));
  return [...new Set(ids)].filter((id) => live.has(id)).slice(-300);
}

export function markRead(ids) {
  state.profile.notifRead = keepLive([...(state.profile.notifRead ?? []), ...ids]);
  store.saveProfile(state.profile);
  paintBell();
  paintDrawerLinks();
}

export function clearNotes(ids) {
  const drop = new Set(ids);
  const shown = notifications();
  const derived = shown.filter((n) => n.derived && drop.has(n.id)).map((n) => n.id);
  const all = new Set([...shown.map((n) => n.id), ...(state.profile.notifCleared ?? [])]);
  state.profile.notifFeed = (state.profile.notifFeed ?? []).filter((note) => !drop.has(note.id));
  state.profile.notifCleared = [...new Set([...(state.profile.notifCleared ?? []), ...derived])].filter((id) => all.has(id)).slice(-300);
  state.profile.notifRead = (state.profile.notifRead ?? []).filter((id) => !drop.has(id));
  store.saveProfile(state.profile);
  paintBell();
  paintDrawerLinks();
}

export function pruneCleared() {
  const held = state.profile.notifCleared ?? [];
  if (!held.length || !state.social.loaded) return;
  const me = userId();
  const live = new Set([
    ...state.social.incoming.map((e) => e.id),
    ...(state.social.trades ?? []).filter((tr) => tr.status === 'pending' && tr.recipient === me).map((tr) => `trade-${tr.id}`),
    ...[...(state.social.unread ?? [])].map(([sender, n]) => chatMark(sender, n).id)
  ]);
  const kept = held.filter((id) => live.has(id));
  if (kept.length === held.length) return;
  state.profile.notifCleared = kept;
  store.saveProfile(state.profile);
}

export function paintBell() {
  if (!el.bellCount) return;
  const n = unreadCount();
  const kind = bellKind();
  paintBadge(el.bellCount, kind, n, { cap: 9 });
  el.bell.classList.toggle('is-hot', n > 0);
  el.bell.dataset.kind = n ? kind : '';
  el.bell.setAttribute('aria-label', n ? `${t('notifTitle')}: ${t('notifNewCount', { n })}` : t('notifTitle'));
  emit('bell', n);
}

export function openNotifications() {
  openSheet(t('notifTitle'), (body) => paintNotes(body));
}

function noteRow(note, unread, body) {
  const row = document.createElement('div');
  row.className = `note-row is-${note.kind}${unread ? ' is-unread' : ' is-read'}`;
  row.dataset.note = note.id;
  row.dataset.kind = note.kind;
  row.innerHTML = `<button type="button" class="note-open"><span class="note-mark">${iconSvg(note.icon, { size: 18 })}</span>
    <span class="note-copy"><b></b><span class="note-sub"><em></em><i></i></span></span>
    <span class="note-go">${iconSvg('chevron', { size: 16 })}</span></button>`;
  row.querySelector('b').textContent = plainText(note.title);
  row.querySelector('em').textContent = t(`notifKind_${note.kind}`);
  const when = whenText(note.when);
  row.querySelector('i').textContent = when ? ` · ${when}` : '';
  const open = row.querySelector('.note-open');
  press(open, { sound: null });
  open.addEventListener('click', () => { synth.playTap(); markRead([note.id]); live.sheet.hide(); note.run(); });
  if (unread) {
    const read = document.createElement('button');
    read.type = 'button';
    read.className = 'note-tick';
    read.setAttribute('aria-label', t('notifMarkRead'));
    read.title = t('notifMarkRead');
    read.innerHTML = iconSvg('check', { size: 15 });
    read.addEventListener('click', () => { synth.playTap(); markRead([note.id]); paintNotes(body); });
    row.appendChild(read);
  }
  return row;
}

export function paintNotes(body) {
  body.replaceChildren();
  body.classList.add('notes-body');
  const list = notifications();
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'notes-empty';
    empty.innerHTML = `<span class="notes-empty-mark">${iconSvg('bell', { size: 30 })}</span><b></b><p></p>`;
    empty.querySelector('b').textContent = t('notifEmptyTitle');
    empty.querySelector('p').textContent = t('notifEmpty');
    body.appendChild(empty);
    return;
  }
  const fresh = sortNotes(list.filter((n) => !isRead(n.id)));
  const earlier = sortNotes(list.filter((n) => isRead(n.id)));

  const head = document.createElement('div');
  head.className = 'notes-head';
  const count = document.createElement('span');
  count.className = 'notes-count';
  count.textContent = fresh.length ? t('notifNewCount', { n: fresh.length }) : t('notifAllRead');
  const tools = document.createElement('div');
  tools.className = 'notes-tools';
  const tool = (key, kind, run, enabled = true) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-ghost btn-sm notes-${kind}`;
    btn.textContent = t(key);
    btn.disabled = !enabled;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); run(); paintNotes(body); });
    return btn;
  };
  tools.append(
    tool('notifReadAll', 'readall', () => markRead(list.map((n) => n.id)), fresh.length > 0),
    tool('notifClearAll', 'clearall', () => clearNotes(list.map((n) => n.id)))
  );
  head.append(count, tools);
  body.appendChild(head);

  if (fresh.length) {
    const wrap = document.createElement('div');
    wrap.className = 'notes';
    let group = -1;
    for (const note of fresh) {
      const g = groupOf(note.kind);
      if (g !== group) {
        group = g;
        const name = NOTE_GROUPS[g][0];
        const title = document.createElement('p');
        title.className = 'notes-shelf';
        title.dataset.group = name;
        title.textContent = t(`notifGroup_${name}`);
        wrap.appendChild(title);
      }
      wrap.appendChild(noteRow(note, true, body));
    }
    body.appendChild(wrap);
  }
  if (earlier.length) {
    const title = document.createElement('p');
    title.className = 'notes-shelf is-read';
    title.textContent = t('notifEarlier');
    body.appendChild(title);
    const wrap = document.createElement('div');
    wrap.className = 'notes is-read';
    wrap.replaceChildren(...earlier.map((note) => noteRow(note, false, body)));
    body.appendChild(wrap);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn-ghost btn-sm btn-block notes-clear';
    clear.textContent = t('notifClearRead', { n: earlier.length });
    press(clear, { sound: null });
    clear.addEventListener('click', () => { synth.playTap(); clearNotes(earlier.map((n) => n.id)); paintNotes(body); });
    body.appendChild(clear);
  }
}

export function whenText(iso) {
  const at = Date.parse(iso ?? '');
  if (!Number.isFinite(at)) return '';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return t('accountJustNow');
  if (mins < 60) return t('accountMinsAgo', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('notifHoursAgo', { n: hours });
  return t('notifDaysAgo', { n: Math.round(hours / 24) });
}

export const HELP = {
  packs:   { steps: 3, tip: true },
  profile: { steps: 3, tip: true },
  ach:     { steps: 3, tip: true },
  badges:  { steps: 3, tip: true },
  customize: { steps: 3, tip: true },
  timed:   { steps: 4, tip: true },
  shop:    { steps: 3, tip: true },
  binder:  { steps: 3, tip: true },
  friends: { steps: 3, tip: true },
  quiz:    { steps: 3, tip: true },
  market:  { steps: 3, tip: true },
  index:   { steps: 3, tip: true },
  games:   { steps: 3, tip: true },
  wikdle:  { steps: 3, tip: true },
  duel:    { steps: 3, tip: true },
  reveal:  { steps: 3, tip: true },
  versus:  { steps: 3, tip: true },
  quests:  { steps: 3, tip: true },
  leaderboard: { steps: 3, tip: true },
  guilds:  { steps: 5, tip: true },
  season:  { steps: 4, tip: true },
  atelier: { steps: 4, tip: true }
};

export function openHelp(topic) {
  const shape = HELP[topic];
  if (!shape) return;
  openSheet(t(`help_${topic}_title`), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'help-body';

    const lead = document.createElement('p');
    lead.className = 'help-lead';
    lead.textContent = t(`help_${topic}_lead`);
    wrap.appendChild(lead);

    for (let i = 1; i <= shape.steps; i++) {
      const step = document.createElement('div');
      step.className = 'help-step';
      step.innerHTML = `<span class="help-num">${i}</span><p></p>`;
      step.querySelector('p').innerHTML = esc(t(`help_${topic}_${i}`))
        .replace(/\*([^*]+)\*/g, '<b>$1</b>');
      wrap.appendChild(step);
    }

    if (shape.tip) {
      const tip = document.createElement('p');
      tip.className = 'help-tip';
      tip.textContent = t(`help_${topic}_tip`);
      wrap.appendChild(tip);
    }
    body.appendChild(wrap);
  });
}
