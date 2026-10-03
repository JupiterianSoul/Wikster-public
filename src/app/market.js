import { getLanguage, t, tx } from '../i18n.js';
import * as store from '../collection.js';
import * as account from '../account.js';
import { press } from '../ui/components.js';
import { on } from '../ui/bus.js';
import { h } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { RARITIES, rarityById, rarityOfCard } from '../data/rarities.js';
import { THEME_PACKS } from '../data/packs.js';
import { formatAmount } from '../pricing.js';
import { tune } from '../live.js';
import { el, esc, money, openSheet, refreshWallet, setTickerJob, state, toast } from './core.js';
import { buildStaticCard } from './detail.js';
import { pushNote } from './drawer.js';
import { describeError, signedIn, userId } from './gate.js';
import { live } from './live.js';
import { econMessage, refreshEconomy, serverEconomy } from './econ.js';
import { recall, remember } from './memo.js';
import { shouldNotify, systemNotify } from './notify.js';
import { renderBinder } from './binder.js';

export const MARKET_VIEWS = ['browse', 'selling', 'bidding', 'history'];
export const MARKET_SORTS = ['ending', 'newest', 'price', 'price_desc', 'bids'];
export const DURATIONS = [60, 360, 1440, 4320];
const PAGE = 24;

export const M = {
  view: 'browse',
  sort: 'ending',
  filter: { q: '', rarity: [], theme: '', min: null, max: null, buyout: false, soon: false, others: false },
  lots: [],
  total: 0,
  mine: { selling: null, bidding: null, history: null },
  counts: null,
  skew: 0,
  seq: 0,
  loading: false,
  unsub: null,
  sheet: null,
  wished: new Set()
};

export const now = () => Date.now() + M.skew;
export const leftMs = (lot) => new Date(lot.ends_at).getTime() - now();
export const isOpen = (lot) => lot?.status === 'open' && leftMs(lot) > 0;
export const priceOf = (lot) => lot.current_bid ?? lot.start_price;
export const floorOf = (lot) => {
  if (lot.current_bid == null) return lot.start_price;
  const step = Number(tune('market.step')) || 5;
  return lot.current_bid + Math.max(1, Math.ceil(lot.current_bid * step / 100));
};
export const buyoutLive = (lot) => lot.buyout != null && (lot.current_bid ?? 0) < lot.buyout;
export const feePct = () => Number(tune('market.fee')) || 0;
export const feeOf = (price, pct = feePct()) => Math.min(price, Math.ceil(price * pct / 100));

export function durationLabel(minutes) {
  if (minutes >= 1440 && minutes % 1440 === 0 && minutes > 1440) return t('marketDays', { n: minutes / 1440 });
  return t('marketHours', { n: minutes / 60 });
}

export function fmtLeft(ms) {
  if (ms <= 0) return t('marketEnded');
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${String(sec % 60).padStart(2, '0')}s`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return `${hours}h ${String(min % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function agoText(at) {
  const ms = Math.max(0, now() - new Date(at).getTime());
  const min = Math.floor(ms / 60000);
  if (min < 1) return t('marketJustNow');
  if (min < 60) return t('marketMinsAgo', { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t('marketHoursAgo', { n: hours });
  return new Date(at).toLocaleDateString(getLanguage() === 'fr' ? 'fr-FR' : 'en-GB');
}

export function marketError(error) {
  const code = String(error?.message ?? error ?? '');
  const keys = {
    TOO_LOW: 'marketTooLow', ENDED: 'marketEndedToast', NOT_OVER: 'marketEndedToast', HAS_BIDS: 'marketCancelLocked',
    TOO_MANY: 'marketTooMany', OWN_AUCTION: 'marketOwn', LEADING: 'marketLeadingAlready', NO_BUYOUT: 'marketNoBuyout',
    MARKET_UNSET: 'marketUnset', INSUFFICIENT_FUNDS: 'marketNoFunds', NOT_OWNED: 'marketNotOwned', LOCKED: 'specialLocked',
    BAD_PRICE: 'marketBadPrice', BAD_BUYOUT: 'marketBadBuyout', BAD_DURATION: 'marketBadPrice', SUSPENDED: 'marketSuspended',
    NOT_FOUND: 'marketGone', NOT_LIVE: 'marketNeedsServer', SLOW_DOWN: 'slowDown'
  };
  if (keys[code]) return t(keys[code]);
  if (serverEconomy()) return econMessage(error, t);
  return describeError(error);
}

const me = () => userId();

function stamp(at) {
  const server = Date.parse(at ?? '');
  if (Number.isFinite(server)) M.skew = server - Date.now();
}

function filterSig() {
  return JSON.stringify([M.sort, M.filter]);
}

function serverFilter() {
  const f = M.filter;
  const out = {};
  if (f.q.trim()) out.q = f.q.trim();
  if (f.rarity.length) out.rarity = f.rarity;
  if (f.theme) out.theme = f.theme;
  if (Number.isFinite(f.min) && f.min > 0) out.min = f.min;
  if (Number.isFinite(f.max) && f.max > 0) out.max = f.max;
  if (f.buyout) out.buyout = true;
  if (f.soon) out.soon = true;
  if (f.others) out.others = true;
  return out;
}

export function activeFilters() {
  const f = M.filter;
  return f.rarity.length + (f.theme ? 1 : 0) + (f.min ? 1 : 0) + (f.max ? 1 : 0) + (f.others ? 1 : 0);
}

function listNode() { return el.marketList; }
function toolsNode() { return document.getElementById('market-tools'); }
function moreNode() { return document.getElementById('market-more'); }

export function upsertLot(row) {
  if (!row?.id) return null;
  const merge = (list) => {
    if (!list) return;
    const i = list.findIndex((x) => x.id === row.id);
    if (i >= 0) list[i] = { ...list[i], ...row, mine: list[i].mine ?? row.mine, role: list[i].role };
  };
  merge(M.lots);
  for (const view of Object.keys(M.mine)) merge(M.mine[view]?.rows);
  return findLot(row.id);
}

export function findLot(id) {
  return M.lots.find((x) => x.id === id)
    ?? Object.values(M.mine).flatMap((v) => v?.rows ?? []).find((x) => x.id === id)
    ?? null;
}

function decorate(row) {
  if (!row) return row;
  const self = me();
  return { ...row, mine: row.seller === self, leading: Boolean(self) && row.bidder === self };
}

function ringWishes(rows) {
  let rang = false;
  for (const a of rows) {
    if (a.status !== 'open' || a.seller === me()) continue;
    const key = a.card?.key;
    if (!state.wishlist.has(key) || state.wishSeen.has(a.id)) continue;
    state.wishSeen.add(a.id);
    rang = true;
    pushNote('wish', t('notifWishAuction', { card: a.card?.title ?? '?' }), 'market');
  }
  if (rang) store.saveWishSeen([...state.wishSeen]);
}

export async function loadBrowse({ more = false, quiet = false } = {}) {
  const sig = filterSig();
  const ticket = ++M.seq;
  const list = listNode();
  if (!more && !quiet && M.lots.length) list.classList.add('is-refreshing');
  if (!M.lots.length && !quiet) setStatus(t('marketLoading'), 'is-working');
  M.loading = true;
  try {
    const offset = more ? M.lots.length : 0;
    const res = await account.browseLots(serverFilter(), M.sort, PAGE, offset);
    if (ticket !== M.seq) return;
    stamp(res?.now);
    const rows = (res?.rows ?? []).map(decorate);
    M.lots = more ? [...M.lots, ...rows.filter((r) => !M.lots.some((x) => x.id === r.id))] : rows;
    M.total = Number(res?.total) || M.lots.length;
    if (!more) remember('market.browse', me(), { sig, lots: M.lots.slice(0, PAGE), total: M.total });
    ringWishes(rows);
    setStatus('');
  } catch (error) {
    if (ticket !== M.seq) return;
    setStatus(marketError(error), 'is-error');
  } finally {
    if (ticket === M.seq) {
      M.loading = false;
      list.classList.remove('is-refreshing');
      if (M.view === 'browse') paintList();
    }
  }
}

export async function loadMine(view, { more = false } = {}) {
  const ticket = ++M.seq;
  const list = listNode();
  const had = M.mine[view];
  if (!more && had?.rows?.length) list.classList.add('is-refreshing');
  if (!had) setStatus(t('marketLoading'), 'is-working');
  M.loading = true;
  try {
    const offset = more ? (had?.rows?.length ?? 0) : 0;
    const res = await account.myLots(view, 30, offset);
    if (ticket !== M.seq) return;
    stamp(res?.now);
    const rows = (res?.rows ?? []).map((r) => ({ ...decorate(r), role: r.role }));
    M.mine[view] = { rows: more ? [...(had?.rows ?? []), ...rows] : rows, total: Number(res?.total) || rows.length };
    if (res?.counts) M.counts = res.counts;
    if (!more) remember(`market.mine.${view}`, me(), M.mine[view]);
    remember('market.counts', me(), M.counts);
    setStatus('');
  } catch (error) {
    if (ticket !== M.seq) return;
    setStatus(marketError(error), 'is-error');
  } finally {
    if (ticket === M.seq) {
      M.loading = false;
      list.classList.remove('is-refreshing');
      if (M.view === view) paintList();
      paintTabs();
    }
  }
}

export function reload({ quiet = true } = {}) {
  if (M.view === 'browse') return loadBrowse({ quiet });
  return loadMine(M.view);
}

function setStatus(text, kind = '') {
  el.marketStatus.textContent = text;
  el.marketStatus.className = `find-status${kind ? ` ${kind}` : ''}`;
}

export function renderMarket() {
  el.marketTitle.textContent = t('tabMarket');
  el.marketIntro.textContent = t('marketIntro');
  el.marketSell.innerHTML = `<span>${esc(t('marketSell'))}</span>`;
  const tools = toolsNode();
  const more = moreNode();
  if (more && !more.dataset.bound) {
    more.dataset.bound = '1';
    press(more, { sound: null });
    more.addEventListener('click', moreClicked);
  }
  if (!account.configured || !signedIn()) {
    setStatus(account.configured ? t('marketSignIn') : t('marketOffline'));
    el.marketList.replaceChildren();
    el.marketSell.hidden = true;
    el.marketSeg.parentElement.hidden = true;
    if (tools) tools.hidden = true;
    if (more) more.hidden = true;
    return;
  }
  el.marketSell.hidden = false;
  el.marketSeg.parentElement.hidden = false;
  if (!M.lots.length) {
    const held = recall('market.browse', me());
    if (held?.sig === filterSig()) { M.lots = held.lots ?? []; M.total = held.total ?? 0; }
  }
  for (const view of ['selling', 'bidding', 'history']) if (!M.mine[view]) M.mine[view] = recall(`market.mine.${view}`, me()) ?? null;
  if (!M.counts) M.counts = recall('market.counts', me()) ?? null;
  paintTabs();
  paintTools();
  paintList();
  feedOn();
  reload({ quiet: false });
  if (M.view !== 'selling') loadCounts();
}

let countsAt = 0;
function loadCounts() {
  if (Date.now() - countsAt < 15000) return;
  countsAt = Date.now();
  account.myLots('selling', 1, 0).then((res) => {
    if (res?.counts) { M.counts = res.counts; remember('market.counts', me(), M.counts); paintTabs(); }
  }).catch(() => {});
}

function paintTabs() {
  const c = M.counts ?? {};
  const badge = { selling: c.selling, bidding: (c.leading ?? 0) + (c.outbid ?? 0) };
  el.marketSeg.className = 'market-views ah-tabs';
  el.marketSeg.replaceChildren(...MARKET_VIEWS.map((view) => {
    const chip = h('button.chip.market-view.ah-tab', { type: 'button', dataset: { view } }, t(`marketView_${view}`));
    if (badge[view]) chip.append(h('span.ah-count', String(badge[view])));
    if (view === 'bidding' && c.outbid) chip.classList.add('is-alert');
    chip.classList.toggle('is-on', M.view === view);
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      if (M.view === view) return;
      synth.playTap();
      M.view = view;
      paintTabs();
      paintTools();
      paintList();
      reload({ quiet: false });
    });
    return chip;
  }));
}

function selectNode(options, value, onChange, label) {
  const select = h('select.creator-input.ah-select', { 'aria-label': label });
  for (const [v, text] of options) {
    const opt = h('option', { value: v }, text);
    if (v === value) opt.selected = true;
    select.append(opt);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

export const themeOptions = () => [['', t('marketAllAlbums')], ...THEME_PACKS.map((p) => [p.id, tx(p.name)]), ['wild', t('marketWildAlbum')]];

let searchTimer = null;
function paintTools() {
  const tools = toolsNode();
  if (!tools) return;
  if (M.view !== 'browse') { tools.hidden = true; tools.replaceChildren(); return; }
  tools.hidden = false;
  const input = h('input.creator-input.market-search.ah-search', {
    type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: t('marketSearch'), 'aria-label': t('marketSearch'), value: M.filter.q
  });
  input.addEventListener('input', () => {
    M.filter.q = input.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadBrowse(), 300);
  });
  const toggle = (key, label) => {
    const chip = h('button.chip.ah-toggle', { type: 'button', dataset: { toggle: key } }, label);
    chip.classList.toggle('is-on', Boolean(M.filter[key]));
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      synth.playTap();
      M.filter[key] = !M.filter[key];
      chip.classList.toggle('is-on', M.filter[key]);
      loadBrowse();
    });
    return chip;
  };
  const n = activeFilters();
  const filters = h('button.chip.ah-filters', { type: 'button', dataset: { filters: '1' } },
    n ? t('marketFiltersOn', { n }) : t('marketFilters'));
  filters.classList.toggle('is-on', n > 0);
  press(filters, { sound: null });
  filters.addEventListener('click', () => { synth.playTap(); openFilterSheet(); });
  const sort = selectNode(MARKET_SORTS.map((s) => [s, t(`marketSort_${s}`)]), M.sort, (v) => {
    M.sort = v;
    synth.playTap();
    loadBrowse();
  }, t('marketSortLabel'));
  sort.dataset.sort = '1';
  tools.replaceChildren(
    input,
    h('div.ah-chips', filters, toggle('buyout', t('marketOnlyBuyout')), toggle('soon', t('marketEndingSoon')), sort)
  );
}

function openFilterSheet() {
  const draft = JSON.parse(JSON.stringify(M.filter));
  openSheet(t('marketFilters'), (body) => {
    const rarities = h('div.ah-rarities');
    const paintRarities = () => rarities.replaceChildren(...RARITIES.map((r) => {
      const chip = h('button.chip.ah-rarity', { type: 'button', dataset: { rarity: r.id }, style: { '--r': r.color } }, tx(r.name));
      chip.classList.toggle('is-on', draft.rarity.includes(r.id));
      press(chip, { sound: null });
      chip.addEventListener('click', () => {
        synth.playTap();
        draft.rarity = draft.rarity.includes(r.id) ? draft.rarity.filter((x) => x !== r.id) : [...draft.rarity, r.id];
        paintRarities();
      });
      return chip;
    }));
    paintRarities();
    const album = selectNode(themeOptions(), draft.theme, (v) => { draft.theme = v; }, t('marketAlbum'));
    album.dataset.album = '1';
    const num = (value, name) => {
      const input = h('input.creator-input.ah-num', { type: 'number', inputmode: 'numeric', min: '0', step: '1', placeholder: t('marketAny'), dataset: { range: name } });
      if (value) input.value = String(value);
      input.addEventListener('input', () => {
        const v = Math.floor(Number(input.value));
        draft[name] = Number.isFinite(v) && v > 0 ? v : null;
      });
      return input;
    };
    const others = h('button.chip.ah-toggle', { type: 'button' }, t('marketHideMine'));
    others.classList.toggle('is-on', draft.others);
    press(others, { sound: null });
    others.addEventListener('click', () => { draft.others = !draft.others; others.classList.toggle('is-on', draft.others); synth.playTap(); });
    const apply = h('button.btn.btn-primary.btn-block', { type: 'button', dataset: { apply: '1' } }, t('marketApply'));
    const reset = h('button.btn.btn-ghost.btn-block', { type: 'button' }, t('marketReset'));
    press(apply, { sound: null });
    press(reset, { sound: null });
    apply.addEventListener('click', () => {
      synth.playTap();
      M.filter = { ...M.filter, rarity: draft.rarity, theme: draft.theme, min: draft.min, max: draft.max, others: draft.others };
      live.sheet.hide();
      paintTools();
      loadBrowse();
    });
    reset.addEventListener('click', () => {
      synth.playTap();
      M.filter = { ...M.filter, rarity: [], theme: '', min: null, max: null, others: false };
      live.sheet.hide();
      paintTools();
      loadBrowse();
    });
    body.append(h('div.ah-filter-sheet',
      h('p.label', t('marketRarity')), rarities,
      h('p.label', t('marketAlbum')), album,
      h('p.label', t('marketPriceRange')), h('div.ah-range', num(draft.min, 'min'), h('span', '-'), num(draft.max, 'max')),
      h('div.ah-chips', others),
      h('div.ah-actions', apply, reset)));
  });
}

function bandOf(lot) {
  if (lot.role) {
    const paid = money(lot.paid ?? 0);
    const price = money(lot.current_bid ?? lot.start_price);
    switch (lot.role) {
      case 'leading': return { html: esc(t('marketLead')), cls: 'is-good' };
      case 'outbid': return { html: esc(t('marketOutbidBand')), cls: 'is-bad' };
      case 'selling': return lot.bidder ? { html: esc(t('marketHasBids')), cls: 'is-good' } : { html: esc(t('marketYours')), cls: '' };
      case 'won': return { html: t('marketWonFor', { amount: price }), cls: 'is-good' };
      case 'lost': return { html: t('marketLostAt', { amount: price }), cls: 'is-bad' };
      case 'sold': return { html: t('marketSoldFor', { amount: price, paid }), cls: 'is-good' };
      case 'expired': return { html: esc(t('marketUnsold')), cls: '' };
      case 'pulled': return { html: esc(t('marketPulled')), cls: 'is-bad' };
      default: return { html: esc(t('marketWithdrawn')), cls: '' };
    }
  }
  if (lot.mine) return { html: esc(t('marketYours')), cls: '' };
  if (lot.leading) return { html: esc(t('marketLead')), cls: 'is-good' };
  return null;
}

export function lotTile(lot) {
  const rarity = rarityOfCard({ ...lot.card, rarityId: lot.rarity ?? lot.card?.rarityId });
  const tile = h('div.auction-tile.ah-lot', { dataset: { id: lot.id } });
  tile.classList.toggle('is-pending', Boolean(lot.pending));
  const band = bandOf(lot);
  if (band) tile.append(h(`span.auction-band.ah-band${band.cls ? `.${band.cls}` : ''}`, { html: band.html }));
  const card = buildStaticCard({ ...lot.card, rarityId: rarity?.id ?? lot.card?.rarityId }, rarity, null, { fav: false, ownedTag: true });
  card.addEventListener('click', () => { synth.playTap(); openLot(lot.id); });
  tile.append(card);
  const open = lot.status === 'open';
  const info = h('div.auction-info.ah-info');
  info.innerHTML = `
    <span class="auction-bid ah-price">${money(priceOf(lot))}</span>
    ${open ? `<span class="auction-time market-time ah-time" data-ends="${esc(lot.ends_at)}">${esc(fmtLeft(leftMs(lot)))}</span>` : `<span class="ah-time">${esc(agoText(lot.settled_at ?? lot.ends_at))}</span>`}
    <span class="auction-sub ah-sub">${esc(lot.bid_count > 1 ? t('marketBids', { n: lot.bid_count }) : lot.bid_count === 1 ? t('marketBidOne') : t('marketNoBids'))}</span>
    ${open && buyoutLive(lot) ? `<span class="ah-buy">${t('marketBuyoutShort', { amount: money(lot.buyout) })}</span>` : `<span class="auction-sub is-seller">${esc(lot.mine ? t('marketYours') : (lot.seller_name || '?'))}</span>`}`;
  info.addEventListener('click', () => { synth.playTap(); openLot(lot.id); });
  tile.append(info);
  return tile;
}

function rowsNow() {
  if (M.view === 'browse') return M.lots.filter((l) => l.status === 'open');
  return M.mine[M.view]?.rows ?? [];
}

export function paintList() {
  const rows = rowsNow();
  const more = moreNode();
  if (!rows.length) {
    el.marketList.replaceChildren(h('p.empty-note', M.loading ? t('marketLoading') : t(`marketEmpty_${M.view}`)));
  } else {
    el.marketList.replaceChildren(...rows.map(lotTile));
  }
  const total = M.view === 'browse' ? M.total : (M.mine[M.view]?.total ?? 0);
  if (more) {
    more.hidden = rows.length >= total || !rows.length;
    more.textContent = t('marketMore', { n: Math.max(0, total - rows.length) });
  }
  tick();
}

let settleTimer = null;
export function tick() {
  if (!el.marketList) return;
  let ended = false;
  for (const cell of document.querySelectorAll('#screen-market [data-ends], #sheet [data-ends]')) {
    const left = new Date(cell.dataset.ends).getTime() - now();
    cell.textContent = fmtLeft(left);
    cell.classList.toggle('is-closing', left > 0 && left < 60000);
    if (left <= 0) ended = true;
  }
  if (ended && !settleTimer) {
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (state.tab === 'market') reload();
      if (M.sheet?.isConnected) import('./marketlot.js').then((m) => m.refreshLot()).catch(() => {});
    }, 1500);
  }
}

function feedOn() {
  setTickerJob('market', tick);
  if (M.unsub) return;
  M.unsub = account.openMarketLive((row, type) => heardRow(row, type));
}

function feedOff() {
  setTickerJob('market', null);
  M.unsub?.();
  M.unsub = null;
}

on('screen', (name) => { if (name !== 'market') feedOff(); });

function heardRow(row, type) {
  if (!row?.id) return;
  if (type === 'DELETE') {
    M.lots = M.lots.filter((x) => x.id !== row.id);
    paintList();
    return;
  }
  const lot = decorate(row);
  const known = findLot(lot.id);
  if (known) {
    upsertLot(lot);
    if (lot.status !== 'open' && M.view === 'browse') M.lots = M.lots.filter((x) => x.id !== lot.id);
    if (state.tab === 'market') paintList();
  } else if (type === 'INSERT' && M.view === 'browse' && M.sort === 'newest' && !activeFilters() && !M.filter.q && !M.filter.buyout && !M.filter.soon) {
    M.lots = [lot, ...M.lots];
    M.total += 1;
    if (state.tab === 'market') paintList();
  }
  if (M.sheet?.isConnected && M.sheet.dataset.id === lot.id) {
    import('./marketlot.js').then((m) => m.heardLot(lot)).catch(() => {});
  }
}

let refreshTimer = null;
export function heardNote(payload) {
  const p = payload ?? {};
  const card = p.title ?? '?';
  const lines = {
    outbid: ['is-bad', t('notifOutbid', { card, amount: formatAmount(p.amount ?? 0) }), 'market'],
    won: ['is-good', t('notifWon', { card, amount: formatAmount(p.amount ?? 0) }), 'binder'],
    sold: ['is-good', t('notifSold', { card, amount: formatAmount(p.amount ?? 0), paid: formatAmount(p.paid ?? 0) }), 'market'],
    expired: ['', t('notifExpired', { card }), 'binder'],
    pulled: ['is-bad', t('notifPulled', { card }), 'binder'],
    refund: ['', t('notifRefund', { card }), 'market']
  };
  const line = lines[p.kind];
  if (!line) return;
  pushNote('trade', line[1], line[2]);
  toast(esc(line[1]), p.kind === 'outbid' || p.kind === 'pulled' ? 'info' : 'ok');
  if (p.kind === 'won' || p.kind === 'sold') synth.playResolved();
  if (shouldNotify()) systemNotify(t('tabMarket'), line[1], `lot:${p.id ?? ''}`);
  if (p.kind === 'won') bumpProfile('auctionsWon', 1);
  if (p.kind === 'sold') bumpProfile('auctionsSold', 1, p.paid);
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await refreshEconomy().catch(() => {});
    refreshWallet();
    if (p.kind !== 'outbid' && p.kind !== 'refund') renderBinder();
    countsAt = 0;
    if (state.tab === 'market') { reload(); loadCounts(); }
  }, 400);
  const lot = p.id ? findLot(p.id) : null;
  if (lot && p.kind === 'outbid') { lot.leading = false; if (lot.role === 'leading') lot.role = 'outbid'; if (state.tab === 'market') paintList(); }
}

function bumpProfile(key, n, best = null) {
  state.profile[key] = (state.profile[key] ?? 0) + n;
  if (best != null && Number(best) > (state.profile.auctionBest ?? 0)) state.profile.auctionBest = Number(best);
  store.saveProfile(state.profile);
}

export function moreClicked() {
  synth.playTap();
  if (M.view === 'browse') loadBrowse({ more: true, quiet: true });
  else loadMine(M.view, { more: true });
}

export function showView(view) {
  if (!MARKET_VIEWS.includes(view)) return;
  M.view = view;
  if (state.tab === 'market') { paintTabs(); paintTools(); paintList(); }
}

export function openLot(id) {
  return import('./marketlot.js').then((m) => m.openLot(id));
}

export function openSellSheet() {
  return import('./marketsell.js').then((m) => m.openSellSheet());
}

export function panelCounts() {
  const c = M.counts ?? recall('market.counts', me()) ?? {};
  return { selling: c.selling ?? 0, bidding: (c.leading ?? 0) + (c.outbid ?? 0) };
}

export function rarityName(id) {
  const r = rarityById(id);
  return r ? tx(r.name) : String(id ?? '');
}
