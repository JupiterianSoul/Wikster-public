import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { rarityById, rarityRank, rarityText } from '../data/rarities.js';
import { oddsRows } from '../data/odds.js';
import { specColours, specId, specName, specTagline } from '../booster.js';
import * as store from '../collection.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { state } from '../app/core.js';
import { buildBooster } from '../app/packs.js';
import { batchFor, openScreenFor, schedulePrefetch } from '../app/open.js';
import { live } from '../app/live.js';
import { go, goScreen, isAway, registerView } from './shell.js';
import { Pager, button, dropdown, empty, fitGrid, fitPanel, heading, keeper, observeSize, pageKeys, rem, segmented, wheelPager } from './kit.js';

const FILTERS = [
  ['all', 'pcAllBoosters', 'packs'],
  ['subjects', 'pcSubjects', 'globe'],
  ['tiers', 'pcTiers', 'gem'],
  ['special', 'pcSpecial', 'star']
];

const SORTS = [['name', 'pcSortName'], ['count', 'pcSortHeld'], ['tier', 'pcSortTier']];

const kindOf = (spec) => {
  if (spec.kind === 'code' || spec.kind === 'today' || spec.kind === 'timed' || String(spec.themeId ?? '').startsWith('season-')) return 'special';
  if (spec.rarityId) return 'tiers';
  return 'subjects';
};

export function boosterTile(slot, { on = false, onClick, onOpen } = {}) {
  const btn = h('button.pcb-tile', { type: 'button', title: specName(slot.spec), 'aria-pressed': String(on), dataset: { id: specId(slot.spec) } },
    h('span.pcb-tile-art', buildBooster(slot.spec, { size: 'is-pc-tile' })),
    h('span.pcb-tile-name', specName(slot.spec)),
    h('span.pcb-tile-count', `×${slot.count}`));
  btn.classList.toggle('is-on', on);
  btn.style.setProperty('--tile-accent', specColours(slot.spec).accent);
  btn.addEventListener('click', () => onClick?.());
  btn.addEventListener('dblclick', () => onOpen?.());
  return btn;
}

export function oddsBlock(spec) {
  if (spec.kind === 'today' || spec.kind === 'code') return null;
  const rows = oddsRows(spec.rarityId ?? null, spec).filter((r) => r.pct > 0);
  const top = Math.max(...rows.map((r) => r.pct));
  return h('div.pcx-odds',
    heading(t('pullRates')),
    rows.map(({ rarity, pct }) => h('div.pcx-odds-row', { style: { '--rarity': rarity.color, '--rarity-text': rarityText(rarity) } },
      h('span.pcx-odds-name', tx(rarity.name)),
      h('span.pcx-odds-bar', h('i', { style: { width: `${Math.max(2, (pct / top) * 100)}%` } })),
      h('span.pcx-odds-pct', pct >= 0.1 ? `${Math.round(pct * 100) / 100}%` : '< 0.1%'))));
}

export function boosterDetail(slot, { note = null, actions = null } = {}) {
  if (!slot) {
    return h('aside.pcb-detail.pcx-panel.is-empty',
      h('span.pcx-empty-mark', { html: iconSvg('packs', { size: 44 }) }),
      h('p', t('pcPickBooster')));
  }
  const colours = specColours(slot.spec);
  schedulePrefetch(slot.spec);
  const art = buildBooster(slot.spec, { size: 'is-pc-detail' });
  art.addEventListener('click', () => { synth.resume(); openScreenFor(slot.spec); });
  const tier = slot.spec.rarityId ? rarityById(slot.spec.rarityId) : null;
  const odds = oddsBlock(slot.spec);
  const tag = specTagline(slot.spec) ? h('p.pcb-detail-tag', specTagline(slot.spec)) : null;
  const panel = h('aside.pcb-detail.pcx-panel', { style: { '--spot': colours.accent, '--spot-2': colours.accent2 ?? colours.accent } },
    h('div.pcb-detail-stage', art),
    h('h2.pcb-detail-name', specName(slot.spec)),
    tag,
    note ? h('p.pcb-detail-note', note) : null,
    h('div.pch-chips',
      h('span.pcx-chip', slot.count > 1 ? t('pcHeldMany', { n: slot.count }) : t('pcHeldOne')),
      h('span.pcx-chip', t('pcCards', { n: slot.spec.cards })),
      tier ? h('span.pcx-chip.is-tier', { style: { '--rarity': tier.color, '--rarity-text': rarityText(tier) } }, t('pcGuarantee', { tier: tx(tier.name) })) : null),
    h('div.pcb-detail-actions',
      button(t('openPack'), { kind: 'primary', size: 'big', icon: 'packs', key: t('pcSpace'), onClick: () => { synth.resume(); openScreenFor(slot.spec); } }),
      !slot.free && batchFor(slot.spec) ? button(t('openAllN', { n: batchFor(slot.spec) }), { size: 'big', icon: 'collection', onClick: () => { synth.resume(); openScreenFor(slot.spec, { batch: true }); } }) : null,
      actions),
    odds);
  fitPanel(panel, { media: panel.querySelector('.pcb-detail-stage'), max: 17.5, min: 9, drops: [odds, tag] });
  return panel;
}

export class BoosterGrid {
  constructor({ onPick, onOpen, empty: makeEmpty }) {
    this.slots = [];
    this.pick = null;
    this.onPick = onPick;
    this.onOpen = onOpen;
    this.makeEmpty = makeEmpty;
    this.grid = h('div.pcb-grid');
    this.pager = new Pager({ onChange: () => this.paint() });
    this.box = null;
    this.layout = { cols: 4, rows: 2, w: 160 };
    this.node = h('div.pcb-grid-wrap', this.grid);
    wheelPager(this.grid, this.pager);
    observeSize(this.node, (box) => { this.box = box; this.measure(); this.set(this.slots, this.pick); });
  }

  measure() {
    if (!this.box) return;
    const unit = rem();
    this.layout = fitGrid(this.box, { aspect: 1.2, extra: 3.4 * unit, gap: 1.1 * unit, minW: 8.5 * unit, maxW: 12.5 * unit, target: 11 * unit, maxRows: 4 });
  }

  get perPage() { return Math.max(1, this.layout.cols * this.layout.rows); }

  set(slots, pick) {
    this.slots = slots;
    this.pick = pick;
    const at = slots.findIndex((s) => specId(s.spec) === pick);
    this.pager.set(at >= 0 ? Math.floor(at / this.perPage) : this.pager.page, Math.ceil(slots.length / this.perPage));
    this.paint();
  }

  paint() {
    const { cols, w } = this.layout;
    this.grid.style.setProperty('--cols', String(cols));
    this.grid.style.setProperty('--tile-w', `${w}px`);
    if (!this.slots.length) { fill(this.grid, this.makeEmpty?.()); this.grid.classList.add('is-empty'); return; }
    this.grid.classList.remove('is-empty');
    const pages = Math.ceil(this.slots.length / this.perPage);
    if (this.pager.pages !== pages || this.pager.page >= pages) this.pager.set(Math.min(this.pager.page, pages - 1), pages);
    const start = this.pager.page * this.perPage;
    fill(this.grid, this.slots.slice(start, start + this.perPage).map((slot) => boosterTile(slot, {
      on: specId(slot.spec) === this.pick,
      onClick: () => this.onPick(slot),
      onOpen: () => this.onOpen(slot)
    })));
  }

  move(event) {
    if (!this.slots.length) return false;
    if (pageKeys(event, this.pager)) return true;
    const at = Math.max(0, this.slots.findIndex((s) => specId(s.spec) === this.pick));
    const cols = this.layout.cols;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[event.key];
    if (!step) return false;
    const next = Math.max(0, Math.min(this.slots.length - 1, at + step));
    if (next === at) return true;
    this.onPick(this.slots[next]);
    return true;
  }
}

const view = { node: h('section.pc-view.pcb'), filter: 'all', sort: 'name', pick: null, timer: null, grid: null, side: null, count: null };

function slots() {
  const all = store.ownedBoosters(state.inventory)
    .filter((slot) => slot.spec.kind !== 'custom')
    .map((slot) => ({ ...slot, id: specId(slot.spec), group: kindOf(slot.spec) }));
  const tierRank = (s) => (s.spec.rarityId ? rarityRank(s.spec.rarityId) : -1);
  const sorters = {
    name: (a, b) => specName(a.spec).localeCompare(specName(b.spec)),
    count: (a, b) => b.count - a.count || specName(a.spec).localeCompare(specName(b.spec)),
    tier: (a, b) => tierRank(b) - tierRank(a) || specName(a.spec).localeCompare(specName(b.spec))
  };
  return all.sort(sorters[view.sort] ?? sorters.name);
}

const shown = () => slots().filter((s) => view.filter === 'all' || s.group === view.filter);

function pickSlot(slot, sound = true) {
  if (!slot) return;
  if (sound) synth.playTap();
  view.pick = slot.id ?? specId(slot.spec);
  view.grid.set(shown(), view.pick);
  paintSide();
}

function paintSide() {
  const slot = shown().find((s) => s.id === view.pick) ?? null;
  const next = boosterDetail(slot);
  view.side.replaceWith(next);
  view.side = next;
}

function render() {
  const all = slots();
  const list = all.filter((s) => view.filter === 'all' || s.group === view.filter);
  if (!list.some((s) => s.id === view.pick)) view.pick = list[0]?.id ?? null;
  const count = (id) => all.filter((s) => id === 'all' || s.group === id).reduce((n, s) => n + s.count, 0);
  view.grid ??= new BoosterGrid({
    onPick: (slot) => pickSlot(slot),
    onOpen: (slot) => { synth.resume(); openScreenFor(slot.spec); },
    empty: () => empty('packs', t('pcNoBoosters'), t('pcNoBoostersNote'),
      button(t('goShop'), { kind: 'primary', icon: 'gem', onClick: () => go('shop') }),
      button(t('tabTimed'), { icon: 'hourglass', onClick: () => goScreen('timed') }))
  });
  view.side = h('aside.pcb-detail');
  fill(view.node,
    h('main.pcb-main',
      h('header.pcb-bar',
        segmented(FILTERS.map(([value, key, icon]) => ({ value, label: t(key), icon, count: count(value) })), view.filter,
          (value) => { view.filter = value; view.pick = null; render(); }, { name: t('pcFilter') }),
        dropdown(SORTS.map(([value, key]) => ({ value, label: t(key) })), view.sort,
          (value) => { view.sort = value; render(); }, { label: t('pcSortBy') })),
      view.grid.node,
      view.grid.pager.node),
    view.side);
  view.grid.set(list, view.pick);
  paintSide();
  keep.mark();
}

let signature = '';
const currentSignature = () => JSON.stringify(Object.entries(state.inventory ?? {}).map(([id, s]) => `${id}:${s?.count}`));
const keep = keeper(currentSignature);

function tick() {
  clearInterval(view.timer);
  view.timer = setInterval(refresh, 1000);
}

function refresh() {
  if (isAway(view.node) || live.sheet?.open) return;
  const now = currentSignature();
  if (now !== signature) { signature = now; render(); }
}

registerView('boosters', {
  node: view.node,
  screens: ['packs'],
  render() {
    signature = currentSignature();
    render();
    tick();
  },
  show() {
    if (!keep.fresh()) { this.render(); return; }
    const slot = shown().find((s) => s.id === view.pick);
    if (slot) schedulePrefetch(slot.spec);
    tick();
  },
  key(event) {
    if (view.grid?.move(event)) { event.preventDefault(); return; }
    if (event.key === ' ' || (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement))) {
      const slot = shown().find((s) => s.id === view.pick);
      if (slot) { synth.resume(); openScreenFor(slot.spec); }
      event.preventDefault();
    }
  },
  prompts: () => [['←  →  ↑  ↓', t('pcPromptPick')], ['PgUp  PgDn', t('pcPromptPage')], [t('pcSpace'), t('openPack')]]
});
