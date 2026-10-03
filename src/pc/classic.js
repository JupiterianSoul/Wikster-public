import { t } from '../i18n.js';
import { buildAlbums } from '../albums.js';
import * as store from '../collection.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { state } from '../app/core.js';
import { live } from '../app/live.js';
import { albumGroups, albumSection, builtInView, classicCard, pickActions, simpleTile } from '../app/binder.js';
import { Picker, Progressive, pickBar } from '../app/cardgrid.js';
import { forgetCards } from '../app/detail.js';
import { isAway, refreshPrompts, registerView } from './shell.js';
import { button, dropdown, empty, fitRow, keeper, searchField, segmented } from './kit.js';
import { rarityGems } from './collection.js';

const MODES = [['albums', 'pcClassicByAlbum', 'book'], ['all', 'viewAllCards', 'grid'], ['simple', 'simpleMode', 'check']];
const MODE_KEY = 'wikster.pcClassicMode.v1';

const view = {
  node: h('section.pc-view.pccl'),
  mode: (() => { try { return localStorage.getItem(MODE_KEY) || 'albums'; } catch { return 'albums'; } })(),
  stage: null,
  grid: null,
  prog: null,
  picker: null,
  bar: null,
  shown: [],
  tools: null,
  search: null,
  count: null,
  context: '',
  timer: null,
  focus: -1
};

function setFilter(key, value) {
  state.filters = { ...state.filters, [key]: value };
  synth.playTap();
  paint();
}

function paintTools() {
  const entries = store.allEntries(state.collection);
  const f = state.filters;
  view.search ??= searchField({
    value: f.search ?? '',
    placeholder: t('searchTitles'),
    hotkey: 'Ctrl F',
    onInput: (value) => { state.filters = { ...state.filters, search: value }; paintGrid(); }
  });
  const picking = Boolean(view.picker?.active);
  fill(view.tools,
    view.search,
    segmented(MODES.map(([value, key, icon]) => ({ value, label: t(key), icon })), view.mode, (value) => {
      view.mode = value;
      try { localStorage.setItem(MODE_KEY, value); } catch {}
      synth.playTap();
      paint();
    }, { name: t('pcClassic') }),
    dropdown(store.SORTS.map((s) => ({ value: s.id, label: store.sortLabel(s) })), f.sort ?? 'rarity', (value) => setFilter('sort', value), { label: t('pcSortBy') }),
    rarityGems(entries, (key, value) => setFilter(key, value)),
    button(picking ? t('pickDone') : t('pickStart'), { icon: picking ? 'close' : 'check', key: 'X', onClick: togglePick }),
    view.count);
}

function togglePick() {
  synth.playTap();
  if (view.picker.active) view.picker.exit();
  else view.picker.enter();
}

function make(entry) {
  const node = view.mode === 'simple' ? simpleTile(entry) : classicCard(entry);
  node.tabIndex = -1;
  return view.picker.mark(node, entry.key);
}

function paintGrid() {
  const entries = store.allEntries(state.collection);
  const albums = buildAlbums(entries, state.customPacks);
  const shown = store.filterEntries(entries, state.filters);
  view.shown = shown.map((e) => e.key);
  view.count.textContent = t('pcShowing', { n: shown.length.toLocaleString(), total: entries.length.toLocaleString() });
  const context = `${view.mode}|${JSON.stringify(state.filters)}`;
  const fresh = context !== view.context;
  const stamp = `${store.collectionStamp()}|${(state.customPacks ?? []).length}|${state.collection === view.collection}`;
  if (!fresh && stamp === view.stamp && view.grid.childElementCount) return;
  view.stamp = stamp;
  view.collection = state.collection;
  view.context = context;
  if (!shown.length) {
    view.prog.stop();
    fill(view.grid, entries.length ? empty('search', t('noMatches'), t('pcNoMatchesNote')) : empty('collection', t('emptyCollection'), t('pcNoCardsNote')));
    return;
  }
  const simple = view.mode === 'simple';
  view.grid.classList.toggle('is-simple', simple);
  const groups = view.mode === 'albums' ? albumGroups(shown, albums) : [{ head: null, items: shown }];
  view.prog.set(groups, {
    make,
    first: fresh ? 0 : builtInView(view.grid),
    section: (group) => {
      const grid = h(simple ? 'div.simple-grid' : 'div.classic-grid');
      if (!group.head) return { node: grid, grid };
      const section = albumSection(group.head, group.items.length);
      section.appendChild(grid);
      return { node: section, grid };
    }
  });
  if (fresh) { view.stage.scrollTop = 0; view.focus = -1; }
}

function paint() {
  paintTools();
  paintGrid();
  refreshPrompts();
  keep.mark();
}

function render() {
  if (!view.prog) {
    view.tools = h('header.pck-tools');
    fitRow(view.tools);
    view.count = h('span.pck-count.pccl-count');
    view.grid = h('div.classic-view.pccl-grid');
    view.stage = h('div.pccl-stage', view.grid);
    view.prog = new Progressive(view.grid, { chunk: 18, start: 24, margin: 700, idle: 120, release: forgetCards });
    view.prog.root = view.stage;
    view.picker = new Picker(view.grid, { onChange: () => { view.bar.paint(); paintTools(); refreshPrompts(); } });
    view.bar = pickBar({ picker: view.picker, all: () => view.shown, actions: (keys) => pickActions(keys, () => {
      const gone = [...view.picker.keys].filter((k) => !state.collection.entries[k]);
      if (gone.length) view.picker.replace([...view.picker.keys].filter((k) => state.collection.entries[k]));
      view.context = '';
      paint();
    }), className: 'is-pc' });
    fill(view.node, view.tools, view.stage, view.bar.node);
  }
  paint();
}

function cells() {
  return [...view.grid.querySelectorAll('[data-key]')];
}

function moveFocus(dir) {
  const list = cells();
  if (!list.length) return;
  let at = list.indexOf(document.activeElement);
  if (at < 0) at = Math.max(0, Math.min(view.focus, list.length - 1));
  let next = at;
  if (dir === 'left') next = at - 1;
  else if (dir === 'right') next = at + 1;
  else {
    const here = list[at].getBoundingClientRect();
    const step = dir === 'down' ? 1 : -1;
    for (let i = at + step; i >= 0 && i < list.length; i += step) {
      const box = list[i].getBoundingClientRect();
      if ((step > 0 ? box.top > here.top + 4 : box.top < here.top - 4) && Math.abs(box.left - here.left) < here.width / 2) { next = i; break; }
      if (Math.abs(box.top - here.top) > here.height * 2.5) { next = i; break; }
    }
  }
  next = Math.max(0, Math.min(list.length - 1, next));
  if (next >= list.length - 12) view.prog.more();
  view.focus = next;
  const node = cells()[next];
  node.focus({ preventScroll: true });
  node.scrollIntoView({ block: 'nearest' });
}

let signature = '';
const currentSignature = () => {
  const entries = state.collection?.entries ?? {};
  let copies = 0;
  let favs = 0;
  for (const e of Object.values(entries)) { copies += e.count ?? 1; if (e.favorite) favs++; }
  return `${Object.keys(entries).length}|${copies}|${favs}`;
};

const keep = keeper(() => `${currentSignature()}|${store.collectionStamp()}|${(state.customPacks ?? []).length}|${JSON.stringify(state.filters)}|${view.mode}`);

function tick() {
  clearInterval(view.timer);
  view.timer = setInterval(() => {
    if (isAway(view.node) || live.sheet?.open) return;
    const now = currentSignature();
    if (now === signature) return;
    signature = now;
    paint();
  }, 1200);
}

registerView('classic', {
  node: view.node,
  screens: ['classic'],
  render() {
    signature = currentSignature();
    render();
    tick();
  },
  show() {
    if (!keep.fresh()) { this.render(); return; }
    tick();
  },
  back() {
    if (!view.picker?.active) return false;
    view.picker.exit();
    return true;
  },
  find() { view.search?.input.focus(); view.search?.input.select(); },
  key(event) {
    if (event.target?.matches?.('input, textarea, select')) return;
    const arrows = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (arrows[event.key]) { moveFocus(arrows[event.key]); event.preventDefault(); return; }
    if (event.key === '/') { this.find(); event.preventDefault(); return; }
    if (event.key === 'x' || event.key === 'X') { togglePick(); event.preventDefault(); return; }
    const node = document.activeElement?.closest?.('[data-key]');
    if ((event.key === 'Enter' || event.key === ' ') && node && view.grid.contains(node)) {
      if (view.picker.active) view.picker.toggle(node.dataset.key);
      else node.click();
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && view.picker.active) {
      view.picker.replace(view.shown);
      event.preventDefault();
    }
  },
  prompts: () => (view.picker?.active
    ? [['Enter', t('pcPromptToggle')], ['Ctrl A', t('pickAll')], ['Esc', t('pickDone')]]
    : [['← ↑ → ↓', t('pcPromptMove')], ['X', t('pickStart')], ['Ctrl F', t('pcPromptSearch')]])
});

