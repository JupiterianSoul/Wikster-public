import { t, tx } from '../i18n.js';
import * as store from '../collection.js';
import { COMPLETE_TIER, albumKeyOf, albumTiersReached, buildAlbums } from '../albums.js';
import { RARITIES, rarityById, rarityRank, rarityText } from '../data/rarities.js';
import { buckSvg, iconSvg } from '../data/icons.js';
import { printsOf, sortedPrints } from '../econ/rules.js';
import { press } from '../ui/components.js';
import { on } from '../ui/bus.js';
import { synth } from '../ui/sound.js';
import { isPc } from '../pc/mode.js';
import { el, money, openSheet, showScreen, state, toast } from './core.js';
import { live } from './live.js';
import { Picker, Progressive } from './cardgrid.js';
import { planValue, printSellPrice, sellPlan, sellablePrints } from './bulk.js';
import { showPicture } from './pictures.js';
import { albumArt } from './choices.js';
import { dropdown } from '../ui/dropdown.js';

const SORTS = [
  ['value', 'sellSortValue'], ['rarity', 'sortRarity'], ['album', 'sellSortAlbum'], ['copies', 'sellSortCopies'],
  ['newest', 'sellSortNewest'], ['oldest', 'sellSortOldest'], ['name', 'sortName']
];

const GROUPS = [
  ['rarity', 'sellGroupRarity'], ['spares', 'sellGroupSpares'], ['recent', 'sellGroupRecent'],
  ['albums', 'sellGroupAlbums'], ['price', 'sellGroupPrice']
];

const sell = {
  plan: new Map(),
  manual: new Map(),
  applied: [],
  group: 'rarity',
  keep: 1,
  guardFavs: true,
  search: '',
  rarity: '',
  album: '',
  sort: 'value',
  price: '',
  shown: [],
  mounts: new Map(),
  pending: null,
  last: null
};

const entryOf = (key) => state.collection.entries[key] ?? null;
const sum = (prints) => Object.values(prints ?? {}).reduce((a, n) => a + n, 0);
const coinsOf = (entry, prints) => Object.entries(prints ?? {}).reduce((a, [rid, n]) => a + n * printSellPrice(entry, rid), 0);

function pool(entry, guard = sell.guardFavs) {
  if (!entry || entry.special) return {};
  if (guard && entry.favorite) return {};
  return sellablePrints(entry, sell.keep);
}

function lowest(prints, n) {
  const out = {};
  let left = n;
  for (const [rid, k] of sortedPrints(prints)) {
    if (left <= 0) break;
    const take = Math.min(k, left);
    out[rid] = take;
    left -= take;
  }
  return out;
}

function clip(prints, cap) {
  const out = {};
  for (const [rid, n] of Object.entries(prints)) {
    const k = Math.min(n, cap[rid] ?? 0);
    if (k > 0) out[rid] = k;
  }
  return out;
}

function merge(a, b, cap) {
  const out = { ...a };
  for (const [rid, n] of Object.entries(b)) out[rid] = Math.min((out[rid] ?? 0) + n, cap[rid] ?? 0);
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0));
}

function setPlan(key, prints) {
  if (sum(prints) > 0) sell.plan.set(key, prints);
  else sell.plan.delete(key);
}

const cards = () => store.allEntries(state.collection).filter((e) => !e.special);

function albumsNow() {
  return buildAlbums(store.allEntries(state.collection), state.customPacks);
}

function completeAlbumKeys(albums) {
  return new Set(albums.filter((a) => a.unlocked && a.complete).map((a) => a.key));
}

function editionAlbumKeys(albums) {
  return new Set(albums.filter((a) => a.unlocked && (albumTiersReached(a) >= COMPLETE_TIER
    || (Number(state.profile?.albumTiers?.[a.key]) || 0) >= COMPLETE_TIER)).map((a) => a.key));
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const only = (cap, test) => Object.fromEntries(Object.entries(cap).filter(([rid]) => test(rid)));
const albumsOf = (ctx) => (ctx.albums ??= albumsNow());

const TOGGLES = {
  spares: { group: 'spares', key: 'sellQuickSpares' },
  keep2: { group: 'spares', key: 'sellQuickKeep2', take: (e, cap) => clip(sellablePrints(e, 2), cap) },
  triples: { group: 'spares', key: 'sellQuickTriples', test: (e) => (e.count ?? 1) >= 3 },
  today: { group: 'recent', key: 'sellQuickToday', test: (e) => (e.lastPulledAt ?? 0) >= startOfToday() },
  week: { group: 'recent', key: 'sellQuickWeek', test: (e) => (e.lastPulledAt ?? 0) >= Date.now() - 7 * 86400000 },
  complete: { group: 'albums', key: 'sellQuickComplete', albums: completeAlbumKeys },
  edition: { group: 'albums', key: 'sellQuickEdition', albums: editionAlbumKeys }
};

function pickOf(id, ctx = {}) {
  const at = id.indexOf(':');
  const kind = at < 0 ? id : id.slice(0, at);
  const arg = at < 0 ? '' : id.slice(at + 1);
  if (kind.startsWith('r-')) {
    const rid = kind.slice(2);
    const r = rarityById(rid);
    return { group: 'rarity', label: tx(r.name), color: r.color, take: (e, cap) => only(cap, (x) => x === rid) };
  }
  if (kind === 'upto') {
    const top = rarityRank(arg);
    const r = rarityById(arg);
    return { group: 'rarity', label: t('sellUpToPick', { rarity: tx(r.name) }), color: r.color, take: (e, cap) => only(cap, (x) => rarityRank(x) <= top) };
  }
  if (kind === 'album') {
    const name = albumsOf(ctx).find((a) => a.key === arg)?.name ?? arg;
    return { group: 'albums', label: name, test: (e) => albumKeyOf(e) === arg };
  }
  if (kind === 'under' || kind === 'over') {
    const limit = Number(arg);
    return { group: 'price', label: t(kind === 'under' ? 'sellUnderPick' : 'sellOverPick', { amount: money(limit) }), html: true,
      take: (e, cap) => only(cap, (rid) => (kind === 'under' ? printSellPrice(e, rid) < limit : printSellPrice(e, rid) > limit)) };
  }
  const q = TOGGLES[kind];
  if (!q) return null;
  if (q.albums) {
    const keys = () => (ctx[kind] ??= q.albums(albumsOf(ctx)));
    return { group: q.group, label: t(q.key), test: (e) => keys().has(albumKeyOf(e)), take: (e, cap) => clip(sellablePrints(e, Math.max(1, sell.keep)), cap) };
  }
  return { group: q.group, label: t(q.key), test: q.test, take: q.take };
}

function collect(id, ctx, guard = sell.guardFavs, list = cards()) {
  const out = new Map();
  const p = pickOf(id, ctx);
  if (!p) return out;
  for (const e of list) {
    if (p.test && !p.test(e)) continue;
    const cap = pool(e, guard);
    if (!sum(cap)) continue;
    const more = clip(p.take ? p.take(e, cap) : cap, cap);
    if (sum(more)) out.set(e.key, more);
  }
  return out;
}

function recompute() {
  const ctx = {};
  const list = cards();
  sell.plan = new Map();
  for (const id of sell.applied) {
    for (const [key, more] of collect(id, ctx, sell.guardFavs, list)) {
      const cap = pool(entryOf(key));
      sell.plan.set(key, merge(sell.plan.get(key) ?? {}, more, cap));
    }
  }
  for (const [key, prints] of [...sell.manual]) {
    const entry = entryOf(key);
    if (!entry) { sell.manual.delete(key); continue; }
    setPlan(key, clip(prints, pool(entry)));
  }
}

function addPick(id) {
  if (sell.applied.includes(id)) return true;
  const touched = collect(id, {});
  if (!touched.size) {
    synth.playDenied();
    toast(t('sellNothing'), 'info');
    return false;
  }
  for (const key of touched.keys()) sell.manual.delete(key);
  sell.applied.push(id);
  recompute();
  return true;
}

function dropPick(id) {
  sell.applied = sell.applied.filter((x) => x !== id);
  recompute();
}

function togglePick(id) {
  if (sell.applied.includes(id)) dropPick(id);
  else addPick(id);
}

function clearAll() {
  sell.applied = [];
  sell.manual.clear();
  sell.plan.clear();
}

function visibleCards() {
  const term = sell.search.trim().toLowerCase();
  const list = cards().filter((e) => (!sell.rarity || e.rarityId === sell.rarity)
    && (!sell.album || albumKeyOf(e) === sell.album)
    && (!term || e.title.toLowerCase().includes(term)));
  const worth = new Map();
  if (sell.sort === 'value') {
    for (const e of list) {
      const cap = pool(e);
      worth.set(e.key, sum(cap) ? coinsOf(e, cap) : -1);
    }
  }
  const compare = {
    value: (a, b) => worth.get(b.key) - worth.get(a.key),
    rarity: (a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId),
    album: (a, b) => (albumKeyOf(a) < albumKeyOf(b) ? -1 : albumKeyOf(a) > albumKeyOf(b) ? 1 : 0),
    copies: (a, b) => (b.count ?? 1) - (a.count ?? 1),
    newest: (a, b) => (b.lastPulledAt ?? 0) - (a.lastPulledAt ?? 0),
    oldest: (a, b) => (a.firstPulledAt ?? 0) - (b.firstPulledAt ?? 0),
    name: () => 0
  }[sell.sort] ?? (() => 0);
  return list.sort((a, b) => compare(a, b) || store.byTitle(a, b));
}

function node(tag, className, text = null) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function select(options, value, onChange, label, extra = '') {
  return dropdown(options, value, (v, n) => { synth.playTap(); onChange(v, n); }, { label, className: `filter-select sell-select${extra ? ` ${extra}` : ''}` });
}

const rarityItem = (r) => ({ value: r.id, label: tx(r.name), dot: r.color });
const albumItem = (a) => ({ value: a.key, label: a.name ?? a.key, art: albumArt(a), accent: a.style?.accent, accent2: a.style?.accent2 });

function chip(label, { on = false, color = null, act = null, run, extra = '' }) {
  const b = node('button', `chip sell-chip${on ? ' is-on' : ''}${extra ? ` ${extra}` : ''}`);
  b.type = 'button';
  if (act) b.dataset.act = act;
  if (color) b.style.setProperty('--dot', color);
  b.setAttribute('aria-pressed', String(on));
  b.innerHTML = `${color ? '<i class="sell-dot"></i>' : ''}<span></span>${on ? `<i class="sell-chip-x">${iconSvg('check', { size: 12 })}</i>` : ''}`;
  b.querySelector('span').textContent = label;
  b.addEventListener('click', () => { synth.playTap(); run(); });
  return b;
}

function mount(root, { pc = false } = {}) {
  let m = sell.mounts.get(root);
  if (m) return m;
  root.classList.toggle('is-pc', pc);
  m = {
    root, pc,
    side: node('div', 'sell-side'), main: node('div', 'sell-main'), safe: node('div', 'sell-safe'), quick: node('section', 'sell-quick'),
    tools: node('div', 'sell-tools'), selrow: node('div', 'sell-selrow'), list: node('div', 'sell-list'), bar: node('div', 'sell-bar')
  };
  m.side.append(m.safe, m.quick);
  m.main.append(m.tools, m.selrow, m.list);
  root.replaceChildren(m.side, m.main);
  if (pc) root.appendChild(m.bar);
  else {
    m.bar.hidden = state.tab !== 'selling';
    document.body.appendChild(m.bar);
    on('screen', (name) => { m.bar.hidden = name !== 'selling'; });
  }
  m.prog = new Progressive(m.list, { chunk: 60 });
  if (pc) m.prog.root = m.list;
  m.picker = new Picker(m.list, { longPress: false, onChange: () => syncFromPicker(m) });
  m.picker.active = true;
  m.list.classList.add('is-picking');
  sell.mounts.set(root, m);
  return m;
}

function syncFromPicker(m) {
  if (m.syncing) return;
  let changed = false;
  for (const key of m.picker.keys) {
    if (sell.plan.has(key)) continue;
    const cap = pool(entryOf(key));
    if (sum(cap)) { sell.plan.set(key, cap); sell.manual.set(key, cap); changed = true; }
    else synth.playDenied();
  }
  const shown = new Set(sell.shown);
  for (const key of [...sell.plan.keys()]) {
    if (!m.picker.keys.has(key) && shown.has(key)) { sell.plan.delete(key); sell.manual.set(key, {}); changed = true; }
  }
  if (changed) refresh(m);
  else syncPicker(m);
}

function syncPicker(m) {
  m.syncing = true;
  const want = [...sell.plan.keys()];
  const same = want.length === m.picker.keys.size && want.every((k) => m.picker.keys.has(k));
  if (!same) {
    m.picker.keys = new Set(want);
    m.picker.paint();
  }
  for (const n of m.list.querySelectorAll('[data-key]')) paintRow(n);
  m.syncing = false;
}

function printTags(box, prints, sold) {
  const tags = sortedPrints(prints).reverse().map(([rid, n]) => {
    const r = rarityById(rid);
    const i = node('i', '', sold ? `${n} ${tx(r.name)}` : `${tx(r.name)} ×${n}`);
    i.style.setProperty('--rarity', r.color);
    i.style.setProperty('--rarity-text', rarityText(r));
    return i;
  });
  box.replaceChildren(...tags);
  box.classList.toggle('is-sold', sold);
}

function paintRow(n) {
  const key = n.dataset.key;
  const entry = entryOf(key);
  if (!entry) return;
  const picked = sell.plan.get(key);
  const mark = `${sell.keep}|${sell.guardFavs}|${entry.count}|${entry.favorite ? 1 : 0}|${picked ? Object.entries(picked).join() : ''}`;
  if (n.dataset.mark === mark) return;
  n.dataset.mark = mark;
  const capPrints = pool(entry);
  const cap = sum(capPrints);
  const count = sum(picked);
  n.classList.toggle('is-picked', count > 0);
  n.classList.toggle('is-locked', !cap);
  n.querySelector('.sell-n').textContent = cap ? `${count} / ${cap}` : '';
  n.querySelector('.sell-value').innerHTML = cap ? money(coinsOf(entry, count ? picked : capPrints)) : '';
  printTags(n.querySelector('.sell-prints'), count ? picked : printsOf(entry), count > 0);
  const lock = n.querySelector('.sell-lock span');
  lock.textContent = cap ? '' : (entry.favorite && sell.guardFavs ? t('sellLockFav') : t('sellLockLast'));
  n.querySelector('[data-step="-1"]').disabled = !count;
  n.querySelector('[data-step="1"]').disabled = count >= cap;
  n.setAttribute('aria-label', `${entry.title}, ${cap ? `${count} / ${cap}` : lock.textContent}`);
}

function rowFor(entry, m) {
  const rarity = rarityById(entry.rarityId);
  const n = node('div', 'sell-item');
  n.dataset.key = entry.key;
  n.style.setProperty('--rarity', rarity.color);
  n.innerHTML = `
    <span class="sell-art">
      <span class="sell-check" aria-hidden="true">${iconSvg('check', { size: 13 })}</span>
      ${entry.favorite ? `<span class="sell-fav" aria-hidden="true">${iconSvg('starFilled', { size: 11 })}</span>` : ''}
      <span class="sell-lock">${iconSvg('lock', { size: 11 })}<span></span></span>
    </span>
    <span class="sell-copy"><b></b><span class="sell-prints"></span></span>
    <span class="sell-foot">
      <span class="sell-value tabular"></span>
      <span class="sell-step pick-skip">
        <button type="button" class="sell-stepbtn" data-step="-1" aria-label="-1">${iconSvg('minus', { size: 12 })}</button>
        <span class="sell-n tabular"></span>
        <button type="button" class="sell-stepbtn" data-step="1" aria-label="+1">${iconSvg('plus', { size: 12 })}</button>
      </span>
    </span>`;
  if (entry.thumbnail) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    showPicture(img, entry.thumbnail, () => img.remove());
    n.querySelector('.sell-art').prepend(img);
  }
  n.querySelector('b').textContent = entry.title;
  n.querySelectorAll('[data-step]').forEach((btn) => btn.addEventListener('click', (event) => {
    event.stopPropagation();
    synth.playTap();
    const cap = pool(entry);
    const k = Math.max(0, Math.min(sum(cap), sum(sell.plan.get(entry.key)) + Number(btn.dataset.step)));
    const prints = lowest(cap, k);
    sell.manual.set(entry.key, prints);
    setPlan(entry.key, prints);
    refresh(m);
  }));
  paintRow(n);
  return n;
}

function setKeep(m, keep) {
  sell.keep = keep;
  recompute();
  repaint(m);
}

function paintSafe(m) {
  const seg = node('div', 'sell-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', t('sellSafety'));
  for (const [keep, key] of [[1, 'sellKeep1'], [2, 'sellKeep2'], [0, 'sellKeep0']]) {
    const b = chip(t(key), { on: sell.keep === keep, act: `keep${keep}`, extra: keep === 0 ? 'is-danger' : '', run: () => setKeep(m, keep) });
    seg.appendChild(b);
  }
  const favs = chip(t('sellGuardFavs'), { on: sell.guardFavs, act: 'favs', extra: 'sell-guard', run: () => { sell.guardFavs = !sell.guardFavs; recompute(); repaint(m); } });
  favs.insertAdjacentHTML('afterbegin', `<i class="sell-guard-ico">${iconSvg(sell.guardFavs ? 'shield' : 'starFilled', { size: 13 })}</i>`);
  const label = node('span', 'sell-safe-label');
  label.innerHTML = `${iconSvg('shield', { size: 14 })}<span></span>`;
  label.querySelector('span').textContent = t('sellSafety');
  const line = node('div', 'sell-safe-row');
  line.append(label, seg, favs);
  m.safe.replaceChildren(line);
  if (sell.keep === 0) m.safe.appendChild(warnLine(t('sellKeep0Note'), 'danger'));
}

function paneFor(m, group) {
  const pane = node('div', 'sell-pane');
  pane.dataset.group = group;
  const toggle = (id) => {
    const p = pickOf(id);
    return chip(p.label, { on: sell.applied.includes(id), color: p.color ?? null, act: id, run: () => { togglePick(id); refresh(m, { side: true }); } });
  };
  const owned = new Set(cards().map((e) => e.rarityId));
  if (group === 'rarity') {
    const upTo = select([['', t('sellUpTo')], ...RARITIES.filter((r) => owned.has(r.id)).map(rarityItem)], '', (value, s) => {
      s.value = '';
      if (value && addPick(`upto:${value}`)) refresh(m, { side: true });
    }, t('sellUpTo'), 'sell-upto');
    pane.append(...RARITIES.filter((r) => owned.has(r.id)).map((r) => toggle(`r-${r.id}`)), upTo);
  } else if (group === 'spares') {
    pane.append(toggle('spares'), toggle('keep2'), toggle('triples'));
  } else if (group === 'recent') {
    pane.append(toggle('today'), toggle('week'));
  } else if (group === 'albums') {
    const albums = albumsNow().filter((a) => a.owned > 0);
    const byAlbum = select([['', t('sellByAlbum')], ...albums.map(albumItem)], '', (value, s) => {
      s.value = '';
      if (value && addPick(`album:${value}`)) refresh(m, { side: true });
    }, t('sellByAlbum'), 'sell-byalbum');
    pane.append(byAlbum, toggle('complete'), toggle('edition'));
  } else if (group === 'price') {
    const price = node('input', 'filter-input sell-price');
    price.type = 'number';
    price.min = '0';
    price.inputMode = 'numeric';
    price.placeholder = t('sellPricePlaceholder');
    price.setAttribute('aria-label', t('sellPricePlaceholder'));
    price.value = sell.price;
    price.addEventListener('input', () => { sell.price = price.value; });
    const run = (kind) => () => {
      const limit = Math.floor(Number(sell.price));
      if (!(limit > 0)) { synth.playDenied(); price.focus(); return; }
      if (addPick(`${kind}:${limit}`)) refresh(m, { side: true });
    };
    pane.append(price, chip(t('sellUnder'), { act: 'under', run: run('under') }), chip(t('sellOver'), { act: 'over', run: run('over') }));
  }
  return pane;
}

function paintQuick(m) {
  const head = node('div', 'sell-quick-head');
  const title = node('h3', 'sell-quick-title', t('sellQuick'));
  head.append(title, node('span', 'sell-quick-hint', t('sellQuickHint')));
  const tabs = node('div', 'sell-tabs');
  tabs.setAttribute('role', 'tablist');
  const counts = new Map();
  for (const id of sell.applied) {
    const g = pickOf(id)?.group;
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  for (const [group, key] of GROUPS) {
    const b = node('button', `sell-tab${sell.group === group ? ' is-on' : ''}`);
    b.type = 'button';
    b.dataset.group = group;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(sell.group === group));
    b.append(node('span', '', t(key)));
    if (counts.get(group)) b.append(node('i', 'sell-tab-n', String(counts.get(group))));
    b.addEventListener('click', () => { synth.playTap(); sell.group = group; paintQuick(m); });
    tabs.appendChild(b);
  }
  const kids = [head, tabs, paneFor(m, sell.group)];
  if (sell.applied.length) {
    const active = node('div', 'sell-active');
    active.append(node('span', 'sell-active-label', t('sellActive')));
    for (const id of sell.applied) {
      const p = pickOf(id);
      if (!p) continue;
      const tag = node('button', 'sell-tag');
      tag.type = 'button';
      tag.dataset.remove = id;
      if (p.color) tag.style.setProperty('--dot', p.color);
      tag.innerHTML = `${p.color ? '<i class="sell-dot"></i>' : ''}<span></span>${iconSvg('close', { size: 11 })}`;
      if (p.html) tag.querySelector('span').innerHTML = p.label;
      else tag.querySelector('span').textContent = p.label;
      tag.setAttribute('aria-label', t('sellRemovePick', { name: tag.querySelector('span').textContent }));
      tag.addEventListener('click', () => { synth.playTap(); dropPick(id); refresh(m, { side: true }); });
      active.appendChild(tag);
    }
    const clear = node('button', 'sell-tag-clear', t('sellClearPicks'));
    clear.type = 'button';
    clear.dataset.act = 'clearpicks';
    clear.addEventListener('click', () => { synth.playTap(); sell.applied = []; recompute(); refresh(m, { side: true }); });
    active.appendChild(clear);
    kids.push(active);
  }
  m.quick.replaceChildren(...kids);
}

function paintSide(m) {
  paintSafe(m);
  paintQuick(m);
}

function warnLine(text, tone = 'warn', icon = null) {
  const p = node('p', `sell-warn is-${tone}`);
  p.innerHTML = `${iconSvg(icon ?? (tone === 'safe' ? 'shield' : 'flag'), { size: 14 })}<span></span>`;
  p.querySelector('span').textContent = text;
  return p;
}

function paintTools(m) {
  const albums = albumsNow().filter((a) => a.owned > 0);
  const box = node('label', 'sell-searchbox');
  box.innerHTML = iconSvg('search', { size: 15 });
  const search = node('input', 'filter-input sell-search');
  search.type = 'search';
  search.placeholder = t('searchTitles');
  search.setAttribute('aria-label', t('searchTitles'));
  search.value = sell.search;
  let timer = 0;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { sell.search = search.value; paintList(m); }, 150);
  });
  box.appendChild(search);
  m.search = search;
  m.tools.replaceChildren(
    box,
    select([['', t('allRarities')], ...RARITIES.map(rarityItem)], sell.rarity, (v) => { sell.rarity = v; paintList(m); }, t('rarity')),
    select([['', t('allPacks')], ...albums.map(albumItem)], sell.album, (v) => { sell.album = v; paintList(m); }, t('sellByAlbum')),
    select(SORTS.map(([id, key]) => [id, t(key)]), sell.sort, (v) => { sell.sort = v; paintList(m); }, t('pcSortBy'), 'sell-sort'));
}

function paintSelRow(m) {
  const shown = node('span', 'sell-shown tabular', t('sellShown', { n: sell.shown.length.toLocaleString() }));
  const acts = node('span', 'sell-selacts');
  acts.append(
    chip(t('pickAll'), { act: 'all', run: () => {
      for (const k of sell.shown) { const cap = pool(entryOf(k)); if (sum(cap)) { sell.plan.set(k, cap); sell.manual.set(k, cap); } }
      refresh(m);
    } }),
    chip(t('pickInvert'), { act: 'invert', run: () => {
      for (const k of sell.shown) {
        if (sell.plan.has(k)) { sell.plan.delete(k); sell.manual.set(k, {}); }
        else { const cap = pool(entryOf(k)); if (sum(cap)) { sell.plan.set(k, cap); sell.manual.set(k, cap); } }
      }
      refresh(m);
    } }),
    chip(t('pickNone'), { act: 'none', run: () => { clearAll(); refresh(m, { side: true }); } }));
  m.selrow.replaceChildren(shown, acts);
}

function filtersOn() {
  return Boolean(sell.search.trim() || sell.rarity || sell.album);
}

function paintList(m) {
  const list = visibleCards();
  sell.shown = list.map((e) => e.key);
  paintSelRow(m);
  if (!list.length) {
    m.prog.stop();
    const box = node('div', 'sell-empty');
    box.innerHTML = `<span class="sell-empty-ico">${iconSvg(cards().length ? 'search' : 'collection', { size: 26 })}</span>`;
    box.append(node('p', '', cards().length ? t('noMatches') : t('emptyCollection')));
    if (filtersOn()) {
      const reset = node('button', 'btn btn-ghost btn-sm sell-reset', t('sellResetFilters'));
      reset.type = 'button';
      reset.addEventListener('click', () => { synth.playTap(); sell.search = ''; sell.rarity = ''; sell.album = ''; paintTools(m); paintList(m); });
      box.appendChild(reset);
    }
    m.list.replaceChildren(box);
  } else {
    m.prog.set([{ head: null, items: list }], { make: (entry) => rowFor(entry, m) });
  }
  syncPicker(m);
}

function paintBar(m) {
  const plan = [...sell.plan].map(([key, prints]) => ({ key, prints }));
  const value = planValue(plan);
  if (!m.bar.firstChild) {
    m.bar.innerHTML = `
      <span class="sell-total"><b class="tabular"></b><span></span></span>
      <button type="button" class="btn btn-ghost sell-clear"></button>
      <button type="button" class="btn btn-primary sell-go"></button>`;
    const clear = m.bar.querySelector('.sell-clear');
    clear.addEventListener('click', () => { synth.playTap(); clearAll(); refresh(m, { side: true }); });
    const go = m.bar.querySelector('.sell-go');
    press(go, { sound: null });
    go.addEventListener('click', () => confirmSale(m));
  }
  m.bar.querySelector('.sell-total b').innerHTML = money(value.coins);
  m.bar.querySelector('.sell-total span').textContent = value.copies
    ? t('sellBarLine', { copies: value.copies.toLocaleString(), cards: value.cards.toLocaleString() })
    : t('sellBarEmpty');
  const clear = m.bar.querySelector('.sell-clear');
  clear.innerHTML = iconSvg('close', { size: 16 });
  clear.setAttribute('aria-label', t('sellClear'));
  clear.title = t('sellClear');
  clear.hidden = !value.copies;
  const go = m.bar.querySelector('.sell-go');
  go.innerHTML = `${buckSvg({ size: 15 })}<span></span>`;
  go.querySelector('span').textContent = t('sellGo');
  go.disabled = !value.copies;
  m.bar.classList.toggle('is-empty', !value.copies);
}

function refresh(m, { side = false } = {}) {
  if (side) paintQuick(m);
  syncPicker(m);
  paintBar(m);
  for (const other of sell.mounts.values()) {
    if (other === m || !other.root.isConnected) continue;
    if (side) paintQuick(other);
    syncPicker(other);
    paintBar(other);
  }
}

function repaint(m) {
  paintSide(m);
  paintTools(m);
  paintList(m);
  paintBar(m);
  for (const other of sell.mounts.values()) if (other !== m && other.root.isConnected) { paintSide(other); syncPicker(other); paintBar(other); }
}

function warnings(plan) {
  const albums = albumsNow();
  const editions = editionAlbumKeys(albums);
  const complete = completeAlbumKeys(albums);
  const broken = new Map();
  let lastCopies = 0;
  let favorites = 0;
  for (const { key, prints } of plan) {
    const entry = entryOf(key);
    if (!entry) continue;
    if (entry.favorite) favorites++;
    if (sum(prints) >= (entry.count ?? 1)) {
      lastCopies++;
      const ak = albumKeyOf(entry);
      if (editions.has(ak) || complete.has(ak)) broken.set(ak, albums.find((a) => a.key === ak)?.name ?? ak);
    }
  }
  let skipped = 0;
  if (sell.guardFavs && sell.applied.length) {
    const ctx = { albums };
    const favs = cards().filter((e) => e.favorite);
    const seen = new Set();
    for (const id of sell.applied) for (const key of collect(id, ctx, false, favs).keys()) seen.add(key);
    skipped = seen.size;
  }
  return { broken: [...broken.values()], lastCopies, favorites, skipped };
}

function confirmSale(m) {
  const plan = [...sell.plan].map(([key, prints]) => ({ key, prints }));
  const value = planValue(plan);
  if (!value.copies) return;
  const warn = warnings(plan);
  synth.playArm?.();
  openSheet(t('sellConfirmTitle'), (body) => {
    const wrap = node('div', 'sell-confirm');
    const big = node('div', 'sell-confirm-total');
    big.innerHTML = '<span class="sell-confirm-kicker"></span><b class="tabular"></b><span class="sell-confirm-line"></span>';
    big.querySelector('.sell-confirm-kicker').textContent = t('sellConfirmYouGet');
    big.querySelector('b').innerHTML = money(value.coins);
    big.querySelector('.sell-confirm-line').textContent = t('sellSummaryLine', { copies: value.copies.toLocaleString(), cards: value.cards.toLocaleString() });
    wrap.appendChild(big);
    const byRarityRows = new Map();
    for (const { key, prints } of plan) {
      const entry = entryOf(key);
      for (const [rid, n] of Object.entries(prints)) {
        const r = byRarityRows.get(rid) ?? { n: 0, coins: 0 };
        r.n += n;
        r.coins += n * printSellPrice(entry, rid);
        byRarityRows.set(rid, r);
      }
    }
    const table = node('div', 'sell-confirm-rows');
    table.appendChild(node('h3', 'label sell-confirm-label', t('sellConfirmByRarity')));
    for (const [rid, r] of [...byRarityRows].sort((a, b) => rarityRank(b[0]) - rarityRank(a[0]))) {
      const line = node('div', 'sell-confirm-row');
      line.style.setProperty('--rarity', rarityById(rid).color);
      line.style.setProperty('--rarity-text', rarityText(rarityById(rid)));
      line.style.setProperty('--share', `${Math.max(2, Math.round((r.coins / Math.max(1, value.coins)) * 100))}%`);
      line.innerHTML = '<i></i><span class="sell-confirm-name"></span><span class="sell-confirm-n tabular"></span><b class="tabular"></b>';
      line.querySelector('.sell-confirm-name').textContent = tx(rarityById(rid).name);
      line.querySelector('.sell-confirm-n').textContent = t('sellCopies', { n: r.n.toLocaleString() });
      line.querySelector('b').innerHTML = money(r.coins);
      table.appendChild(line);
    }
    wrap.appendChild(table);
    const notes = node('div', 'sell-confirm-notes');
    if (warn.broken.length) notes.appendChild(warnLine(t('sellWarnEdition', { albums: warn.broken.slice(0, 4).join(', ') + (warn.broken.length > 4 ? '…' : '') }), 'danger'));
    if (warn.lastCopies) notes.appendChild(warnLine(t('sellWarnLast', { n: warn.lastCopies }), 'warn'));
    if (warn.favorites) notes.appendChild(warnLine(t('sellWarnFavs', { n: warn.favorites }), 'warn', 'starFilled'));
    if (sell.keep > 0) notes.appendChild(warnLine(t('sellNoteKeep', { n: sell.keep }), 'safe'));
    if (sell.guardFavs) notes.appendChild(warnLine(warn.skipped ? t('sellNoteFavs', { n: warn.skipped }) : t('sellNoteFavsSafe'), 'safe', 'starFilled'));
    if (notes.childElementCount) {
      notes.prepend(node('h3', 'label sell-confirm-label', t('sellConfirmNotes')));
      wrap.appendChild(notes);
    }
    const actions = node('div', 'sell-confirm-actions');
    const cancel = node('button', 'btn btn-ghost sell-confirm-cancel', t('cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', () => { synth.playTap(); live.sheet.hide(); });
    const go = node('button', `btn ${warn.broken.length || warn.lastCopies ? 'btn-danger is-armed' : 'btn-primary'} sell-confirm-go`);
    go.type = 'button';
    go.innerHTML = t('sellConfirmGo', { amount: money(value.coins) });
    press(go, { sound: null });
    go.addEventListener('click', async () => {
      go.disabled = true;
      live.sheet.hide();
      const done = await sellPlan(plan);
      if (!done) return;
      sell.last = done;
      clearAll();
      for (const other of sell.mounts.values()) if (other.root.isConnected) repaint(other);
      showDone(m, done);
    });
    actions.append(cancel, go);
    wrap.appendChild(actions);
    body.appendChild(wrap);
  });
}

function showDone(m, done) {
  const note = node('div', 'sell-done');
  note.setAttribute('role', 'status');
  note.innerHTML = `<i>${iconSvg('check', { size: 16 })}</i><span></span>`;
  note.querySelector('span').innerHTML = t('sellDone', { copies: done.copies.toLocaleString(), cards: done.cards.toLocaleString(), amount: money(done.amount) });
  m.side.querySelectorAll('.sell-done').forEach((old) => old.remove());
  m.side.prepend(note);
  setTimeout(() => note.remove(), 9000);
}

export function renderSellingInto(root, { pc = false } = {}) {
  const m = mount(root, { pc });
  if (sell.pending) {
    const keys = sell.pending;
    sell.pending = null;
    for (const key of keys) {
      const cap = pool(entryOf(key));
      if (sum(cap)) sell.manual.set(key, cap);
    }
  }
  recompute();
  repaint(m);
  return m;
}

export function renderSelling() {
  el.sellingTitle.textContent = t('sellingTitle');
  el.sellingIntro.textContent = t('sellingIntro');
  return renderSellingInto(el.sellingRoot);
}

function columns(m) {
  const cols = getComputedStyle(m.list).gridTemplateColumns.split(' ').filter(Boolean).length;
  return Math.max(1, cols);
}

export function sellingKeys(m, event) {
  if (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f')) { m.search?.focus(); return true; }
  const rows = [...m.list.querySelectorAll('.sell-item')];
  if (!rows.length) return false;
  const at = Math.max(0, rows.indexOf(document.activeElement?.closest?.('.sell-item')));
  const focus = (i) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    r.tabIndex = 0;
    r.focus();
    r.scrollIntoView({ block: 'nearest' });
    if (i >= rows.length - columns(m) * 3) m.prog.more();
  };
  const step = { ArrowDown: columns(m), ArrowUp: -columns(m), ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (step) { focus(at + step); return true; }
  const n = rows[at];
  if (event.key === ' ' && n && document.activeElement === n) { m.picker.toggle(n.dataset.key); return true; }
  if ((event.key === '+' || event.key === '=') && n) { n.querySelector('[data-step="1"]')?.click(); return true; }
  if (event.key === '-' && n) { n.querySelector('[data-step="-1"]')?.click(); return true; }
  if (event.key === 'Enter' && sell.plan.size && document.activeElement?.tagName !== 'BUTTON') { confirmSale(m); return true; }
  return false;
}

export function openSelling({ keys = null } = {}) {
  if (keys?.length) sell.pending = keys;
  if (isPc) {
    import('../pc/shell.js').then((m) => m.goScreen('selling'));
    return;
  }
  renderSelling();
  showScreen('selling');
}

export const sellingPlanSize = () => sell.plan.size;

export const sellingPending = () => Boolean(sell.pending);
