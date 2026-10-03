import { GAME_SCREENS } from './gamekeys.js';
import { t, tx, getLanguage } from '../i18n.js';
import { buckSvg, iconSvg, inkSvg, logoSvg } from '../data/icons.js';
import { formatAmount } from '../pricing.js';
import { atMaxLevel, levelFraction, levelOf, rankFor } from '../progression.js';
import { afterReveal, hushing } from '../app/hush.js';
import { frameTier } from '../frames.js';
import { canClaim, msUntilNextUtcDay } from '../daily.js';
import { formatCountdown } from '../shop.js';
import { msToNext } from '../timed.js';
import { h, fill } from '../ui/dom.js';
import { on } from '../ui/bus.js';
import { Ring } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { el, showScreen, state } from '../app/core.js';
import { live } from '../app/live.js';
import { bellKind, drawerItems, kindOf, openNotifications, unreadCount } from '../app/drawer.js';
import { inboxCounts, makeBadge, paintBadge, topKind } from '../app/inbox.js';
import { frameStyle, paintFrameInto } from '../app/regalia.js';
import { paintAvatarInto } from '../app/social.js';
import { applyScale, setUiScale, uiScale } from './mode.js';
import { watchSheet } from './sheet.js';
import { mountOpening, openingKey } from './opening.js';
import { closePop, keycap, popOpen } from './kit.js';
import { adaptLegacy, legacyKey, legacyPrompts, legacyShown } from './legacy.js';

export const DESTINATIONS = [
  { id: 'home', key: 'pcHome', icon: 'home' },
  { id: 'boosters', key: 'tabBoosters', icon: 'packs', subs: [['packs', 'tabBoosters'], ['custom', 'tabCustom'], ['timed', 'tabTimed']] },
  { id: 'collection', key: 'tabCollection', icon: 'collection', subs: [['binder', 'tabCollection'], ['albums', 'pcAlbums'], ['classic', 'pcClassic'], ['selling', 'tabSelling'], ['cardindex', 'tabIndex'], ['glossary', 'tabGlossary']] },
  { id: 'shop', key: 'tabShop', icon: 'gem', subs: [['shop', 'tabShop'], ['atelier', 'tabAtelier'], ['market', 'tabMarket']] },
  { id: 'play', key: 'pcPlay', icon: 'dice', subs: [['games', 'tabGames'], ['quiz', 'tabQuiz'], ['quests', 'tabQuests'], ['season', 'tabSeason'], ['leaderboard', 'tabLeaderboard']] },
  { id: 'social', key: 'pcSocial', icon: 'friends', subs: [['friends', 'tabFriends'], ['discussions', 'tabDiscussions'], ['guilds', 'tabGuilds']] }
];

const HIDDEN = [
  { id: 'profile', key: 'tabProfile', subs: [['profile', 'tabProfile'], ['ach', 'achTitle'], ['badges', 'badgesTitle'], ['customize', 'tabCustomize']] },
  { id: 'system', key: 'tabSettings', subs: [['settings', 'tabSettings'], ['updates', 'tabUpdates']] }
];

const EXTRA = {
  open: 'boosters', friend: 'social', chat: 'social', discussions: 'social',
  wikdle: 'play', duel: 'play', reveal: 'play', versus: 'play'
};

const PARENT = { open: 'packs', friend: 'friends', chat: 'friends', wikdle: 'games', duel: 'games', reveal: 'games', versus: 'games' };

const ALL = [...DESTINATIONS, ...HIDDEN];

const friendOrigin = () => (state.friendFrom && state.friendFrom !== 'friend' && state.friendFrom !== 'chat' ? state.friendFrom : null);

export function destinationOf(screen) {
  if (screen === 'friend' && friendOrigin()) return destinationOf(friendOrigin()) ?? EXTRA.friend;
  if (EXTRA[screen]) return EXTRA[screen];
  return ALL.find((d) => d.subs?.some(([id]) => id === screen))?.id ?? null;
}

const views = new Map();
const pc = {
  root: null, bar: null, tabs: null, sub: null, stage: null, legacy: null, menu: null, foot: null,
  dest: 'home', screen: null, view: null, openedFrom: null, ring: null
};

export const pcState = pc;

export const isAway = (node) => node.classList.contains('is-away');

const parked = new WeakMap();

function setAway(node, away) {
  node.hidden = false;
  if (node.classList.contains('is-away') === away) return;
  if (away) {
    const running = node.getAnimations({ subtree: true }).filter((a) => a.playState === 'running');
    for (const a of running) a.pause();
    parked.set(node, running);
    node.classList.add('is-away');
    return;
  }
  node.classList.remove('is-away');
  for (const a of parked.get(node) ?? []) if (a.playState === 'paused') a.play();
  parked.delete(node);
}

function parkStarted(event) {
  const away = event.target.closest?.('.is-away');
  if (!away) return;
  const list = parked.get(away) ?? [];
  for (const a of event.target.getAnimations({ subtree: true })) {
    if (a.playState !== 'running') continue;
    a.pause();
    list.push(a);
  }
  parked.set(away, list);
}

export function registerView(id, view) {
  views.set(id, view);
}

const viewFor = (screen) => [...views].find(([, v]) => v.screens?.includes(screen) && (v.wants?.() ?? true))?.[0] ?? null;

function runLegacy(screen) {
  const mapped = viewFor(screen);
  if (mapped) { showView(mapped); return; }
  const item = drawerItems().find((i) => i.id === screen);
  if (item?.run) item.run();
  else if (screen === 'friends') import('../app/social.js').then((m) => { showScreen('friends'); m.renderFriends(); });
  else showScreen(screen);
}

export function goScreen(screen) {
  runLegacy(screen);
}

export function go(target) {
  if (views.has(target)) { showView(target); return; }
  const dest = ALL.find((d) => d.id === target);
  if (dest?.subs?.length) { runLegacy(dest.subs[0][0]); return; }
  runLegacy(target);
}

function enter(node) {
  if (node.classList.contains('is-entering')) node.classList.toggle('is-again');
  else node.classList.add('is-entering');
  clearTimeout(node.enterTimer);
  node.enterTimer = setTimeout(() => node.classList.remove('is-entering'), 420);
}

function showView(id) {
  const view = views.get(id);
  if (!view) return;
  closePop();
  const changed = pc.view !== id;
  pc.view = id;
  pc.screen = null;
  pc.dest = destinationOf(view.screens?.[0]) ?? id;
  for (const [key, v] of views) setAway(v.node, key !== id);
  setAway(pc.legacy, true);
  document.documentElement.classList.remove('is-immersive');
  (view.show ?? view.render)?.call(view);
  if (changed) enter(view.node);
  paintNav();
}

function onScreen(name) {
  if (name === 'open') {
    pc.openedFrom ??= pc.view ?? pc.screen;
  } else if (pc.openedFrom && (name === 'packs' || name === 'timed') && views.has(pc.openedFrom)) {
    const back = pc.openedFrom;
    pc.openedFrom = null;
    showView(back);
    return;
  } else {
    pc.openedFrom = null;
  }
  const mapped = viewFor(name);
  if (mapped) { showView(mapped); return; }
  closePop();
  const changed = pc.screen !== name || pc.view;
  pc.view = null;
  pc.screen = name;
  pc.dest = destinationOf(name) ?? pc.dest;
  for (const v of views.values()) setAway(v.node, true);
  setAway(pc.legacy, false);
  if (changed && name !== 'open') enter(pc.legacy);
  legacyShown(name);
  paintNav();
  setTimeout(paintFoot, 400);
}

const currentSub = () => {
  if (pc.view) return views.get(pc.view)?.screens?.[0] ?? null;
  if (pc.screen === 'chat' && state.chatFrom === 'discussions') return 'discussions';
  if (pc.screen === 'friend' && friendOrigin()) return friendOrigin();
  return PARENT[pc.screen] ?? pc.screen;
};

const ACCOUNT_SUBS = ['guilds', 'discussions'];

function subsOf(dest) {
  const items = drawerItems();
  return (dest?.subs ?? []).filter(([id]) => !ACCOUNT_SUBS.includes(id) || items.some((i) => i.id === id));
}

function subBadge(id) {
  const item = drawerItems().find((i) => i.id === id);
  if (!item) return null;
  const n = item.badge?.() ?? 0;
  if (n) {
    const badge = makeBadge(kindOf(item), n);
    badge.classList.add('pc-subtab-count');
    return badge;
  }
  if (item.dot?.()) return h('span.pc-subtab-dot');
  return null;
}

function paintNav() {
  for (const tab of pc.tabs.querySelectorAll('.pc-tab')) {
    const on = tab.dataset.dest === pc.dest;
    tab.classList.toggle('is-on', on);
    tab.setAttribute('aria-selected', String(on));
  }
  const dest = ALL.find((d) => d.id === pc.dest);
  const subs = subsOf(dest);
  pc.root.classList.toggle('has-sub', subs.length > 1);
  const current = currentSub();
  if (subs.length > 1) {
    fill(pc.sub,
      h('span.pc-sub-key', keycap('Q')),
      h('div.pc-sub-tabs', { role: 'tablist' }, subs.map(([id, key]) => {
        const btn = h('button.pc-subtab', { type: 'button', role: 'tab', dataset: { screen: id } }, h('span', t(key)), subBadge(id));
        const on = id === current;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-selected', String(on));
        btn.addEventListener('click', () => { if (id !== currentSub()) { synth.playNav(true); runLegacy(id); } });
        return btn;
      })),
      h('span.pc-sub-key', keycap('E')));
  } else {
    pc.sub.replaceChildren();
  }
  paintHud();
  paintFoot();
}

function paintSubBadges() {
  for (const btn of pc.sub?.querySelectorAll('.pc-subtab') ?? []) {
    const fresh = subBadge(btn.dataset.screen);
    const held = btn.querySelector('.pc-subtab-count, .pc-subtab-dot');
    if (!fresh) { held?.remove(); continue; }
    if (held?.classList.contains('nb') && fresh.classList.contains('nb')) {
      paintBadge(held, fresh.dataset.kind, Number(fresh.dataset.n));
    } else if (held) held.replaceWith(fresh);
    else btn.appendChild(fresh);
  }
}

function cycleSub(dir) {
  const subs = subsOf(ALL.find((d) => d.id === pc.dest));
  if (subs.length < 2) return false;
  const at = Math.max(0, subs.findIndex(([id]) => id === currentSub()));
  const next = subs[(at + dir + subs.length) % subs.length][0];
  synth.playNav(dir > 0);
  runLegacy(next);
  return true;
}

function tabButton(dest, index) {
  const count = h('span.pc-tab-count', { hidden: true });
  const btn = h('button.pc-tab', { type: 'button', role: 'tab', dataset: { dest: dest.id }, title: `${t(dest.key)} (${index + 1})` },
    h('span.pc-tab-icon', { html: iconSvg(dest.icon, { size: 20 }) }),
    h('span.pc-tab-label', t(dest.key)),
    count);
  btn.addEventListener('click', () => { synth.playNav(true); go(dest.id); });
  return btn;
}

function tabCounts() {
  const held = Object.values(state.inventory ?? {}).reduce((n, slot) => n + (slot?.count ?? 0), 0);
  const free = state.profile?.timed?.count ?? 0;
  const c = inboxCounts();
  const play = drawerItems().filter((i) => ['quests', 'season', 'games'].includes(i.id))
    .reduce((n, i) => n + (i.badge?.() ?? (i.dot?.() ? 1 : 0)), 0);
  const socialKind = topKind({ gift: c.trade, message: c.message, social: c.request + c.guild });
  return {
    boosters: held + free, social: c.message + c.request + c.trade + c.guild, play,
    kinds: { boosters: 'gift', social: socialKind, play: c.challenge ? 'versus' : 'system' }
  };
}

let hudSignature = '';
let shownProgress = null;

export function paintHud() {
  if (!pc.root) return;
  const held = hushing() && shownProgress;
  if (held) afterReveal(paintHud, 'pcHud');
  const progress = held ? shownProgress : (shownProgress = { ...(state.profile?.progress ?? { level: 1, xp: 0 }) });
  const level = levelOf(progress);
  const atMax = atMaxLevel(progress);
  const me = state.account?.profile ?? null;
  const counts = tabCounts();
  const unread = unreadCount();
  const kind = bellKind();
  const signature = [state.wallet, state.ink, level, progress.xp, me?.username, JSON.stringify(me?.avatar ?? null), unread, kind,
    counts.boosters, counts.social, counts.play, JSON.stringify(counts.kinds), getLanguage(), frameStyle()].join('|');
  if (signature === hudSignature) return;
  hudSignature = signature;
  pc.coins.querySelector('b').textContent = formatAmount(state.wallet ?? 0);
  pc.ink.querySelector('b').textContent = formatAmount(state.ink ?? 0);
  paintBadge(pc.bellCount, kind, unread, { cap: 9 });
  pc.plateName.textContent = me?.username ?? t('pcGuest');
  pc.plateRank.textContent = `${atMax ? t('profileMax') : t('profileLevel', { n: level })} · ${tx(rankFor(level).name)}`;
  pc.ring.set(levelFraction(progress), String(level));
  pc.ring.node.classList.toggle('is-max', atMax);
  pc.plateLevel.textContent = String(level);
  paintFrameInto(pc.plateRing, frameStyle(), frameTier(level));
  if (me) paintAvatarInto(pc.plateFace, { ...me, level }, { frame: { style: null, tier: 0 } });
  else pc.plateFace.replaceChildren(h('span.pc-plate-initial', (t('pcGuest')[0] ?? '?').toUpperCase()));
  for (const tab of pc.tabs.querySelectorAll('.pc-tab')) {
    const n = counts[tab.dataset.dest] ?? 0;
    paintBadge(tab.querySelector('.pc-tab-count'), counts.kinds[tab.dataset.dest] ?? 'system', n);
  }
  requestAnimationFrame(fitBar);
}

function buildBar() {
  pc.coins = h('button.pc-purse', { type: 'button', title: t('walletTitle') },
    h('span.pc-purse-mark', { html: buckSvg({ size: 16 }) }), h('b'));
  pc.coins.addEventListener('click', () => { synth.playTap(); runLegacy('shop'); });
  pc.ink = h('button.pc-purse.is-ink', { type: 'button', title: t('tabAtelier') },
    h('span.pc-purse-mark', { html: inkSvg({ size: 16 }) }), h('b'));
  pc.ink.addEventListener('click', () => { synth.playTap(); runLegacy('atelier'); });
  pc.bellCount = h('span.pc-icon-count', { hidden: true });
  const bell = h('button.pc-icon', { type: 'button', title: t('notifTitle'), 'aria-label': t('notifTitle') },
    h('span', { html: iconSvg('bell', { size: 20 }) }), pc.bellCount);
  bell.addEventListener('click', () => { synth.playTap(); openNotifications(); });
  const menu = h('button.pc-icon', { type: 'button', title: `${t('pcMenu')} (Esc)`, 'aria-label': t('pcMenu') },
    h('span', { html: iconSvg('menu', { size: 20 }) }));
  menu.addEventListener('click', () => { synth.playTap(); toggleMenu(); });

  pc.plateRing = h('span.pc-plate-ring');
  pc.plateFace = h('span.pc-plate-face');
  pc.plateName = h('b.pc-plate-name');
  pc.plateRank = h('span.pc-plate-rank');
  pc.plateLevel = h('span.pc-plate-level');
  const plate = h('button.pc-plate', { type: 'button', title: t('tabProfile') },
    h('span.pc-plate-avatar', pc.plateFace, pc.plateRing, pc.plateLevel),
    h('span.pc-plate-text', pc.plateName, pc.plateRank));
  plate.addEventListener('click', () => { synth.playTap(); runLegacy('profile'); });

  const brand = h('button.pc-brand', { type: 'button', title: t('pcHome') },
    h('span.pc-brand-mark', { html: logoSvg({ size: 34 }) }),
    h('span.pc-brand-word', 'Wikster'));
  brand.addEventListener('click', () => { synth.playNav(false); go('home'); });

  pc.tabs = h('nav.pc-tabs', { role: 'tablist', 'aria-label': t('pcSections') }, DESTINATIONS.map(tabButton));
  pc.bar = h('header.pc-bar', brand, pc.tabs,
    h('div.pc-hud', pc.coins, pc.ink, bell, plate, menu));
  pc.ring = new Ring(pc.plateRing, { size: 46, width: 3 });
}

const MENU_ITEMS = [
  ['resume', 'pcResume', 'chevronRight'],
  ['profile', 'tabProfile', 'profile'],
  ['customize', 'tabCustomize', 'wand'],
  ['settings', 'tabSettings', 'settings'],
  ['updates', 'tabUpdates', 'spark'],
  ['fullscreen', 'pcFullscreen', 'grid'],
  ['keys', 'pcKeys', 'keyboard']
];

function buildMenu() {
  const scale = h('input.pc-range', { type: 'range', min: '0.8', max: '1.4', step: '0.05', value: String(uiScale()), 'aria-label': t('pcUiSize') });
  const scaleValue = h('span.pc-range-value', `${Math.round(uiScale() * 100)}%`);
  scale.addEventListener('input', () => {
    setUiScale(Number(scale.value));
    scaleValue.textContent = `${Math.round(Number(scale.value) * 100)}%`;
    fitStage();
  });
  const list = h('div.pc-menu-list', MENU_ITEMS.map(([id, key, icon]) => {
    const btn = h('button.pc-menu-item', { type: 'button', dataset: { act: id } },
      h('span.pc-menu-icon', { html: iconSvg(icon, { size: 20 }) }), h('span', t(key)));
    btn.addEventListener('click', () => menuAction(id));
    return btn;
  }));
  pc.menu = h('div.pc-menu', { hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('pcMenu') },
    h('div.pc-menu-scrim'),
    h('div.pc-menu-panel',
      h('div.pc-menu-brand', { html: logoSvg({ size: 56 }) }),
      h('h2.pc-menu-title', t('pcMenu')),
      list,
      h('label.pc-menu-scale', h('span', t('pcUiSize')), scale, scaleValue),
      h('p.pc-menu-hint', keycap('Esc'), h('span', t('pcMenuHint')))));
  pc.menu.querySelector('.pc-menu-scrim').addEventListener('click', () => toggleMenu(false));
}

function menuAction(id) {
  synth.playTap();
  toggleMenu(false);
  if (id === 'resume') return;
  if (id === 'keys') { openKeys(); return; }
  if (id === 'fullscreen') {
    if (window.wiksterSteam?.desktop) { window.wiksterSteam.toggleFullscreen(); return; }
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
    return;
  }
  runLegacy(id);
}

export function toggleMenu(force) {
  const open = force ?? pc.menu.hidden;
  if (open === !pc.menu.hidden) return;
  pc.menu.hidden = !open;
  synth.playSheet(open);
  document.documentElement.classList.toggle('has-pc-menu', open);
  if (open) pc.menu.querySelector('.pc-menu-item')?.focus();
  paintFoot();
}

const KEYS = [
  ['1 - 6', 'pcKeyTabs'],
  ['Q  E', 'pcKeySubs'],
  ['Esc', 'pcKeyBack'],
  ['Space', 'pcKeyOpen'],
  ['← →', 'pcKeyBrowse'],
  ['PgUp  PgDn', 'pcKeyPages'],
  ['Ctrl F', 'pcKeyFind']
];

function openKeys() {
  import('../app/core.js').then(({ openSheet }) => openSheet(t('pcKeys'), (body) => {
    body.append(h('div.pc-keys', KEYS.map(([k, key]) => h('div.pc-key-row', h('kbd', k), h('span', t(key))))));
  }));
}

function paintFoot() {
  if (!pc.foot) return;
  const view = pc.view ? views.get(pc.view) : null;
  const prompts = [];
  if (!pc.menu.hidden) prompts.push(['Esc', t('pcResume')]);
  else {
    prompts.push(...(view?.prompts?.() ?? (pc.screen ? legacyPrompts(pc.screen) : [])));
    if (pc.root.classList.contains('has-sub')) prompts.push(['Q E', t('pcPromptTabs')]);
    if (!prompts.some(([key]) => key === 'Esc')) prompts.push(['Esc', t('pcMenu')]);
  }
  const sig = JSON.stringify(prompts);
  if (pc.foot.dataset.sig === sig) return;
  pc.foot.dataset.sig = sig;
  fill(pc.footPrompts, prompts.map(([key, label]) => h('span.pc-prompt', keycap(key), h('span', label))));
}

function paintStatus() {
  if (!pc.footStatus) return;
  const items = [];
  const timed = state.profile?.timed ?? {};
  const left = msToNext(timed);
  items.push(h('button.pc-status', { type: 'button', dataset: { to: 'timed' } },
    h('span.pc-status-icon', { html: iconSvg('hourglass', { size: 15 }) }),
    h('span', left === null ? t('pcStatusFreeFull', { n: timed.count ?? 0 }) : t('pcStatusFree', { n: timed.count ?? 0, time: formatCountdown(left) }))));
  const gift = canClaim(state.profile?.daily);
  items.push(h(`button.pc-status${gift ? '.is-hot' : ''}`, { type: 'button', dataset: { to: 'daily' } },
    h('span.pc-status-icon', { html: iconSvg('gift', { size: 15 }) }),
    h('span', gift ? t('pcGiftReady') : t('pcStatusGift', { time: formatCountdown(msUntilNextUtcDay()) }))));
  fill(pc.footStatus, items);
}

const PLAYING = new Set(['wikdle', 'chat']);

const typing = (target) => target instanceof HTMLElement
  && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|WK-SELECT)$/.test(target.tagName));

function onKey(event) {
  if (popOpen()) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && views.get(pc.view)?.find && pc.menu.hidden && !live.sheet?.open) {
    views.get(pc.view).find();
    event.preventDefault();
    return;
  }
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (live.sheet?.open && el.sheet?.classList.contains('is-locked') && (event.key === 'Enter' || event.key === ' ')
    && !(event.target instanceof HTMLElement && event.target.closest('#sheet button, #sheet a, #sheet [tabindex]'))) {
    const primary = el.sheet.querySelector('.btn-primary:not([disabled])');
    if (primary) { primary.click(); event.preventDefault(); event.stopImmediatePropagation(); }
    return;
  }
  if (live.sheet?.open || !el.drawer?.hidden) return;
  if (document.documentElement.classList.contains('is-immersive')) {
    if (typing(event.target)) return;
    if (openingKey(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
    return;
  }
  if (event.key === 'Escape') {
    if (typing(event.target)) {
      if (!event.target.classList.contains('pcx-search-input')) { event.target.blur(); event.preventDefault(); }
      return;
    }
    if (pc.menu.hidden && views.get(pc.view)?.back?.()) { event.preventDefault(); return; }
    toggleMenu(pc.menu.hidden);
    event.preventDefault();
    return;
  }
  if (typing(event.target) || !pc.menu.hidden || PLAYING.has(pc.screen)) return;
  const n = Number(event.key);
  if (Number.isInteger(n) && n >= 1 && n <= DESTINATIONS.length && event.code?.startsWith('Digit') && !GAME_SCREENS.has(pc.screen)) {
    synth.playNav(true);
    go(DESTINATIONS[n - 1].id);
    event.preventDefault();
    return;
  }
  const lower = event.key.toLowerCase();
  if ((lower === 'q' || lower === 'e') && !event.repeat) {
    if (cycleSub(lower === 'e' ? 1 : -1)) { event.preventDefault(); return; }
  }
  if (pc.view) views.get(pc.view)?.key?.(event);
  else if (pc.screen && legacyKey(pc.screen, event)) event.preventDefault();
}

const CANVAS = [['pc-w-118', 'w', 118], ['pc-w-100', 'w', 100], ['pc-w-92', 'w', 92], ['pc-h-60', 'h', 60], ['pc-h-54', 'h', 54]];

export function fitStage() {
  const s = Math.max(0.62, Math.min(innerWidth / 1920, innerHeight / 1080) * uiScale());
  const root = document.documentElement;
  root.style.setProperty('--pc-s', String(s));
  const size = { w: innerWidth / (16 * s), h: innerHeight / (16 * s) };
  for (const [name, axis, limit] of CANVAS) root.classList.toggle(name, size[axis] < limit);
  fitBar();
}

const BAR_STEPS = 4;

function barCrowded() {
  const brand = pc.bar.querySelector('.pc-brand').getBoundingClientRect();
  const tabs = pc.tabs.getBoundingClientRect();
  const hud = pc.bar.querySelector('.pc-hud').getBoundingClientRect();
  const first = pc.tabs.firstElementChild?.getBoundingClientRect();
  const last = pc.tabs.lastElementChild?.getBoundingClientRect();
  if (!first || !last) return false;
  const gap = 8;
  return pc.tabs.scrollWidth > pc.tabs.clientWidth + 1
    || first.left < brand.right + gap || last.right > hud.left - gap
    || tabs.left < brand.right || hud.right > innerWidth;
}

function fitBar() {
  if (!pc.bar) return;
  for (let i = 1; i <= BAR_STEPS; i++) pc.bar.classList.remove(`is-fit-${i}`);
  for (let i = 1; i <= BAR_STEPS && barCrowded(); i++) pc.bar.classList.add(`is-fit-${i}`);
}

export function refreshPrompts() { paintFoot(); }

export function mountPc() {
  if (pc.root) return pc;
  applyScale();
  fitStage();
  addEventListener('resize', fitStage);
  buildBar();
  buildMenu();
  pc.sub = h('nav.pc-sub', { 'aria-label': t('pcSections') });
  pc.legacy = h('div.pc-legacy');
  pc.stage = h('div.pc-stage', pc.legacy);
  pc.footStatus = h('div.pc-foot-status');
  pc.footPrompts = h('div.pc-foot-prompts');
  pc.foot = h('footer.pc-foot', pc.footStatus, pc.footPrompts);
  pc.footStatus.addEventListener('click', (event) => {
    const to = event.target.closest('[data-to]')?.dataset.to;
    if (!to) return;
    synth.playTap();
    runLegacy(to);
  });
  pc.root = h('div#pc.pc', pc.bar, pc.sub, pc.stage, pc.foot, pc.menu);
  pc.stage.addEventListener('animationstart', parkStarted);
  const app = document.getElementById('app');
  document.body.insertBefore(pc.root, app);
  pc.legacy.appendChild(app);
  adaptLegacy();
  for (const [id, view] of views) {
    setAway(view.node, true);
    view.node.dataset.view = id;
    pc.stage.insertBefore(view.node, pc.legacy);
  }
  mountOpening();
  watchSheet();
  fitStage();
  new ResizeObserver(() => fitBar()).observe(pc.bar.querySelector('.pc-hud'));
  document.fonts?.ready?.then(fitBar);
  globalThis.wiksterPc = { go, screen: runLegacy };
  on('screen', onScreen);
  on('wallet', paintHud);
  on('inbox', () => { paintHud(); paintSubBadges(); });
  on('bell', paintHud);
  setInterval(() => { paintHud(); paintStatus(); }, 1000);
  paintStatus();
  document.addEventListener('keydown', onKey, { capture: true });
  setAway(pc.legacy, true);
  if (views.has('home')) showView('home');
  paintNav();
  return pc;
}
