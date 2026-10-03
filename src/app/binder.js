import { t, tx } from '../i18n.js';
import * as store from '../collection.js';
import { ALBUM_TIERS, COMPLETE_TIER, albumHasTiers, albumKeyOf, albumTiersReached, buildAlbums, cardsPerPage, fetchAlbumTotal } from '../albums.js';
import { on } from '../ui/bus.js';
import { SHOWCASE_MAX } from '../showcase.js';
import { Picker, Progressive, pickBar } from './cardgrid.js';
import { favoriteKeys, fusable, fuseKeys, planValue, sellPlan, sellablePrints } from './bulk.js';
import { showPicture } from './pictures.js';
import { buckSvg, iconSvg } from '../data/icons.js';
import { Segmented, dur, press, reveal } from '../ui/components.js';
import { RARITIES, rarityById, rarityText } from '../data/rarities.js';
import { emblemSvg, monogramSvg } from '../data/emblems.js';
import { synth } from '../ui/sound.js';
import { POPULARITY_BANDS, formatAmount } from '../pricing.js';
import { compactCount, el, esc, money, openSheet, state, toast } from './core.js';
import { buildStaticCard, forgetCards, openCardDetail, printsBadge } from './detail.js';
import { live } from './live.js';
import { keeper } from './keep.js';

export function option(value, label) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

export function activeFilterCount() {
  const f = state.filters;
  return [f.search, f.pack, f.rarity, f.band, f.minPrice].filter(Boolean).length
    + (f.favoritesOnly ? 1 : 0) + (f.sort !== 'recent' ? 1 : 0);
}

let binderDirty = false;
const grid = { prog: null, picker: null, bar: null, shown: [], context: '', timer: null };

on('screen', (name) => {
  if (name === 'binder' && binderDirty) renderBinder();
  if (name !== 'binder') grid.picker?.exit();
});

const binderKeep = keeper(() => JSON.stringify([
  store.collectionStamp(), (state.customPacks ?? []).map((p) => p.id), state.binderView, state.binderSimple, state.filters
]));

export function renderBinder() {
  if (state.tab !== 'binder') { binderDirty = true; return; }
  binderDirty = false;
  if (state.album) { binderKeep.drop(); return renderAlbum(); }
  if (binderKeep.fresh()) return;
  binderKeep.mark();

  const simple = Boolean(state.binderSimple);
  el.binderTitle.textContent = t('tabCollection');
  el.albumView.hidden = true;
  el.binderStats.hidden = false;
  el.binderModes.hidden = false;
  el.binderSegWrap.hidden = simple;
  paintModes();

  const entries = store.allEntries(state.collection);
  const own = entries.filter((e) => !e.special);
  const stats = store.collectionStats(own);
  const albums = buildAlbums(entries, state.customPacks);
  const started = albums.filter((a) => a.unlocked).length;

  if (simple) {
    const spares = own.reduce((n, e) => n + Math.max(0, (e.count ?? 1) - 1), 0);
    const complete = albums.filter((a) => a.unlocked && a.complete).length;
    el.binderStats.innerHTML = `
      <span class="stat-pill"><b>${own.length.toLocaleString()}</b> ${t('simpleYourCards', { n: own.length })}</span>
      <span class="stat-pill"><b>${spares.toLocaleString()}</b> ${t('simpleSpares', { n: spares })}</span>
      <span class="stat-pill"><b>${complete}</b> ${t('simpleCompleteAlbums', { n: complete })}</span>`;
  } else {
    el.binderStats.innerHTML = `
      <span class="stat-pill"><b>${stats.copies}</b> ${t('copies', { n: stats.copies })}</span>
      <span class="stat-pill"><b>${money(stats.value)}</b> ${t('total')}</span>
      <span class="stat-pill"><b>${started}</b> ${t('albumsStarted', { n: started })}</span>`;
  }

  el.binderEmpty.hidden = entries.length > 0;
  if (!entries.length) {
    el.binderEmptyMark.innerHTML = iconSvg('collection', { size: 46 });
    el.binderEmptyText.textContent = t('emptyCollection');
  }

  if (!live.binderSeg) {
    live.binderSeg = new Segmented(el.binderSeg, [
      { id: 'albums', label: t('viewAlbums') },
      { id: 'classic', label: t('viewClassic') },
      { id: 'all', label: t('viewAllCards') }
    ], (view) => {
      state.binderView = view;
      store.saveBinderView(view);
      renderBinder();
    });
    live.binderSeg.select(state.binderView, { silent: true });
  }

  const view = simple ? 'simple' : state.binderView;
  el.albumShelf.hidden = view !== 'albums';
  el.simpleAlbums.hidden = view !== 'simple' || !entries.length;
  el.classicView.hidden = view === 'albums';
  el.binderTools.hidden = view === 'albums' || !entries.length;
  el.screens.binder.dataset.view = view;
  if (view === 'albums') {
    grid.picker?.exit();
    grid.prog?.stop();
    forgetCards(el.classicView);
    el.classicView.replaceChildren();
    grid.context = '';
    el.albumShelf.replaceChildren(...albums.map(buildAlbumCover));
    reveal(el.albumShelf.children, { step: 22, from: 10 });
    refreshAlbumTotals(albums.filter((a) => a.unlocked));
    return;
  }
  if (view === 'simple') paintSimpleAlbums(albums);
  renderClassic(entries, albums, view);
}

function paintModes() {
  const simple = Boolean(state.binderSimple);
  el.binderSimple.innerHTML = `${iconSvg(simple ? 'check' : 'grid', { size: 14 })}<span></span>`;
  el.binderSimple.querySelector('span').textContent = t('simpleMode');
  el.binderSimple.classList.toggle('is-on', simple);
  el.binderSimple.setAttribute('aria-pressed', String(simple));
  el.binderSell.innerHTML = `${buckSvg({ size: 14 })}<span></span>`;
  el.binderSell.querySelector('span').textContent = t('sellingOpen');
  if (el.binderSimple.dataset.bound) return;
  el.binderSimple.dataset.bound = '1';
  press(el.binderSimple, { sound: null });
  press(el.binderSell, { sound: null });
  el.binderSimple.addEventListener('click', () => {
    synth.playTap();
    state.binderSimple = !state.binderSimple;
    store.saveBinderSimple(state.binderSimple);
    grid.picker?.exit();
    renderBinder();
  });
  el.binderSell.addEventListener('click', () => {
    synth.playTap();
    import('./selling.js').then((m) => m.openSelling());
  });
}

function paintSimpleAlbums(albums) {
  const list = albums.filter((a) => a.unlocked).sort((a, b) => b.owned - a.owned || a.name.localeCompare(b.name));
  const head = document.createElement('h3');
  head.className = 'label simple-albums-head';
  head.textContent = t('simpleAlbums');
  el.simpleAlbums.replaceChildren(head, ...list.map((album) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `simple-album${album.complete ? ' is-complete' : ''}`;
    row.style.setProperty('--accent', album.style.accent);
    const reached = albumTiersReached(album);
    row.innerHTML = `
      <span class="simple-album-top"><b></b><span class="simple-album-n tabular"></span></span>
      <span class="simple-album-bar"><i></i></span>
      ${reached ? `<span class="album-cover-medal is-inline" data-tier="${ALBUM_TIERS[reached - 1].id}" aria-hidden="true"></span>` : ''}`;
    row.querySelector('b').textContent = album.name;
    row.querySelector('.simple-album-n').textContent = albumCountText(album);
    row.querySelector('.simple-album-bar i').style.width = `${albumPercent(album)}%`;
    row.addEventListener('click', () => {
      synth.playSheet(true);
      state.album = { key: album.key, spread: 0 };
      renderBinder();
    });
    return row;
  }));
  refreshAlbumTotals(list);
}

export const albumCountText = (album) => `${album.owned.toLocaleString()} / ${album.total == null ? '?' : album.total.toLocaleString()}`;
export const albumPercent = (album) => (album.total ? Math.min(100, (album.owned / album.total) * 100) : 0);

function bindTools() {
  if (el.classicSearch.dataset.bound) return;
  el.classicSearch.dataset.bound = '1';
  el.classicSearchMark.innerHTML = iconSvg('search', { size: 15 });
  el.classicSearch.addEventListener('input', () => {
    clearTimeout(grid.timer);
    grid.timer = setTimeout(() => {
      state.filters.search = el.classicSearch.value;
      renderBinder();
    }, 150);
  });
  el.classicSort.addEventListener('change', () => { state.filters.sort = el.classicSort.value; synth.playTap(); renderBinder(); });
  el.classicRarity.addEventListener('change', () => { state.filters.rarity = el.classicRarity.value; synth.playTap(); renderBinder(); });
  press(el.classicPick, { sound: null });
  el.classicPick.addEventListener('click', () => {
    synth.playTap();
    if (grid.picker.active) grid.picker.exit();
    else grid.picker.enter();
  });
}

function ensureGrid() {
  if (grid.prog) return;
  grid.prog = new Progressive(el.classicView, { chunk: 48, start: 24, release: forgetCards });
  grid.picker = new Picker(el.classicView, {
    onChange: () => { grid.bar.paint(); paintPickButton(); }
  });
  grid.bar = pickBar({ picker: grid.picker, all: () => grid.shown, actions: pickActions });
  document.body.appendChild(grid.bar.node);
}

function paintPickButton() {
  const on = Boolean(grid.picker?.active);
  el.classicPick.innerHTML = `${iconSvg(on ? 'close' : 'check', { size: 14 })}<span></span>`;
  el.classicPick.querySelector('span').textContent = on ? t('pickDone') : t('pickStart');
  el.classicPick.setAttribute('aria-label', on ? t('pickDone') : t('pickStart'));
  el.classicPick.classList.toggle('is-on', on);
}

export function renderClassic(entries, albums, view = state.binderView) {
  ensureGrid();
  bindTools();
  const simple = view === 'simple';
  el.classicFilter.textContent = t('filters');
  el.classicFilter.hidden = simple;
  el.classicSort.hidden = !simple;
  el.classicRarity.hidden = !simple;
  if (simple) {
    el.classicSort.replaceChildren(...store.SORTS.map((s) => option(s.id, store.sortLabel(s))));
    el.classicSort.value = state.filters.sort;
    el.classicSort.setAttribute('aria-label', t('pcSortBy'));
    el.classicRarity.replaceChildren(option('', t('allRarities')), ...RARITIES.map((r) => option(r.id, tx(r.name))));
    el.classicRarity.value = state.filters.rarity ?? '';
    el.classicRarity.setAttribute('aria-label', t('rarity'));
  }
  el.classicSearch.placeholder = t('searchTitles');
  el.classicSearch.setAttribute('aria-label', t('searchTitles'));
  if (el.classicSearch.value !== state.filters.search && document.activeElement !== el.classicSearch) el.classicSearch.value = state.filters.search;
  const active = activeFilterCount();
  el.classicFilterCount.textContent = String(active);
  el.classicFilterCount.hidden = simple || !active;
  paintPickButton();

  const visible = store.filterEntries(entries, state.filters);
  el.classicCount.textContent = t('classicShowing', { n: visible.length });
  grid.shown = visible.map((e) => e.key);
  const gone = [...grid.picker.keys].filter((k) => !state.collection.entries[k]);
  if (gone.length) grid.picker.replace([...grid.picker.keys].filter((k) => state.collection.entries[k]));

  const context = `${view}|${JSON.stringify(state.filters)}`;
  const fresh = context !== grid.context;
  const stamp = `${store.collectionStamp()}|${(state.customPacks ?? []).length}|${state.collection === grid.collection}`;
  if (!fresh && stamp === grid.stamp && el.classicView.childElementCount) return;
  grid.stamp = stamp;
  grid.collection = state.collection;
  const first = fresh ? 0 : builtInView(el.classicView);
  grid.context = context;

  if (!visible.length) {
    grid.prog.stop();
    const empty = document.createElement('p');
    empty.className = 'muted classic-empty';
    empty.textContent = t('noMatches');
    el.classicView.replaceChildren(empty);
    return;
  }
  const make = simple ? simpleTile : classicCard;
  const groups = view === 'classic' ? albumGroups(visible, albums) : [{ head: null, items: visible }];
  grid.prog.set(groups, {
    make: (entry) => grid.picker.mark(make(entry), entry.key),
    section: (group) => groupSection(group, simple),
    first
  });
  if (fresh) reveal(el.classicView.children, { step: 40 });
}

export function builtInView(container) {
  const limit = window.innerHeight + 900;
  let n = 0;
  for (const node of container.querySelectorAll('[data-key]')) {
    if (node.getBoundingClientRect().top > limit) break;
    n++;
  }
  return n;
}

export function classicCard(entry) {
  const card = buildStaticCard(entry, rarityById(entry.rarityId), entry.key);
  card.classList.add('is-mini');
  card.dataset.key = entry.key;
  if ((entry.count ?? 1) > 1) {
    const badge = document.createElement('span');
    badge.className = 'copy-badge';
    badge.textContent = `×${entry.count}`;
    card.appendChild(badge);
    const prints = printsBadge(entry);
    if (prints) card.appendChild(prints);
  }
  return card;
}

export function simpleTile(entry, { open = true } = {}) {
  const rarity = rarityById(entry.rarityId);
  const tile = document.createElement(open ? 'button' : 'div');
  if (open) tile.type = 'button';
  tile.className = `simple-card${entry.favorite ? ' is-fav' : ''}`;
  tile.dataset.key = entry.key;
  tile.style.setProperty('--rarity', rarity.color);
  tile.style.setProperty('--rarity-text', rarityText(rarity));
  tile.innerHTML = `
    <span class="simple-art"></span>
    <b class="simple-name"></b>
    <span class="simple-meta"><span class="simple-rarity"></span><span class="simple-copies tabular"></span></span>
    ${entry.favorite ? `<span class="simple-fav" aria-hidden="true">${iconSvg('starFilled', { size: 13 })}</span>` : ''}`;
  if (entry.thumbnail) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    showPicture(img, entry.thumbnail, () => img.remove());
    tile.querySelector('.simple-art').appendChild(img);
  }
  tile.querySelector('.simple-name').textContent = entry.title;
  tile.querySelector('.simple-rarity').textContent = tx(rarity.name);
  tile.querySelector('.simple-copies').textContent = t('simpleCopies', { n: entry.count ?? 1 });
  if (open) tile.addEventListener('click', () => { synth.playTap(); openCardDetail(entry.key, entry, rarity); });
  return tile;
}

export function albumGroups(visible, albums) {
  const byAlbum = new Map();
  for (const entry of visible) {
    const key = albumKeyOf(entry);
    if (!byAlbum.has(key)) byAlbum.set(key, []);
    byAlbum.get(key).push(entry);
  }
  const groups = [];
  for (const album of albums) {
    const items = byAlbum.get(album.key);
    if (!items?.length) continue;
    byAlbum.delete(album.key);
    groups.push({ head: album, items });
  }
  const rest = [...byAlbum.values()].flat();
  if (rest.length) groups.push({ head: { name: t('albumOther'), style: { accent: '#94a3b8', accent2: '#475569', emblem: null } }, items: rest });
  return groups;
}

function groupSection(group, simple) {
  const gridNode = document.createElement('div');
  gridNode.className = simple ? 'simple-grid' : 'classic-grid';
  if (!group.head) return { node: gridNode, grid: gridNode };
  const section = albumSection(group.head, group.items.length);
  section.appendChild(gridNode);
  return { node: section, grid: gridNode };
}

export function albumSection(album, count) {
  const section = document.createElement('section');
  section.className = 'classic-group';
  section.style.setProperty('--accent', album.style.accent);
  section.innerHTML = `
    <div class="classic-group-head">
      <span class="classic-group-mark" aria-hidden="true"></span>
      <h3></h3><span class="classic-group-n tabular"></span>
    </div>`;
  const emblem = album.style.emblem?.kind === 'monogram'
    ? monogramSvg(album.style.emblem.letter, album.style.emblem.spin, { size: 24 })
    : emblemSvg(album.style.emblem?.id ?? 'open', { size: 24 });
  const mark = section.querySelector('.classic-group-mark');
  mark.innerHTML = emblem;
  mark.style.setProperty('--e1', `color-mix(in srgb, ${album.style.accent} 55%, #ffffff)`);
  mark.style.setProperty('--e2', album.style.accent);
  mark.style.setProperty('--e3', album.style.accent2 ?? album.style.accent);
  section.querySelector('h3').textContent = album.name;
  section.querySelector('.classic-group-n').textContent = String(count);
  return section;
}

export function pickActions(keys, after = () => { if (state.tab === 'binder') renderBinder(); }) {
  const entries = keys.map((k) => state.collection.entries[k]).filter(Boolean);
  if (!entries.length) return [];
  const sellable = entries.filter((e) => !e.special);
  const favs = entries.filter((e) => e.favorite).length;
  const fuse = fusable(keys).length;
  return [
    sellable.length ? { id: 'sell', icon: 'buck', primary: true, label: esc(t('pickSell')), run: () => sellSheet(sellable.map((e) => e.key), after) } : null,
    favs < entries.length ? { id: 'fav', icon: 'starFilled', label: esc(t('pickFavorite')), run: async () => { await favoriteKeys(keys, true); after(); } } : null,
    favs ? { id: 'unfav', icon: 'star', label: esc(t('pickUnfavorite')), run: async () => { await favoriteKeys(keys, false); after(); } } : null,
    fuse ? { id: 'fuse', icon: 'spark', label: esc(t('pickFuse', { n: fuse })), run: async () => { if (await fuseKeys(keys)) { after(); import('./packs.js').then((m) => m.renderPacks()); } } } : null,
    entries.length <= SHOWCASE_MAX ? { id: 'pin', icon: 'star', label: esc(t('pickShowcase')), run: () => { pinShowcase(entries); } } : null
  ];
}

function pinShowcase(entries) {
  import('./profile.js').then((m) => {
    m.pinCards(entries.map((e) => ({ ...e, count: 1, favorite: false })));
    synth.playResolved();
    toast(t('pickPinned', { n: entries.length }), 'ok');
  });
}

export function sellSheet(keys, after = null, onSold = () => grid.picker?.exit()) {
  const entries = keys.map((k) => state.collection.entries[k]).filter((e) => e && !e.special);
  const spares = entries.map((e) => ({ key: e.key, prints: sellablePrints(e, 1) })).filter((p) => Object.keys(p.prints).length);
  const everything = entries.map((e) => ({ key: e.key, prints: sellablePrints(e, 0) }));
  const a = planValue(spares);
  const b = planValue(everything);
  openSheet(t('pickSellTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'pick-sell';
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = t('pickSellNote', { n: entries.length });
    const go = (label, plan, kind, act) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-block ${kind}`;
      btn.dataset.act = act;
      btn.innerHTML = label;
      btn.disabled = !plan.length;
      press(btn, { sound: null });
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        live.sheet.hide();
        const done = await sellPlan(plan);
        if (done) onSold?.();
        after?.();
      });
      return btn;
    };
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'btn btn-ghost btn-sm pick-sell-more';
    more.textContent = t('pickSellMore');
    more.addEventListener('click', () => {
      live.sheet.hide();
      import('./selling.js').then((m) => m.openSelling({ keys: entries.map((e) => e.key) }));
    });
    wrap.append(note,
      go(t('pickSellSpares', { n: a.copies, amount: money(a.coins) }), spares, 'btn-primary', 'spares'),
      go(t('pickSellAll', { n: b.copies, amount: money(b.coins) }), everything, 'btn-ghost btn-danger', 'all'),
      more);
    body.appendChild(wrap);
  });
}

export function classicSections(visible, albums, cardFor) {
  return albumGroups(visible, albums).map(({ head, items }) => {
    const section = albumSection(head, items.length);
    const gridNode = document.createElement('div');
    gridNode.className = 'classic-grid';
    gridNode.replaceChildren(...items.map((entry) => {
      const card = cardFor(entry);
      card.classList.add('is-mini');
      if ((entry.count ?? 1) > 1) {
        const badge = document.createElement('span');
        badge.className = 'copy-badge';
        badge.textContent = `×${entry.count}`;
        card.appendChild(badge);
        const prints = printsBadge(entry);
        if (prints) card.appendChild(prints);
      }
      return card;
    }));
    section.appendChild(gridNode);
    return section;
  });
}

export function refreshAlbumTotals(albums) {
  if (!albums.length) return;
  const before = albums.map((a) => `${a.key}:${a.total}`).join('|');
  Promise.all(albums.map((album) => fetchAlbumTotal(album))).then(() => {
    if (state.tab !== 'binder') return;
    const after = albums.map((a) => `${a.key}:${knownTotalOf(a)}`).join('|');
    if (after !== before) renderBinder();
  });
}

export function knownTotalOf(album) {
  const fresh = buildAlbums(store.allEntries(state.collection), state.customPacks)
    .find((a) => a.key === album.key);
  return fresh?.total ?? null;
}

export function buildAlbumCover(album) {
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = `album-cover${album.unlocked ? '' : ' is-locked'}${album.complete ? ' is-complete' : ''}`;
  cover.dataset.family = album.style.family ?? 'roundel';
  cover.style.setProperty('--accent', album.style.accent);
  cover.style.setProperty('--accent2', album.style.accent2);
  const emblem = album.style.emblem?.kind === 'monogram'
    ? monogramSvg(album.style.emblem.letter, album.style.emblem.spin, { size: 54 })
    : emblemSvg(album.style.emblem?.id ?? 'open', { size: 54 });
  cover.innerHTML = `
    <span class="album-spine" aria-hidden="true"></span>
    <span class="album-cover-emblem" aria-hidden="true">${emblem}</span>
    <b class="album-cover-name"></b>
    <span class="album-cover-count tabular"></span>
    <span class="album-cover-bar"><i></i></span>
    ${album.complete ? `<span class="album-cover-done">${iconSvg('spark', { size: 13 })}</span>` : ''}
    ${albumTiersReached(album) ? `<span class="album-cover-medal" data-tier="${ALBUM_TIERS[albumTiersReached(album) - 1].id}" aria-hidden="true"></span>` : ''}
    ${albumHasTiers(album) && album.unlocked ? `<span class="album-cover-medals" aria-hidden="true">${ALBUM_TIERS.map((tier, i) => `<i class="${i < albumTiersReached(album) ? 'is-on' : ''}" data-tier="${tier.id}"></i>`).join('')}</span>` : ''}`;
  cover.querySelector('.album-cover-name').textContent = album.name;
  cover.querySelector('.album-cover-count').textContent =
    album.unlocked ? `${album.owned.toLocaleString()} / ${album.total == null ? '?' : compactCount(album.total)}` : t('albumLocked');
  if (album.unlocked) cover.title = `${album.name}: ${albumCountText(album)}`;
  cover.querySelector('.album-cover-bar i').style.width =
    `${album.total ? Math.min(100, (album.owned / album.total) * 100) : 0}%`;
  press(cover, { sound: null });
  cover.addEventListener('click', () => {
    if (!album.unlocked) { toast(t('albumLockedHint', { name: album.name }), 'error'); return; }
    synth.playSheet(true);
    state.album = { key: album.key, spread: 0 };
    renderBinder();
  });
  return cover;
}

export function currentAlbum() {
  const entries = store.allEntries(state.collection);
  return buildAlbums(entries, state.customPacks).find((a) => a.key === state.album?.key) ?? null;
}

export function renderAlbum() {
  const album = currentAlbum();
  if (!album) { state.album = null; return renderBinder(); }

  el.albumShelf.hidden = true;
  el.binderStats.hidden = true;
  el.binderEmpty.hidden = true;
  el.classicView.hidden = true;
  el.binderTools.hidden = true;
  el.simpleAlbums.hidden = true;
  el.binderSegWrap.hidden = true;
  el.binderModes.hidden = true;
  grid.picker?.exit();
  el.albumView.hidden = false;
  el.binderTitle.textContent = t('tabCollection');

  el.albumBack.innerHTML = iconSvg('chevronLeft', { size: 18 });
  el.albumName.textContent = album.name;
  const edition = albumHasTiers(album) && albumTiersReached(album) >= COMPLETE_TIER;
  el.albumProgress.innerHTML = `<span class="tabular"></span><span class="album-progress-bar"><i></i></span>${edition ? `<span class="edition-badge">${iconSvg('spark', { size: 11 })}<span></span></span>` : ''}`;
  el.albumProgress.querySelector('.tabular').textContent = albumCountText(album) + (album.complete && !edition ? ` · ${t('albumComplete')}` : '');
  el.albumProgress.querySelector('.album-progress-bar i').style.width = `${albumPercent(album)}%`;
  if (edition) el.albumProgress.querySelector('.edition-badge span').textContent = t('albumTier_complete');
  if (album.total == null) refreshAlbumTotals([album]);
  el.filterOpen.textContent = t('filters');
  const active = activeFilterCount();
  el.filterCount.textContent = String(active);
  el.filterCount.hidden = !active;

  el.albumBook.style.setProperty('--accent', album.style.accent);
  el.albumBook.style.setProperty('--accent2', album.style.accent2);

  const visible = album.kind === 'code'
    ? [...album.entries].sort((a, b) => (a.creator ? 1 : 0) - (b.creator ? 1 : 0) || (a.firstPulledAt ?? 0) - (b.firstPulledAt ?? 0))
    : store.filterEntries(album.entries, { ...state.filters, pack: '' });
  const pages = Math.max(pageCount(album, visible.length), 1);
  const page = Math.min(state.album.spread, pages - 1);
  state.album.spread = page;

  fillAlbumPage(el.pageSlots, visible, page * cardsPerPage(), album);
  el.pageno.textContent = String(page + 1);

  if (pages <= 12) {
    el.albumDots.replaceChildren(...Array.from({ length: pages }, (_, i) => {
      const dot = document.createElement('span');
      dot.className = `album-dot${i === page ? ' is-on' : ''}`;
      return dot;
    }));
  } else {
    const counter = document.createElement('span');
    counter.className = 'album-dot-count tabular';
    counter.textContent = `${page + 1} / ${pages}`;
    el.albumDots.replaceChildren(counter);
  }
  el.albumHint.textContent = t('albumSwipeHint');
}

const slotLimit = (album, count) => (Number.isFinite(album?.total) ? Math.max(album.total, count) : Infinity);

export function fillAlbumPage(node, entries, offset, album) {
  const slots = [];
  const limit = slotLimit(album, entries.length);
  for (let i = 0; i < cardsPerPage() && offset + i < limit; i++) {
    const entry = entries[offset + i];
    if (entry) {
      const card = buildStaticCard(entry, rarityById(entry.rarityId), entry.key);
      card.classList.add('is-mini');
      if (entry.count > 1) {
        const badge = document.createElement('span');
        badge.className = 'copy-badge';
        badge.textContent = `×${entry.count}`;
        card.appendChild(badge);
        const prints = printsBadge(entry);
        if (prints) card.appendChild(prints);
      }
      slots.push(card);
    } else {
      const empty = document.createElement('div');
      empty.className = 'album-slot-empty';
      empty.innerHTML = `<span class="tabular">${offset + i + 1}</span>`;
      slots.push(empty);
    }
  }
  node.replaceChildren(...slots);
}

export function pageCount(album, visibleCount) {
  const filled = Math.max(1, Math.ceil(visibleCount / cardsPerPage()));
  const most = Math.max(1, Math.ceil(slotLimit(album, visibleCount) / cardsPerPage()));
  return album.complete ? filled : Math.min(filled + 1, most);
}

export function turnAlbumPage(dir) {
  const album = currentAlbum();
  if (!album || state.albumTurning) return;
  const visible = album.kind === 'code'
    ? [...album.entries].sort((a, b) => (a.creator ? 1 : 0) - (b.creator ? 1 : 0) || (a.firstPulledAt ?? 0) - (b.firstPulledAt ?? 0))
    : store.filterEntries(album.entries, { ...state.filters, pack: '' });
  const pages = Math.max(pageCount(album, visible.length), 1);
  const next = state.album.spread + dir;
  if (next < 0 || next >= pages) {
    el.albumBook.classList.remove('turn-bump-l', 'turn-bump-r');
    void el.albumBook.offsetWidth;
    el.albumBook.classList.add(dir > 0 ? 'turn-bump-r' : 'turn-bump-l');
    return;
  }
  state.albumTurning = true;
  synth.playPageTurn();
  const leaf = el.albumLeaf;
  leaf.classList.add(dir > 0 ? 'is-folding-r' : 'is-folding-l');
  setTimeout(() => {
    state.album.spread = next;
    renderAlbum();
    leaf.classList.remove('is-folding-r', 'is-folding-l');
    leaf.classList.add(dir > 0 ? 'is-unfolding-r' : 'is-unfolding-l');
    setTimeout(() => {
      leaf.classList.remove('is-unfolding-r', 'is-unfolding-l');
      state.albumTurning = false;
    }, dur(240));
  }, dur(230));
}

export function openFilters() {
  openSheet(t('filters'), (body) => {
    const entries = store.allEntries(state.collection);
    const packs = buildAlbums(entries, state.customPacks)
      .filter((album) => album.owned > 0)
      .map((album) => [album.key, album.name]);

    const wrap = document.createElement('div');
    wrap.className = 'filters';
    wrap.innerHTML = `
      <input class="filter-input" type="search" data-key="search" />
      <div class="filter-row">
        <select class="filter-select" data-key="pack"></select>
        <select class="filter-select" data-key="rarity"></select>
      </div>
      <div class="filter-row">
        <select class="filter-select" data-key="band"></select>
        <select class="filter-select" data-key="minPrice"></select>
      </div>
      <select class="filter-select" data-key="sort"></select>
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:4px">
        <button class="chip" type="button" data-fav></button>
        <button class="btn btn-ghost btn-sm" type="button" data-reset></button>
      </div>`;

    const search = wrap.querySelector('[data-key="search"]');
    search.placeholder = t('searchTitles');
    search.value = state.filters.search;

    const sel = (key) => wrap.querySelector(`[data-key="${key}"]`);
    sel('pack').replaceChildren(option('', t('allPacks')), ...packs.map(([id, name]) => option(id, name ?? id)));
    sel('rarity').replaceChildren(option('', t('allRarities')), ...RARITIES.map((r) => option(r.id, tx(r.name))));
    sel('band').replaceChildren(option('', t('anyPopularity')), ...POPULARITY_BANDS.map((b) => option(b.id, b.name)));
    sel('minPrice').replaceChildren(option('', t('anyPrice')),
      ...[100, 500, 1500, 5000, 12000].map((p) => option(String(p), t('priceOver', { amount: formatAmount(p) }))));
    sel('sort').replaceChildren(...store.SORTS.map((s) => option(s.id, store.sortLabel(s))));
    ['pack', 'rarity', 'band', 'minPrice', 'sort'].forEach((key) => { sel(key).value = state.filters[key]; });

    const apply = () => { renderBinder(); paintFav(); };
    wrap.querySelectorAll('select').forEach((node) => {
      node.addEventListener('change', (e) => { state.filters[e.target.dataset.key] = e.target.value; apply(); });
    });
    search.addEventListener('input', (e) => { state.filters.search = e.target.value; apply(); });

    const fav = wrap.querySelector('[data-fav]');
    const paintFav = () => {
      fav.classList.toggle('is-on', state.filters.favoritesOnly);
      fav.innerHTML = `${iconSvg(state.filters.favoritesOnly ? 'starFilled' : 'star', { size: 14 })}<span>${t('favourites')}</span>`;
      el.filterCount.textContent = String(activeFilterCount());
      el.filterCount.hidden = !activeFilterCount();
    };
    paintFav();
    fav.addEventListener('click', () => {
      state.filters.favoritesOnly = !state.filters.favoritesOnly;
      synth.playTap();
      apply();
    });

    const resetBtn = wrap.querySelector('[data-reset]');
    resetBtn.textContent = t('reset');
    press(resetBtn, { sound: null });
    resetBtn.addEventListener('click', () => {
      state.filters = { search: '', pack: '', rarity: '', band: '', minPrice: '', sort: 'rarity', favoritesOnly: false };
      live.sheet.hide();
      renderBinder();
    });

    body.appendChild(wrap);
  });
}
