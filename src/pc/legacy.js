import { t } from '../i18n.js';
import { gameKey, gamePrompts } from './gamekeys.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { Pager, pageKeys, wheelPager } from './kit.js';

const GROUPED = ['season', 'profile', 'friends', 'friend', 'guilds', 'settings', 'customize', 'atelier', 'badges', 'ach', 'market', 'cardindex', 'glossary', 'updates', 'leaderboard', 'quests', 'games', 'quiz'];

const TABBED = {
  settings: { side: false },
  customize: { side: true },
  atelier: { side: true },
  season: { side: true },
  profile: { side: true },
  friend: { side: false }
};

const PAGED = {
  ach: ['#ach-list'],
  badges: ['#badges-all'],
  glossary: ['#glossary-list'],
  cardindex: ['#index-list'],
  market: ['#market-list'],
  updates: ['#updates-list'],
  atelier: ['#atelier-frames', '#atelier-themes', '#atelier-fx', '#atelier-looks', '#atelier-openings'],
  customize: ['#frame-styles', '#theme-grid', '#fx-tiers', '#look-picks', '#opening-picks'],
  season: ['#season-track', '#season-calendar'],
  settings: ['#settings-list']
};

const TAB_KEY = 'wikster.pcTabs.v1';
const tabs = new Map();
const pagers = new Map();
let remembered = {};
try { remembered = JSON.parse(localStorage.getItem(TAB_KEY) ?? '{}') ?? {}; } catch {}

function groupScreen(screen) {
  if (!screen || screen.dataset.pcGrouped) return;
  screen.dataset.pcGrouped = '1';
  const kids = [...screen.children];
  let group = null;
  let n = 0;
  const lead = document.createElement('div');
  lead.className = 'pc-group is-lead';
  for (const kid of kids) {
    if (kid.classList.contains('screen-head')) continue;
    if (kid.classList.contains('section-head')) {
      group = document.createElement('div');
      group.className = 'pc-group';
      group.dataset.group = String(++n);
      const label = kid.querySelector('.label[id]');
      if (label) group.dataset.label = label.id;
      kid.before(group);
      group.appendChild(kid);
      continue;
    }
    if (group) group.appendChild(kid);
    else lead.appendChild(kid);
  }
  if (lead.children.length) {
    const head = screen.querySelector(':scope > .screen-head');
    if (head) head.after(lead);
    else screen.prepend(lead);
  }
  screen.classList.add('pc-grouped');
}

const groupsOf = (screen) => [...screen.querySelectorAll(':scope > .pc-group:not(.is-lead), :scope > .pc-side > .pc-group:not(.is-lead)')];

function labelOf(group) {
  return group.querySelector('.section-head .label')?.textContent?.trim() || `${group.dataset.group}`;
}

function paintTabs(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const groups = groupsOf(tab.screen).filter((g) => !g.querySelector(':scope > .section-head')?.hidden);
  if (!groups.length) return;
  if (!groups.some((g) => g.dataset.group === tab.active)) tab.active = groups[0].dataset.group;
  for (const g of groupsOf(tab.screen)) g.classList.toggle('is-shown', g.dataset.group === tab.active);
  const sig = groups.map((g) => `${g.dataset.group}:${labelOf(g)}`).join('|') + `#${tab.active}`;
  if (tab.nav.dataset.sig === sig) return;
  tab.nav.dataset.sig = sig;
  fill(tab.nav, groups.map((g) => {
    const btn = h('button.pc-section-link', { type: 'button', dataset: { group: g.dataset.group } },
      h('span.pc-section-mark'),
      h('span', labelOf(g)));
    btn.classList.toggle('is-on', g.dataset.group === tab.active);
    btn.addEventListener('click', () => selectTab(id, g.dataset.group));
    return btn;
  }));
}

function selectTab(id, group, sound = true) {
  const tab = tabs.get(id);
  if (!tab || tab.active === group) return;
  if (sound) synth.playNav(true);
  tab.active = group;
  remembered[id] = group;
  try { localStorage.setItem(TAB_KEY, JSON.stringify(remembered)); } catch {}
  paintTabs(id);
  tab.screen.closest('#app')?.scrollTo?.({ top: 0 });
  const shown = tab.screen.querySelector('.pc-group.is-shown');
  if (shown) { shown.classList.remove('is-entering'); void shown.offsetWidth; shown.classList.add('is-entering'); }
  for (const pager of pagers.get(id) ?? []) pager.apply();
}

function tabScreen(id, { side }) {
  const screen = document.getElementById(`screen-${id}`);
  if (!screen || tabs.has(id)) return;
  const nav = h('nav.pc-sections', { 'aria-label': t('pcSections') });
  const aside = h('aside.pc-side', nav);
  const lead = screen.querySelector(':scope > .pc-group.is-lead');
  if (side && lead) aside.appendChild(lead);
  const head = screen.querySelector(':scope > .screen-head');
  if (head) head.after(aside);
  else screen.prepend(aside);
  screen.classList.add('pc-tabbed');
  if (!side || !lead) screen.classList.add('is-lean');
  tabs.set(id, { screen, nav, active: remembered[id] ?? null });
  new MutationObserver(() => paintTabs(id)).observe(screen, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  paintTabs(id);
}

class ChildPager {
  constructor(list) {
    this.list = list;
    this.pager = new Pager({ onChange: () => this.apply(false) });
    this.pager.node.classList.add('pc-list-pager');
    list.after(this.pager.node);
    list.classList.add('pc-paged');
    wheelPager(list, this.pager);
    this.observer = new MutationObserver(() => { if (!this.busy) this.apply(true); });
    this.observer.observe(list, { childList: true });
    new ResizeObserver(() => this.apply(false)).observe(list.parentElement ?? list);
  }

  items() {
    return [...this.list.children].filter((n) => !n.hidden);
  }

  perPage() {
    const items = this.items();
    const box = this.list.getBoundingClientRect();
    if (!items.length || !box.width) return items.length || 1;
    const probe = items.find((n) => !n.classList.contains('pc-paged-out')) ?? items[0];
    const was = probe.classList.contains('pc-paged-out');
    probe.classList.remove('pc-paged-out');
    const one = probe.getBoundingClientRect();
    if (was) probe.classList.add('pc-paged-out');
    if (!one.width || !one.height) return items.length;
    const style = getComputedStyle(this.list);
    const gapX = parseFloat(style.columnGap) || 0;
    const gapY = parseFloat(style.rowGap) || 0;
    const room = this.list.parentElement?.getBoundingClientRect();
    const height = Math.max(one.height, (this.list.dataset.fill === 'true' && room ? room.bottom : window.innerHeight) - box.top - this.reserve());
    const cols = Math.max(1, Math.floor((box.width + gapX + 1) / (one.width + gapX)));
    const rows = Math.max(1, Math.floor((height + gapY) / (one.height + gapY)));
    return cols * rows;
  }

  reserve() {
    const rem = (Number(document.documentElement.style.getPropertyValue('--pc-s')) || 1) * 16;
    return rem * 7.2;
  }

  apply(reset) {
    if (!this.list.isConnected || !this.list.offsetParent) return;
    this.busy = true;
    const items = this.items();
    for (const n of items) n.classList.remove('pc-paged-out');
    const per = this.perPage();
    const pages = Math.max(1, Math.ceil(items.length / per));
    this.pager.set(reset ? 0 : Math.min(this.pager.page, pages - 1), pages);
    const start = this.pager.page * per;
    items.forEach((n, i) => n.classList.toggle('pc-paged-out', i < start || i >= start + per));
    this.busy = false;
  }
}

function pageScreen(id, selectors) {
  const screen = document.getElementById(`screen-${id}`);
  if (!screen || pagers.has(id)) return;
  const list = selectors.map((sel) => screen.querySelector(sel)).filter(Boolean).map((node) => new ChildPager(node));
  pagers.set(id, list);
}

export function adaptLegacy() {
  for (const id of GROUPED) groupScreen(document.getElementById(`screen-${id}`));
  for (const [id, opts] of Object.entries(TABBED)) tabScreen(id, opts);
  for (const [id, selectors] of Object.entries(PAGED)) pageScreen(id, selectors);
}

export function legacySelect(id, labelId) {
  const tab = tabs.get(id);
  if (!tab) return false;
  const group = groupsOf(tab.screen).find((g) => g.dataset.label === labelId);
  if (!group) return false;
  selectTab(id, group.dataset.group, false);
  return true;
}

export function legacyShown(id) {
  paintTabs(id);
  requestAnimationFrame(() => { for (const pager of pagers.get(id) ?? []) pager.apply(false); });
}

export function legacyKey(id, event) {
  if (gameKey(id, event)) return true;
  const tab = tabs.get(id);
  if (tab && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.target.closest?.('input, textarea, select, wk-select')) {
    const groups = groupsOf(tab.screen).filter((g) => !g.querySelector(':scope > .section-head')?.hidden);
    const at = groups.findIndex((g) => g.dataset.group === tab.active);
    const next = groups[at + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) selectTab(id, next.dataset.group);
    return true;
  }
  const visible = (pagers.get(id) ?? []).find((p) => p.list.offsetParent);
  if (visible) {
    if (pageKeys(event, visible.pager)) return true;
    if (event.key === 'ArrowRight' && !event.target.closest?.('input, textarea')) { visible.pager.go(visible.pager.page + 1, true); return true; }
    if (event.key === 'ArrowLeft' && !event.target.closest?.('input, textarea')) { visible.pager.go(visible.pager.page - 1, true); return true; }
  }
  return false;
}

export function legacyPrompts(id) {
  const out = gamePrompts(id);
  if (tabs.has(id)) out.push(['↑  ↓', t('pcPromptSection')]);
  if ((pagers.get(id) ?? []).some((p) => p.list.offsetParent && p.pager.pages > 1)) out.push(['←  →', t('pcPromptPage')]);
  return out;
}

