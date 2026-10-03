import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { emblemSvg, monogramSvg } from '../data/emblems.js';
import { ALBUM_TIERS, COMPLETE_TIER, albumHasTiers, albumTierNeed, albumTiersReached, buildAlbums } from '../albums.js';
import * as store from '../collection.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { state } from '../app/core.js';
import { live } from '../app/live.js';
import { isAway, refreshPrompts, registerView } from './shell.js';
import { Book } from './book.js';
import { bookCard } from './collection.js';
import { Pager, button, dropdown, empty, fitGrid, fitRow, keeper, meter, observeSize, pageKeys, rem, searchField, segmented, wheelPager } from './kit.js';

const KINDS = [['all', 'pcAllAlbums', 'book'], ['theme', 'pcSubjects', 'globe'], ['custom', 'tabCustom', 'wand'], ['special', 'pcSpecial', 'star']];
const SORTS = [['progress', 'pcSortProgress'], ['owned', 'pcSortOwned'], ['name', 'pcSortName']];

const view = {
  node: h('section.pc-view.pca'),
  kind: 'all',
  sort: 'owned',
  search: '',
  open: null,
  grid: h('div.pca-grid'),
  pager: null,
  box: null,
  book: null,
  searchField: null,
  timer: null
};

const kindOf = (album) => (album.kind === 'theme' ? 'theme' : album.kind === 'custom' ? 'custom' : 'special');

function nextTier(album) {
  if (!albumHasTiers(album)) return null;
  const reached = albumTiersReached(album);
  const tier = ALBUM_TIERS[reached];
  return tier ? { tier, need: albumTierNeed(album, tier), reached } : null;
}

function emblem(album, size) {
  return album.style.emblem?.kind === 'monogram'
    ? monogramSvg(album.style.emblem.letter, album.style.emblem.spin, { size })
    : emblemSvg(album.style.emblem?.id ?? 'open', { size });
}

function medals(album) {
  if (!albumHasTiers(album)) return null;
  const reached = albumTiersReached(album);
  return h('span.pca-medals', ALBUM_TIERS.map((tier, i) => h(`i.pca-medal${i < reached ? '.is-on' : ''}`, { dataset: { tier: tier.id }, title: t(`albumTier_${tier.id}`) })));
}

function progressLine(album) {
  const next = nextTier(album);
  if (album.kind === 'code') return { text: `${album.owned} / ${album.total}`, fraction: album.owned / Math.max(1, album.total) };
  if (!next) return { text: t('pcAlbumAllMedals', { n: album.owned }), fraction: 1 };
  const from = next.reached ? albumTierNeed(album, ALBUM_TIERS[next.reached - 1]) : 0;
  if (!Number.isFinite(next.need)) return { text: t('pcAlbumNext', { n: album.owned, need: '?', medal: t(`albumTier_${next.tier.id}`) }), fraction: 0 };
  return {
    text: t('pcAlbumNext', { n: album.owned, need: next.need, medal: t(`albumTier_${next.tier.id}`) }),
    fraction: (album.owned - from) / Math.max(1, next.need - from)
  };
}

function totalLine(album) {
  if (!album.unlocked || album.kind === 'code') return null;
  const pct = album.total ? Math.min(100, (album.owned / album.total) * 100) : 0;
  return h('span.pca-total',
    h('span', h('b', album.owned.toLocaleString()), ` / ${album.total == null ? '?' : album.total.toLocaleString()}`),
    h('span.pca-total-bar', h('i', { style: { width: `${pct}%` } })));
}

function editionBadge(album) {
  if (!albumHasTiers(album) || albumTiersReached(album) < COMPLETE_TIER) return null;
  return h('span.pca-edition', { html: `${iconSvg('spark', { size: 11 })}` }, h('span', t('albumTier_complete')));
}

function albums() {
  const all = buildAlbums(store.allEntries(state.collection), state.customPacks);
  const q = view.search.trim().toLowerCase();
  const list = all
    .filter((a) => view.kind === 'all' || kindOf(a) === view.kind)
    .filter((a) => !q || a.name.toLowerCase().includes(q));
  const score = (a) => progressLine(a).fraction;
  const sorters = {
    progress: (a, b) => Number(b.unlocked) - Number(a.unlocked) || score(b) - score(a) || b.owned - a.owned,
    owned: (a, b) => b.owned - a.owned || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name)
  };
  return { all, list: list.sort(sorters[view.sort] ?? sorters.owned) };
}

function tile(album) {
  const line = progressLine(album);
  const btn = h(`button.pca-tile${album.unlocked ? '' : '.is-locked'}${album.complete ? '.is-complete' : ''}`, {
    type: 'button', title: album.name, style: { '--accent': album.style.accent, '--accent2': album.style.accent2 }
  },
  h('span.pca-cover',
    h('span.pca-spine'),
    h('span.pca-emblem', { html: emblem(album, 64) }),
    album.unlocked ? null : h('span.pca-lock', { html: iconSvg('lock', { size: 18 }) })),
  h('span.pca-name', album.name),
  h('span.pca-owned', album.unlocked ? t('pcAlbumCards', { n: album.owned.toLocaleString() }) : t('albumLocked')),
  totalLine(album),
  medals(album),
  editionBadge(album),
  album.unlocked ? h('span.pca-progress', meter(line.fraction), h('small', line.text)) : null);
  btn.addEventListener('click', () => {
    if (!album.unlocked) { synth.playDenied(); return; }
    synth.playSheet(true);
    openAlbum(album.key);
  });
  return btn;
}

function paintGrid() {
  const { list } = albums();
  const unit = rem();
  const box = view.box ?? view.grid.getBoundingClientRect();
  const layout = fitGrid(box, { aspect: 0.75, extra: 8.4 * unit, gap: 1.2 * unit, minW: 11 * unit, maxW: 15 * unit, target: 13 * unit, maxRows: 3 });
  const per = Math.max(1, layout.cols * layout.rows);
  const pages = Math.max(1, Math.ceil(list.length / per));
  view.pager.set(Math.min(view.pager.page, pages - 1), pages);
  view.grid.style.setProperty('--cols', String(layout.cols));
  view.grid.style.setProperty('--tile-w', `${layout.w}px`);
  view.grid.style.setProperty('--tile-h', `${Math.floor(layout.h)}px`);
  const start = view.pager.page * per;
  if (!list.length) { fill(view.grid, empty('book', t('noMatches'), null)); return; }
  fill(view.grid, list.slice(start, start + per).map(tile));
}

function gallery() {
  const { all } = albums();
  view.searchField ??= searchField({ placeholder: t('pcSearchAlbums'), hotkey: 'Ctrl F', onInput: (value) => { view.search = value; view.pager.set(0, 1); paintGrid(); } });
  const count = (kind) => all.filter((a) => a.unlocked && (kind === 'all' || kindOf(a) === kind)).length;
  const reached = all.reduce((n, a) => n + albumTiersReached(a), 0);
  fill(view.node,
    h('header.pck-tools',
      view.searchField,
      segmented(KINDS.map(([value, key, icon]) => ({ value, label: t(key), icon, count: count(value) })), view.kind,
        (value) => { view.kind = value; view.pager.set(0, 1); paintGrid(); }, { name: t('pcAlbums') }),
      dropdown(SORTS.map(([value, key]) => ({ value, label: t(key) })), view.sort, (value) => { view.sort = value; paintGrid(); }, { label: t('pcSortBy') }),
      h('div.pck-stats', { dataset: { drop: '2' } },
        h('span', h('b', String(all.filter((a) => a.unlocked).length)), t('pcAlbumsStarted', { n: all.filter((a) => a.unlocked).length })),
        h('span', h('b', String(reached)), t('pcMedalsWon', { n: reached })))),
    h('div.pca-stage', view.grid),
    h('footer.pck-foot', h('span'), view.pager.node, h('span.pck-foot-hint', t('pcAlbumHint'))));
  fitRow(view.node.querySelector('.pck-tools'));
  requestAnimationFrame(paintGrid);
}

function openAlbum(key) {
  view.open = key;
  render();
  refreshPrompts();
}

function closeAlbum() {
  view.open = null;
  synth.playSheet(false);
  render();
  refreshPrompts();
}

function bookView() {
  const album = albums().all.find((a) => a.key === view.open);
  if (!album) { view.open = null; gallery(); return; }
  view.book ??= new Book({ make: bookCard });
  const entries = album.kind === 'code'
    ? [...album.entries].sort((a, b) => (a.creator ? 1 : 0) - (b.creator ? 1 : 0) || (a.firstPulledAt ?? 0) - (b.firstPulledAt ?? 0))
    : [...album.entries].sort(store.favoritesFirst((a, b) => (a.firstPulledAt ?? 0) - (b.firstPulledAt ?? 0)));
  const line = progressLine(album);
  fill(view.node,
    h('header.pca-head', { style: { '--accent': album.style.accent, '--accent2': album.style.accent2 } },
      button(t('pcBackToAlbums'), { icon: 'chevronLeft', key: 'Esc', onClick: closeAlbum }),
      h('span.pca-head-emblem', { html: emblem(album, 44) }),
      h('div.pca-head-text',
        h('h2', album.name),
        h('p', line.text),
        totalLine(album)),
      medals(album),
      editionBadge(album),
      h('span.pca-head-meter', meter(line.fraction))),
    h('div.pck-stage', view.book.node),
    h('footer.pck-foot', h('span.pck-count', t('pcAlbumCards', { n: album.owned.toLocaleString() })), view.book.pager.node, h('span.pck-foot-hint', t('pcBookHint'))));
  const per = view.book.perSpread;
  const room = album.complete ? entries.length : Math.max(per, Math.ceil((entries.length + 1) / per) * per);
  const slots = Number.isFinite(album.total) ? Math.min(room, Math.max(album.total, entries.length)) : room;
  view.book.set(entries, { slots });
}

function render() {
  if (!view.pager) {
    view.pager = new Pager({ onChange: () => paintGrid() });
    wheelPager(view.grid, view.pager);
    observeSize(view.grid, (box) => { view.box = box; if (!view.open) paintGrid(); });
  }
  if (view.open) bookView();
  else gallery();
  keep.mark();
}

let signature = '';
const currentSignature = () => `${Object.keys(state.collection?.entries ?? {}).length}|${(state.customPacks ?? []).length}`;
const keep = keeper(() => `${currentSignature()}|${store.collectionStamp()}`);

function tick() {
  clearInterval(view.timer);
  view.timer = setInterval(() => {
    if (isAway(view.node) || live.sheet?.open) return;
    const now = currentSignature();
    if (now !== signature) { signature = now; if (view.open) bookView(); else paintGrid(); keep.mark(); }
  }, 1500);
}

registerView('albums', {
  node: view.node,
  screens: ['albums'],
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
    if (!view.open) return false;
    closeAlbum();
    return true;
  },
  find() { if (!view.open) { view.searchField?.input.focus(); view.searchField?.input.select(); } },
  key(event) {
    if (view.open) { if (view.book?.key(event)) event.preventDefault(); return; }
    if (pageKeys(event, view.pager)) { event.preventDefault(); return; }
    if (event.key === 'ArrowRight') { view.pager.go(view.pager.page + 1, true); event.preventDefault(); }
    if (event.key === 'ArrowLeft') { view.pager.go(view.pager.page - 1, true); event.preventDefault(); }
  },
  prompts: () => (view.open
    ? [['←  →', t('pcPromptPage')], ['Esc', t('pcPromptBack')]]
    : [['←  →', t('pcPromptPage')], ['Ctrl F', t('pcPromptSearch')]])
});
