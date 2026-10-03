import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { RARITIES, rarityById } from '../data/rarities.js';
import { buildAlbums } from '../albums.js';
import * as store from '../collection.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { money, state } from '../app/core.js';
import { buildStaticCard, openCardDetail, printsBadge } from '../app/detail.js';
import { live } from '../app/live.js';
import { isAway, registerView } from './shell.js';
import { Book } from './book.js';
import { dropdown, empty, fitRow, keeper, searchField } from './kit.js';

const view = { node: h('section.pc-view.pck'), book: null, search: null, count: null, timer: null };

export function bookCard(entry) {
  const rarity = rarityById(entry.rarityId);
  const card = buildStaticCard(entry, rarity, entry.key, { wish: false });
  const slot = h('div.pck-card', { dataset: { key: entry.key }, style: { '--rarity': rarity?.color ?? 'var(--line)' } }, card,
    entry.count > 1 ? h('span.pck-copies', `×${entry.count}`) : null, printsBadge(entry));
  slot.addEventListener('click', (event) => {
    if (event.target.closest('.fav-button, .wish-button')) return;
    synth.playTap();
    openCardDetail(entry.key, entry, rarity);
  });
  return slot;
}

function setFilter(key, value) {
  state.filters = { ...state.filters, [key]: value };
  synth.playTap();
  paintBook();
  paintTools();
}

export function rarityGems(entries, set = setFilter) {
  const f = state.filters;
  const counts = new Map();
  for (const e of entries) counts.set(e.rarityId, (counts.get(e.rarityId) ?? 0) + 1);
  const gem = (rarity) => {
    const on = (f.rarity || '') === (rarity?.id ?? '');
    const btn = h('button.pck-gem', {
      type: 'button',
      title: rarity ? `${tx(rarity.name)} · ${counts.get(rarity.id) ?? 0}` : t('pcAllRarities'),
      'aria-pressed': String(on),
      style: rarity ? { '--rarity': rarity.color } : null
    }, rarity ? h('i') : h('span', t('pcAllRarities')));
    btn.classList.toggle('is-on', on);
    btn.classList.toggle('is-all', !rarity);
    btn.addEventListener('click', () => set('rarity', on && rarity ? '' : rarity?.id ?? ''));
    return btn;
  };
  return h('div.pck-gems', { role: 'group', 'aria-label': t('rarity') }, gem(null), RARITIES.map(gem));
}

function albumOptions(entries) {
  const albums = buildAlbums(entries, state.customPacks).filter((a) => a.owned > 0).sort((a, b) => b.owned - a.owned);
  return [{ value: '', label: t('pcAllAlbums'), meta: entries.length }, ...albums.map((a) => ({ value: a.key, label: a.name, meta: a.owned }))];
}

function paintTools() {
  const entries = store.allEntries(state.collection);
  const f = state.filters;
  view.search ??= searchField({
    value: f.search ?? '',
    placeholder: t('searchTitles'),
    hotkey: 'Ctrl F',
    onInput: (value) => { state.filters = { ...state.filters, search: value }; paintBook(); }
  });
  const fav = h('button.pcx-icon-btn.pck-fav', { type: 'button', title: t('pcFavoritesOnly'), 'aria-label': t('pcFavoritesOnly'), 'aria-pressed': String(Boolean(f.favoritesOnly)) },
    h('span', { html: iconSvg(f.favoritesOnly ? 'starFilled' : 'star', { size: 20 }) }));
  fav.classList.toggle('is-on', Boolean(f.favoritesOnly));
  fav.addEventListener('click', () => setFilter('favoritesOnly', !f.favoritesOnly));
  const own = entries.filter((e) => !e.special);
  const stats = store.collectionStats(own);
  fill(view.tools,
    view.search,
    dropdown(store.SORTS.map((s) => ({ value: s.id, label: store.sortLabel(s) })), f.sort ?? 'recent', (value) => setFilter('sort', value), { label: t('pcSortBy') }),
    dropdown(albumOptions(entries), f.pack ?? '', (value) => setFilter('pack', value), { icon: 'book', search: true, width: 320 }),
    rarityGems(entries),
    fav,
    h('div.pck-stats', { dataset: { drop: '2' } },
      h('span', h('b', own.length.toLocaleString()), t('pcUnique', { n: own.length })),
      h('span', h('b', stats.copies.toLocaleString()), t('copies', { n: stats.copies })),
      h('span.is-value', h('b', { html: money(stats.value) }))));
}

function paintBook() {
  const entries = store.allEntries(state.collection);
  const shown = store.filterEntries(entries, state.filters);
  view.count.textContent = t('pcShowing', { n: shown.length.toLocaleString(), total: entries.length.toLocaleString() });
  view.stage.classList.toggle('is-empty', !shown.length);
  if (!shown.length) {
    view.empty.replaceChildren(entries.length
      ? empty('search', t('noMatches'), t('pcNoMatchesNote'))
      : empty('collection', t('emptyCollection'), t('pcNoCardsNote')));
  }
  view.book.set(shown);
}

function render() {
  view.book ??= new Book({ make: bookCard });
  view.tools = h('header.pck-tools');
  fitRow(view.tools);
  view.count = h('span.pck-count');
  view.empty = h('div.pck-empty');
  view.stage = h('div.pck-stage', view.book.node, view.empty);
  fill(view.node,
    view.tools,
    view.stage,
    h('footer.pck-foot', view.count, view.book.pager.node, h('span.pck-foot-hint', t('pcBookHint'))));
  paintTools();
  paintBook();
  keep.mark();
}

let signature = '';
const currentSignature = () => {
  const entries = state.collection?.entries ?? {};
  let copies = 0;
  let favs = 0;
  for (const e of Object.values(entries)) { copies += e.count ?? 1; if (e.favorite) favs++; }
  return `${Object.keys(entries).length}|${copies}|${favs}`;
};

const keep = keeper(() => `${currentSignature()}|${store.collectionStamp()}|${(state.customPacks ?? []).length}|${JSON.stringify(state.filters)}`);

function refresh() {
  if (isAway(view.node) || live.sheet?.open) return;
  const now = currentSignature();
  if (now === signature) return;
  signature = now;
  const page = view.book.pager.page;
  paintTools();
  const entries = store.allEntries(state.collection);
  view.book.set(store.filterEntries(entries, state.filters), { keep: true });
  if (view.book.pager.page !== page) view.book.pager.set(page, view.book.pager.pages);
  keep.mark();
}

registerView('collection', {
  node: view.node,
  screens: ['binder'],
  render() {
    signature = currentSignature();
    render();
    clearInterval(view.timer);
    view.timer = setInterval(refresh, 1200);
  },
  show() {
    if (!keep.fresh()) { this.render(); return; }
    clearInterval(view.timer);
    view.timer = setInterval(refresh, 1200);
  },
  find() { view.search?.input.focus(); view.search?.input.select(); },
  key(event) {
    if (event.key === '/') { this.find(); event.preventDefault(); return; }
    if (view.book?.key(event)) event.preventDefault();
  },
  prompts: () => [['←  →', t('pcPromptPage')], ['Ctrl F', t('pcPromptSearch')]]
});
