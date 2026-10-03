import { paintAds } from './support.js';
import { captureError } from './errors.js';
import { getLanguage, t, tx } from '../i18n.js';
import { seasonAt, seasonSpec } from '../season.js';
import { crateReel, formatCountdown, generateShop, liveShelf, rollCrate } from '../shop.js';
import { activeEvents, eventGiftOf, eventTitle, liveVersion } from '../live.js';
import { timedSpec } from '../timed.js';
import { CUSTOM_CARD_RANGE, CUSTOM_QTY_RANGE, TODAY_CARDS, boosterPrice, cratePriceAt, shopPrice, todayPrice, freeWindowAt, windowIndexAt } from '../economy.js';
import { dayBefore as readDayBefore } from '../days.js';
import { utcDateText } from '../days.js';
import { formatAmount } from '../pricing.js';
import { press, reveal } from '../ui/components.js';
import * as store from '../collection.js';
import { rarityById, rarityRank, rarityText } from '../data/rarities.js';
import { specColours, specId, specName } from '../booster.js';
import { iconSvg } from '../data/icons.js';
import { synth } from '../ui/sound.js';
import { reportQuest } from './arcade.js';
import { freeNoteText, payStipend, tickRestock } from './stipend.js';
import { el, esc, ink, money, openSheet, refreshWallet, settings, showScreen, state, toast } from './core.js';
import { h } from '../ui/dom.js';
import { live } from './live.js';
import { ensureReady, gainBooster } from './open.js';
import { econ, econMessage, serverEconomy } from './econ.js';
import { buildBooster, renderPacks } from './packs.js';
import { pending } from './pending.js';
import { hideNsfw, matureAllowed, packHidden } from './mature.js';
import { keeper } from './keep.js';

let shopBuilt = false;
export const shopIsBuilt = () => shopBuilt;

const shopKeep = keeper(() => JSON.stringify([
  windowIndexAt(), freeWindowAt(), state.profile?.shopBought, state.profile?.freeTaken, state.profile?.todayBought,
  state.profile?.liveBought, state.profile?.eventsClaimed, (state.customPacks ?? []).map((p) => p.id), liveVersion(),
  readDayBefore(), seasonAt().key, hideNsfw(), matureAllowed()
]));

export function showShop() {
  if (shopBuilt && shopKeep.fresh()) {
    el.shopPurse.innerHTML = money(state.wallet);
    shopSafe('ads', paintAds);
    if (paintedWallet !== state.wallet) repaintShop();
    tickRestock();
    return;
  }
  renderShop();
}

export function renderShop() {
  shopBuilt = true;
  el.shopTitle.textContent = t('tabShop');
  el.shopPurseLabel.textContent = t('shopPurse');
  el.shopRestockLabel.textContent = t('shopRestockIn');
  el.shopPurse.innerHTML = money(state.wallet);
  shopSafe('ads', paintAds);

  shopPainters.length = 0;
  const market = shopMarket();
  const sections = [
    () => buildFeatured(market.featured),
    () => buildLiveStall(),
    () => buildTodayStall(),
    () => buildSeasonStall(),
    () => buildShopSection({
      title: t('shopFreeRow'), note: freeNoteText(), noteAttr: 'data-free-note',
      body: shopGrid(market.free.map((item) => shopTile(item, { free: true })))
    }),
    () => buildShopSection({
      title: t('shopSubjects'), note: t('shopSubjectsNote'),
      body: shopGrid(market.subjects.map((item) => shopTile(item)))
    }),
    () => buildShopSection({ title: t('shopPress'), note: t('shopPressNote'), body: buildPress(market.press) }),
    () => buildShopSection({
      title: t('shopBundles'), note: t('shopBundlesNote'),
      body: shopGrid(market.bundles.map((item) => bundleTile(item)))
    }),
    () => buildShopSection({ title: t('shopCrate'), note: t('shopCrateNote'), body: buildCrateStall() }),
    () => buildAtelierDoor(),
    () => {
      const customs = market.customs.filter((item) => !packHidden(item.spec));
      return customs.length
        ? buildShopSection({
            title: t('shopCustomRow'), note: t('shopSizeNote'),
            body: sizedGrid(customs.map((item) => customTile(item)))
          })
        : null;
    }
  ].map((build, i) => shopSafe(`section ${i}`, build));
  el.shopMarket.replaceChildren(...sections.filter(Boolean));
  reveal(el.shopMarket.children, { step: 60 });
  tickRestock();
  paintedWallet = state.wallet;
  shopKeep.mark();
}
export function shopSafe(where, build) {
  try {
    return build();
  } catch (error) {
    captureError('shop', `${where}: ${error?.message ?? error}`, error?.stack ?? '');
    return null;
  }
}

export function shopMarket() {
  try {
    return generateShop(windowIndexAt(), Array.isArray(state.customPacks) ? state.customPacks : [], freeWindowAt());
  } catch (error) {
    captureError('shop', `market: ${error?.message ?? error}`, error?.stack ?? '');
    return generateShop(windowIndexAt(), [], freeWindowAt());
  }
}

export function buildTodayStall() {
  const day = readDayBefore();
  const spec = { kind: 'today', day, cards: TODAY_CARDS };
  const bought = state.profile.todayBought === day;
  const sec = document.createElement('section');
  sec.className = 'shop-sec shop-today';
  sec.innerHTML = `<div class="shop-sec-head"><h3></h3></div><p class="shop-sec-note"></p>`;
  sec.querySelector('h3').textContent = t('todayBooster');
  sec.querySelector('.shop-sec-note').textContent = t('todayNote');

  const tile = document.createElement('div');
  tile.className = 'shop-tile is-today';
  tile.dataset.spec = specId(spec);
  const art = document.createElement('div');
  art.className = 'shop-tile-art';
  art.appendChild(buildBooster(spec, { size: 'is-tiny' }));
  const name = document.createElement('p');
  name.className = 'shop-tile-name';
  name.textContent = t('todayFor', { day: utcDateText(Date.parse(`${day}T12:00:00Z`), getLanguage()) });
  const meta = document.createElement('p');
  meta.className = 'shop-tile-meta';
  meta.textContent = t('todayMeta', { n: TODAY_CARDS });
  tile.append(art, name, meta, oddsChip(spec));

  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy';
  press(buy, { sound: null });
  const paint = () => {
    const done = state.profile.todayBought === day;
    buy.disabled = done;
    buy.classList.toggle('is-out', done);
    buy.classList.toggle('is-poor', !done && todayPrice() > state.wallet);
    buy.innerHTML = done
      ? `<span class="buy-label">${esc(t('todayBought'))}</span>`
      : `<span class="buy-label">${esc(t('buy'))}</span><span class="buy-price">${money(todayPrice())}</span>`;
  };
  paint();
  shopPainters.push(paint);
  buy.addEventListener('click', async () => {
    if (state.profile.todayBought === day) return;
    if (!(await purchase(spec, todayPrice(), buy))) return;
    if (!serverEconomy()) {
      state.profile.todayBought = day;
      store.saveProfile(state.profile);
    }
    paint();
  });
  tile.appendChild(buy);
  sec.appendChild(shopGrid([tile]));
  if (bought) tile.classList.add('is-bought-today');
  return sec;
}

export function buildSeasonStall({ inSeasonScreen = false } = {}) {
  const current = seasonAt();
  const { season } = current;
  const items = [
    { id: specId(seasonSpec(season)), spec: seasonSpec(season), price: shopPrice(boosterPrice(seasonSpec(season)), seasonSpec(season), 'season') },
    { id: specId(seasonSpec(season, { rarityId: 'rare' })), spec: seasonSpec(season, { rarityId: 'rare' }), price: shopPrice(boosterPrice(seasonSpec(season, { rarityId: 'rare' })), seasonSpec(season, { rarityId: 'rare' }), 'season') }
  ];
  const until = utcDateText(current.endsAt - 1, getLanguage());
  const sec = buildShopSection({
    title: inSeasonScreen ? tx(season.name) : t('shopSeasonRow', { name: tx(season.name) }),
    note: t('seasonShopNote', { date: until }),
    body: shopGrid(items.map((item) => shopTile(item)))
  });
  sec.classList.add('shop-season');
  sec.style.setProperty('--season-accent', season.accent);
  return sec;
}

function buildAtelierDoor() {
  const sec = buildShopSection({ title: t('tabAtelier'), note: t('shopAtelierNote'), body: h('div.atelier-door-row') });
  sec.classList.add('shop-atelier');
  const row = sec.querySelector('.atelier-door-row');
  row.innerHTML = `<span class="atelier-door-ink"></span>`;
  row.querySelector('.atelier-door-ink').innerHTML = ink(state.ink);
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn btn-sm btn-primary';
  go.textContent = t('shopAtelierGo');
  press(go, { sound: null });
  go.addEventListener('click', () => { synth.playTap(); import('./atelier.js').then((m) => { showScreen('atelier'); m.renderAtelier(); }); });
  row.appendChild(go);
  return sec;
}

export const shopPainters = [];

let paintedWallet = null;

export function repaintShop() {
  paintedWallet = state.wallet;
  for (const paint of shopPainters) { try { paint(); } catch {} }
}

export function stockLeft(item) {
  if (String(item?.id ?? '').startsWith('live|')) {
    const mine = Number(state.profile?.liveBought?.[item.id]) || 0;
    return Math.max(0, Math.min(item.stock ?? Infinity, (item.perPlayer ?? Infinity) - mine));
  }
  if (!item || item.stock == null || item.stock === Infinity) return Infinity;
  return Math.max(0, item.stock - store.shopBought(state.profile, item.id));
}

export function buildShopSection({ title, note = '', noteAttr = '', body }) {
  const sec = document.createElement('section');
  sec.className = 'shop-sec';
  sec.innerHTML = `<div class="shop-sec-head"><h3></h3></div>${note ? `<p class="shop-sec-note" ${noteAttr}></p>` : ''}`;
  sec.querySelector('h3').textContent = title;
  if (note) sec.querySelector('.shop-sec-note').textContent = note;
  sec.appendChild(body);
  return sec;
}

export function shopGrid(tiles) {
  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  grid.replaceChildren(...tiles);
  return grid;
}

export function sizedGrid(tiles) {
  const grid = shopGrid(tiles);
  grid.classList.add('is-sized');
  return grid;
}

export function stockPill(item) {
  const pill = document.createElement('span');
  pill.className = 'shop-stock';
  const paint = () => {
    const left = stockLeft(item);
    pill.hidden = left === Infinity;
    pill.classList.toggle('is-out', left === 0);
    pill.classList.toggle('is-last', left === 1);
    pill.textContent = left === 0 ? t('shopSoldOut') : left === 1 ? t('shopOnlyOne') : t('shopStockLeft', { n: left });
  };
  paint();
  shopPainters.push(paint);
  return pill;
}

export function buyButton(spec, price, { count = 1, after = null, item = null, label = null } = {}) {
  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy';
  press(buy, { sound: null });
  const paint = () => {
    const left = stockLeft(item);
    buy.disabled = left <= 0;
    buy.classList.toggle('is-out', left <= 0);
    buy.classList.toggle('is-poor', left > 0 && price > state.wallet);
    buy.innerHTML = left <= 0
      ? `<span class="buy-label">${esc(t('shopSoldOut'))}</span>`
      : `<span class="buy-label">${esc(label ?? t('buy'))}</span><span class="buy-price">${money(price)}</span>`;
  };
  paint();
  shopPainters.push(paint);
  buy.addEventListener('click', async () => { if (await purchase(spec, price, buy, count, item)) after?.(); });
  return buy;
}

export function oddsChip(specs, { crate = false } = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'odds-chip';
  chip.innerHTML = `${iconSvg('gem', { size: 12 })}<span>${esc(t('oddsShort'))}</span>`;
  chip.setAttribute('aria-label', t('pullRates'));
  press(chip, { sound: null });
  chip.addEventListener('click', (event) => {
    event.stopPropagation();
    synth.playTap();
    import('./daily.js').then((m) => (crate ? m.openCrateOdds((state.customPacks ?? []).length) : m.openOddsFor([].concat(specs))));
  });
  return chip;
}

export function paintTileMeta(node, spec) {
  const tier = spec.rarityId ? rarityById(spec.rarityId) : null;
  node.textContent = tier
    ? `${t('shopItemMeta', { n: spec.cards })} · ${tx(tier.name)}`
    : t('shopItemMeta', { n: spec.cards });
  if (tier) node.style.color = rarityText(tier);
}

export function shopTile(item, { free = false } = {}) {
  const { id, spec, price } = item;
  const tile = document.createElement('div');
  tile.className = 'shop-tile';
  tile.dataset.spec = id;

  const art = document.createElement('div');
  art.className = 'shop-tile-art';
  art.appendChild(buildBooster(spec, { size: 'is-tiny' }));
  tile.appendChild(art);

  const name = document.createElement('p');
  name.className = 'shop-tile-name';
  name.textContent = specName(spec);
  tile.appendChild(name);

  const meta = document.createElement('p');
  meta.className = 'shop-tile-meta';
  paintTileMeta(meta, spec);
  tile.appendChild(meta);
  tile.appendChild(oddsChip(spec));

  if (free) {
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'buy is-free';
    press(buy, { sound: null });
    paintFreeButton(buy, id, spec);
    tile.appendChild(buy);
  } else {
    tile.appendChild(stockPill(item));
    tile.appendChild(buyButton(spec, price, { item }));
  }
  return tile;
}

export function buildFeatured(item) {
  const { spec, price, fullPrice, pct } = item;
  const colours = specColours(spec);
  const sec = document.createElement('section');
  sec.className = 'shop-feature panel';
  sec.style.setProperty('--accent', colours.accent);
  sec.style.setProperty('--accent2', colours.accent2);
  sec.innerHTML = `
    <span class="shop-feature-shine" aria-hidden="true"></span>
    <span class="shop-feature-tag">-${pct}%</span>
    <div class="shop-feature-art"></div>
    <div class="shop-feature-copy">
      <span class="label"></span>
      <h3></h3>
      <p class="shop-feature-meta"></p>
      <p class="shop-feature-prices"><s></s><b class="shop-feature-save"></b></p>
      <p class="shop-feature-foot"><span class="shop-feature-clock" data-feature-clock></span></p>
    </div>`;
  sec.querySelector('.shop-feature-art').appendChild(buildBooster(spec, { size: 'is-small' }));
  sec.querySelector('.label').textContent = t('shopDeal');
  sec.querySelector('h3').textContent = specName(spec);
  paintTileMeta(sec.querySelector('.shop-feature-meta'), spec);
  sec.querySelector('s').innerHTML = money(fullPrice);
  sec.querySelector('.shop-feature-save').innerHTML = t('shopSave', { amount: money(fullPrice - price) });
  sec.querySelector('.shop-feature-foot').prepend(stockPill(item));
  sec.querySelector('.shop-feature-foot').appendChild(oddsChip(spec));
  sec.appendChild(buyButton(spec, price, { item }));
  return sec;
}

export function buildPress(items) {
  const list = document.createElement('div');
  list.className = 'press';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'shop-sec-note';
    empty.textContent = t('shopPressEmpty');
    list.appendChild(empty);
    return list;
  }
  list.replaceChildren(...items.map((item) => {
    const { id, spec, price, plain, rarity } = item;
    const row = document.createElement('div');
    row.className = 'press-plate';
    row.dataset.spec = id;
    row.style.setProperty('--tier', rarity.color);
    row.style.setProperty('--tier-text', rarityText(rarity));
    row.innerHTML = `
      <span class="press-foil" aria-hidden="true"></span>
      <div class="press-head">
        <span class="press-gem">${iconSvg('gem', { size: 20 })}</span>
        <div class="press-copy"><b></b><span class="press-tier"></span></div>
      </div>
      <ul class="press-facts">
        <li class="is-promise"><span class="press-dot"></span><span></span></li>
        <li data-drop="2"><span class="press-dot"></span><span></span></li>
        <li data-drop="1"><span class="press-dot"></span><span></span></li>
      </ul>
      <div class="press-foot"><span class="press-run"></span></div>`;
    row.querySelector('b').textContent = specName(spec);
    row.querySelector('.press-tier').textContent = tx(rarity.name).toUpperCase();
    const facts = row.querySelectorAll('.press-facts li > span:last-child');
    facts[0].textContent = t('shopPressGuarantee', { rarity: tx(rarity.name) });
    facts[1].textContent = t('shopPressRow', { n: spec.cards, rarity: tx(rarity.name) });
    facts[2].textContent = t('shopPressWorth', { x: String(Math.round((1 + rarity.bonusPct / 100) * 10) / 10).replace(/\.0$/, '') });
    const run = row.querySelector('.press-run');
    run.textContent = t('shopPressRun', { n: item.stock });
    row.querySelector('.press-foot').appendChild(stockPill(item));
    row.querySelector('.press-foot').appendChild(oddsChip(spec));
    const buy = buyButton(spec, price, { item });
    if (price > plain) buy.title = t('shopPressPremium', { pct: Math.round(((price - plain) / plain) * 100) });
    row.appendChild(buy);
    return row;
  }));
  return list;
}

export function bundleTile(item) {
  const { id, specs, mixed, pct, full, price } = item;
  const tile = document.createElement('div');
  tile.className = 'shop-tile is-bundle';
  tile.dataset.spec = id;
  const art = document.createElement('div');
  art.className = 'shop-tile-art shop-tile-stack';
  const shown = specs.slice(0, 3);
  art.style.setProperty('--n', String(shown.length));
  shown.forEach((spec, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'shop-tile-stack-item';
    wrap.style.setProperty('--i', String(i));
    wrap.appendChild(buildBooster(spec, { size: 'is-tiny' }));
    art.appendChild(wrap);
  });
  if (specs.length > shown.length) {
    const more = document.createElement('span');
    more.className = 'shop-tile-stack-more tabular';
    more.textContent = `+${specs.length - shown.length}`;
    art.appendChild(more);
  }
  tile.appendChild(art);
  const name = document.createElement('p');
  name.className = 'shop-tile-name';
  name.textContent = mixed ? t('shopBundleMixed', { n: specs.length }) : t('shopBundleSame', { name: specName(specs[0]), n: specs.length });
  tile.appendChild(name);
  const list = document.createElement('ul');
  list.className = 'shop-bundle-list';
  const seen = new Map();
  for (const spec of specs) {
    const key = specId(spec);
    seen.set(key, { spec, n: (seen.get(key)?.n ?? 0) + 1 });
  }
  list.replaceChildren(...[...seen.values()].map(({ spec, n }) => {
    const li = document.createElement('li');
    const tier = spec.rarityId ? rarityById(spec.rarityId) : null;
    li.innerHTML = `<b></b><span></span>`;
    li.querySelector('b').textContent = `${n > 1 ? `${n}× ` : ''}${specName(spec)}`;
    li.querySelector('span').textContent = tier ? `${t('shopItemMeta', { n: spec.cards })} · ${tx(tier.name)}` : t('shopItemMeta', { n: spec.cards });
    if (tier) li.querySelector('span').style.color = rarityText(tier);
    return li;
  }));
  tile.appendChild(list);
  tile.appendChild(oddsChip(specs));
  const deal = document.createElement('p');
  deal.className = 'shop-bundle-deal';
  deal.innerHTML = `<s>${money(full)}</s><b>${t('shopSave', { amount: money(full - price) })}</b>`;
  tile.appendChild(deal);
  const tag = document.createElement('span');
  tag.className = 'shop-tile-tag';
  tag.textContent = `-${pct}%`;
  tile.appendChild(tag);
  tile.appendChild(stockPill(item));
  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy';
  press(buy, { sound: null });
  const paint = () => {
    const left = stockLeft(item);
    buy.disabled = left <= 0;
    buy.classList.toggle('is-out', left <= 0);
    buy.classList.toggle('is-poor', left > 0 && price > state.wallet);
    buy.innerHTML = left <= 0
      ? `<span class="buy-label">${esc(t('shopSoldOut'))}</span>`
      : `<span class="buy-label">${esc(t('buy'))}</span><span class="buy-price">${money(price)}</span>`;
  };
  paint();
  shopPainters.push(paint);
  buy.addEventListener('click', () => purchaseBundle(item, buy));
  tile.appendChild(buy);
  return tile;
}

export const CRATE_ID = 'crate';

export function crateBoughtNow() {
  return (store.shopBought(state.profile, CRATE_ID));
}

export function cratePriceNow() {
  return (cratePriceAt(crateBoughtNow()));
}

export function buildCrateStall() {
  const stall = document.createElement('div');
  stall.className = 'shop-crate panel';
  stall.innerHTML = `
    <div class="shop-crate-art"><span class="shop-crate-box">${iconSvg('gift', { size: 40 })}</span></div>
    <div class="shop-crate-copy">
      <h3></h3>
      <p class="shop-tile-meta"></p>
      <p class="shop-crate-next tabular"></p>
    </div>`;
  stall.querySelector('h3').textContent = t('shopCrateName');
  stall.querySelector('.shop-tile-meta').textContent = t('shopCrateAny');
  stall.querySelector('.shop-crate-copy').appendChild(oddsChip([], { crate: true }));
  const next = stall.querySelector('.shop-crate-next');
  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy is-crate';
  press(buy, { sound: null });
  const paint = () => {
    const price = cratePriceNow();
    const bought = crateBoughtNow();
    buy.classList.toggle('is-poor', price > state.wallet);
    buy.innerHTML = `<span class="buy-label">${esc(t('shopCrateRoll'))}</span><span class="buy-price">${money(price)}</span>`;
    next.innerHTML = bought
      ? t('shopCrateBoughtNext', { n: bought, amount: money(cratePriceAt(bought + 1)) })
      : t('shopCrateNext', { amount: money(cratePriceAt(1)) });
  };
  paint();
  shopPainters.push(paint);
  buy.addEventListener('click', () => openCrate(buy));
  stall.appendChild(buy);
  return stall;
}

const NEWS_KINDS = ['drop_rate', 'price', 'xp'];

export function liveNews() {
  return activeEvents().filter((e) => NEWS_KINDS.includes(e.kind) && eventTitle(e, getLanguage()));
}

export function eventGiftTile(event) {
  const gift = eventGiftOf(event);
  const spec = gift.spec ?? timedSpec(1);
  const tile = document.createElement('div');
  tile.className = 'shop-tile is-event-gift';
  tile.dataset.event = event.id;
  const art = document.createElement('div');
  art.className = 'shop-tile-art';
  art.appendChild(buildBooster(spec, { size: 'is-tiny' }));
  const name = document.createElement('p');
  name.className = 'shop-tile-name';
  name.textContent = eventTitle(event, getLanguage()) || t('eventGiftTitle');
  const meta = document.createElement('p');
  meta.className = 'shop-tile-meta';
  meta.textContent = [gift.spec ? `${gift.count} × ${specName(gift.spec)}` : '', gift.timed ? t('eventGiftTimed', { n: gift.timed }) : '']
    .filter(Boolean).join(' · ');
  const claim = document.createElement('button');
  claim.type = 'button';
  claim.className = 'buy is-free';
  press(claim, { sound: null });
  const paint = () => {
    const taken = Boolean(state.profile?.eventsClaimed?.[event.id]);
    claim.disabled = taken;
    claim.classList.toggle('is-taken', taken);
    claim.innerHTML = taken
      ? `<span class="buy-label">${esc(t('eventGiftTaken'))}</span>`
      : `<span class="buy-label">${esc(t('eventGiftClaim'))}</span><span class="buy-price">${esc(t('free'))}</span>`;
  };
  claim.addEventListener('click', async () => {
    if (state.profile?.eventsClaimed?.[event.id]) return;
    const done = await pending(claim, claim, async () => {
      try { return await econ('eventGift', { id: event.id }); } catch (error) {
        synth.playDenied();
        toast(esc(econMessage(error, t)), 'error');
        return null;
      }
    });
    if (!done) return;
    if (gift.spec) ensureReady(gift.spec);
    synth.playPurchase();
    toast(esc(t('eventGiftDone')), 'ok');
    paint();
    renderPacks();
  });
  paint();
  shopPainters.push(paint);
  tile.append(art, name, meta, claim);
  return tile;
}

export function liveTile(item) {
  const tile = shopTile(item);
  tile.classList.add('is-live');
  const title = item.name ? tx(item.name) : '';
  if (title) tile.querySelector('.shop-tile-name').textContent = title;
  if (Number.isFinite(item.endsAt)) {
    const ends = document.createElement('p');
    ends.className = 'shop-tile-ends';
    ends.textContent = t('shopLiveEnds', { time: formatCountdown(item.endsAt - Date.now()) });
    tile.insertBefore(ends, tile.querySelector('.odds-chip'));
  }
  return tile;
}

export function buildLiveStall() {
  if (!serverEconomy()) return null;
  const items = liveShelf();
  const gifts = activeEvents('free_packs').filter((e) => { const g = eventGiftOf(e); return g.spec || g.timed; });
  const news = liveNews();
  if (!items.length && !gifts.length && !news.length) return null;
  const body = document.createElement('div');
  body.className = 'shop-live';
  if (news.length) {
    const list = document.createElement('ul');
    list.className = 'shop-live-news';
    for (const event of news) {
      const line = document.createElement('li');
      line.textContent = `${eventTitle(event, getLanguage())} · ${t('shopLiveEnds', { time: formatCountdown(event.ends - Date.now()) })}`;
      list.appendChild(line);
    }
    body.appendChild(list);
  }
  const tiles = [...gifts.map((e) => eventGiftTile(e)), ...items.map((item) => liveTile(item))];
  if (tiles.length) body.appendChild(shopGrid(tiles));
  const sec = buildShopSection({ title: t('shopLiveRow'), note: t('shopLiveNote'), body });
  sec.classList.add('shop-live-sec');
  return sec;
}

async function buyOnServer(args, button) {
  const run = async () => {
    try {
      return await econ('buy', args);
    } catch (error) {
      synth.playDenied();
      toast(esc(econMessage(error, t)), 'error');
      if (String(error?.message ?? '') === 'NOT_IN_SHOP') setTimeout(() => renderShop(), 0);
      return null;
    }
  };
  if (!button) return run();
  return (await pending(button, button, run)) ?? null;
}

function sectionOf(item, spec) {
  if (String(item?.id ?? '').startsWith('live|')) return 'live';
  if (spec?.kind === 'today') return 'today';
  if (String(spec?.themeId ?? '').startsWith('season-')) return 'season';
  const shop = generateShop(windowIndexAt(), state.customPacks, freeWindowAt());
  if (shop.featured?.id === item?.id) return 'featured';
  for (const section of ['subjects', 'press', 'customs']) if (shop[section].some((it) => it.id === item?.id)) return section;
  return spec?.kind === 'custom' ? 'customs' : null;
}

export async function openCrate(button) {
  const price = cratePriceNow();
  if (state.wallet < price) { synth.playDenied(); toast(t('cantAfford'), 'error'); return; }
  let winner;
  if (serverEconomy()) {
    const res = await buyOnServer({ section: 'crate' }, button);
    if (!res) return;
    winner = res.winner;
    ensureReady(winner);
  } else {
    store.saveWallet(state.wallet - price);
    refreshWallet();
    store.markShopBought(state.profile, CRATE_ID, 1);
    winner = rollCrate((state.customPacks ?? []).filter((pack) => !packHidden(pack)));
    gainBooster({ ...winner }, 1);
  }
  reportQuest('buy', { price, kind: 'crate' });
  synth.playPurchase();
  button?.classList.add('is-bought');
  setTimeout(() => button?.classList.remove('is-bought'), 700);
  repaintShop();
  renderPacks();
  showCrateRoll(winner);
}

export function showCrateRoll(winner) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || settings().lowPower;
  const reel = crateReel(winner, (state.customPacks ?? []).filter((pack) => !packHidden(pack)));
  const WINNER_AT = 22;
  openSheet(t('shopCrate'), (body) => {
    body.classList.add('crate-body');
    const stage = document.createElement('div');
    stage.className = 'crate-stage';
    stage.innerHTML = `
      <div class="crate-window">
        <span class="crate-marker" aria-hidden="true"></span>
        <span class="crate-shade is-l" aria-hidden="true"></span><span class="crate-shade is-r" aria-hidden="true"></span>
        <div class="crate-strip"></div>
        <span class="crate-flash" aria-hidden="true"></span>
      </div>
      <p class="crate-status"></p>`;
    const strip = stage.querySelector('.crate-strip');
    strip.replaceChildren(...reel.map((spec, i) => {
      const item = document.createElement('div');
      item.className = 'crate-item';
      item.dataset.i = String(i);
      const tier = spec.rarityId ? rarityById(spec.rarityId) : null;
      item.style.setProperty('--tier', tier ? tier.color : 'var(--line-strong)');
      if (tier) item.style.setProperty('--tier-text', rarityText(tier));
      item.appendChild(buildBooster(spec, { size: 'is-tiny' }));
      const cap = document.createElement('span');
      cap.className = 'crate-cap';
      cap.textContent = tier ? `${spec.cards} · ${tx(tier.name)}` : String(spec.cards);
      item.appendChild(cap);
      return item;
    }));
    const status = stage.querySelector('.crate-status');
    status.textContent = t('shopCrateRolling');
    body.appendChild(stage);

    const result = document.createElement('div');
    result.className = 'crate-result';
    result.hidden = true;
    body.appendChild(result);

    const finish = () => {
      const tier = winner.rarityId ? rarityById(winner.rarityId) : null;
      const item = strip.children[WINNER_AT];
      item?.classList.add('is-won');
      stage.querySelector('.crate-flash').classList.add('is-on');
      status.textContent = t('shopCrateWon');
      const high = tier && rarityRank(tier.id) >= rarityRank('legendary');
      if (high) synth.playFanfare?.(); else synth.playResolved?.();
      if (winner.cards >= 6 || high) synth.playCoins?.();
      result.innerHTML = `
        <div class="crate-result-art"></div>
        <div class="crate-result-copy">
          <b></b>
          <p class="crate-result-meta"></p>
          <p class="crate-result-note"></p>
        </div>
        <div class="crate-result-actions"></div>`;
      result.querySelector('.crate-result-art').appendChild(buildBooster(winner, { size: 'is-small' }));
      result.querySelector('b').textContent = specName(winner);
      paintTileMeta(result.querySelector('.crate-result-meta'), winner);
      result.querySelector('.crate-result-note').textContent = t('shopCrateAdded');
      if (tier) { result.style.setProperty('--tier', tier.color); result.style.setProperty('--tier-text', rarityText(tier)); }
      result.classList.toggle('is-high', Boolean(high));
      const actions = result.querySelector('.crate-result-actions');
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn btn-primary';
      again.innerHTML = `${esc(t('shopCrateAgain'))} · ${money(cratePriceNow())}`;
      press(again, { sound: null });
      again.addEventListener('click', () => { synth.playTap(); live.sheet.hide(); setTimeout(() => openCrate(null), 250); });
      again.disabled = cratePriceNow() > state.wallet;
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'btn btn-ghost';
      done.textContent = t('done');
      press(done, { sound: null });
      done.addEventListener('click', () => { synth.playTap(); live.sheet.hide(); });
      actions.append(again, done);
      result.hidden = false;
      reveal([result], { step: 0 });
    };

    if (reduced) {
      requestAnimationFrame(() => {
        const item = strip.children[WINNER_AT];
        const win = stage.querySelector('.crate-window').getBoundingClientRect();
        const box = item.getBoundingClientRect();
        strip.style.transition = 'none';
        strip.style.transform = `translateX(${-(box.left - win.left + box.width / 2 - win.width / 2)}px)`;
        finish();
      });
      return;
    }

    const DURATION = 5200;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const win = stage.querySelector('.crate-window').getBoundingClientRect();
      const first = strip.children[0].getBoundingClientRect();
      const second = strip.children[1].getBoundingClientRect();
      const step = second.left - first.left;
      const jitter = (Math.random() - 0.5) * first.width * 0.5;
      const target = -(first.width / 2 + WINNER_AT * step - win.width / 2 + jitter);
      strip.style.transition = `transform ${DURATION}ms cubic-bezier(0.12, 0.84, 0.16, 1)`;
      strip.style.transform = `translateX(${target}px)`;
      let last = -1;
      const start = performance.now();
      const watch = (now) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
        const under = Math.floor((win.width / 2 - matrix.m41) / step);
        if (under !== last) { last = under; synth.playRipTick?.(); }
        if (now - start < DURATION + 60) requestAnimationFrame(watch);
        else { synth.playSnap?.(); finish(); }
      };
      requestAnimationFrame(watch);
    }));
  }, { dismissible: true });
}

const BUY_MEMORY_KEY = 'wikster.customBuy.v1';
const BUY_MEMORY_MAX = 60;

function buyMemory() {
  try {
    const held = JSON.parse(localStorage.getItem(BUY_MEMORY_KEY) ?? 'null');
    return held && typeof held === 'object' ? held : {};
  } catch {
    return {};
  }
}

export function rememberedBuy(key) {
  const held = buyMemory();
  const own = held.byId?.[key];
  if (own && typeof own === 'object') return own;
  const last = held.last;
  return last && typeof last === 'object' && last.cards != null ? { cards: last.cards } : null;
}

export function rememberBuy(key, choice) {
  const held = buyMemory();
  const byId = { ...(held.byId && typeof held.byId === 'object' ? held.byId : {}) };
  delete byId[key];
  byId[key] = choice;
  const keys = Object.keys(byId);
  for (const old of keys.slice(0, Math.max(0, keys.length - BUY_MEMORY_MAX))) delete byId[old];
  try { localStorage.setItem(BUY_MEMORY_KEY, JSON.stringify({ last: choice, byId })); } catch {}
}

const within = ([lo, hi], value, fallback) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

function stepper(labelKey, step) {
  const box = document.createElement('div');
  box.className = `sizer is-${step}`;
  box.setAttribute('role', 'group');
  box.innerHTML = `
    <span class="sizer-label"></span>
    <button type="button" class="sizer-btn" data-${step}="-1">${iconSvg('minus', { size: 14 })}</button>
    <b class="sizer-count tabular" aria-live="polite"></b>
    <button type="button" class="sizer-btn" data-${step}="1">${iconSvg('plus', { size: 14 })}</button>`;
  box.querySelector('.sizer-label').textContent = t(labelKey);
  box.setAttribute('aria-label', t(labelKey));
  box.querySelector(`[data-${step}="-1"]`).setAttribute('aria-label', t('shopLess'));
  box.querySelector(`[data-${step}="1"]`).setAttribute('aria-label', t('shopMore'));
  return box;
}

const buyRequestId = () => {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export function customTile({ id, spec }, { tool = null } = {}) {
  const tile = document.createElement('div');
  tile.className = 'shop-tile is-sized';
  tile.dataset.spec = id;
  const memoKey = spec.customId ?? id;
  const memo = rememberedBuy(memoKey) ?? {};
  const chosen = { ...spec, cards: within(CUSTOM_CARD_RANGE, memo.cards ?? spec.cards ?? 5, 5) };
  let qty = within(CUSTOM_QTY_RANGE, memo.qty ?? 1, 1);

  const art = document.createElement('div');
  art.className = 'shop-tile-art';
  const head = document.createElement('div');
  head.className = 'shop-tile-head';
  const name = document.createElement('p');
  name.className = 'shop-tile-name';
  name.textContent = specName(chosen);
  name.title = specName(chosen);
  head.appendChild(name);
  if (tool) head.appendChild(tool);

  const sizer = stepper('shopSizeShort', 'step');
  const qtyer = stepper('shopQtyShort', 'qty');

  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'buy';
  press(buy, { sound: null });
  const foot = document.createElement('div');
  foot.className = 'shop-tile-foot';
  foot.append(oddsChip(chosen), buy);
  tile.append(art, head, sizer, qtyer, foot);

  let drawn = 0;
  const paint = () => {
    const total = shopPrice(boosterPrice(chosen), chosen, 'customs') * qty;
    if (drawn !== chosen.cards) {
      art.replaceChildren(buildBooster({ ...chosen }, { size: 'is-tiny' }));
      drawn = chosen.cards;
    }
    sizer.querySelector('.sizer-count').textContent = String(chosen.cards);
    sizer.querySelector('[data-step="-1"]').disabled = chosen.cards <= CUSTOM_CARD_RANGE[0];
    sizer.querySelector('[data-step="1"]').disabled = chosen.cards >= CUSTOM_CARD_RANGE[1];
    qtyer.querySelector('.sizer-count').textContent = String(qty);
    qtyer.querySelector('[data-qty="-1"]').disabled = qty <= CUSTOM_QTY_RANGE[0];
    qtyer.querySelector('[data-qty="1"]').disabled = qty >= CUSTOM_QTY_RANGE[1];
    tile.dataset.qty = String(qty);
    tile.dataset.cards = String(chosen.cards);
    buy.dataset.price = String(total);
    buy.classList.toggle('is-poor', total > state.wallet);
    buy.setAttribute('aria-label', t('shopBuyAria', { qty, size: t('shopItemMeta', { n: chosen.cards }), price: formatAmount(total) }));
    buy.innerHTML = `<span class="buy-label">${t('buy')}</span><span class="buy-price">${money(total)}</span>`;
    buy.onclick = () => purchase({ ...chosen }, total, buy, qty, { id, stock: Infinity });
  };
  shopPainters.push(paint);
  const wire = (box, attr, apply) => box.querySelectorAll('.sizer-btn').forEach((btn) => {
    press(btn, { sound: null });
    btn.addEventListener('click', () => {
      if (!apply(Number(btn.dataset[attr]))) return;
      rememberBuy(memoKey, { cards: chosen.cards, qty });
      synth.playTap();
      paint();
    });
  });
  wire(sizer, 'step', (step) => {
    const next = chosen.cards + step;
    if (next < CUSTOM_CARD_RANGE[0] || next > CUSTOM_CARD_RANGE[1]) return false;
    chosen.cards = next;
    return true;
  });
  wire(qtyer, 'qty', (step) => {
    const next = qty + step;
    if (next < CUSTOM_QTY_RANGE[0] || next > CUSTOM_QTY_RANGE[1]) return false;
    qty = next;
    return true;
  });
  paint();
  return tile;
}

export function paintFreeButton(button, id, spec) {
  const available = store.freeAvailable(state.profile, id);
  button.disabled = !available;
  button.classList.toggle('is-taken', !available);
  button.innerHTML = available
    ? `<span class="buy-label">${t('claimFree')}</span><span class="buy-price">${t('free')}</span>`
    : `<span class="buy-label">${t('freeTaken')}</span>`;
  button.onclick = available ? () => takeFree(id, spec, button) : null;
}

export async function takeFree(id, spec, button) {
  if (!store.freeAvailable(state.profile, id)) return;
  if (serverEconomy()) {
    if (!(await buyOnServer({ section: 'free', id }, button))) return;
    ensureReady(spec);
  } else {
    store.markFreeTaken(state.profile, id);
    gainBooster(spec, 1);
  }
  synth.playPurchase();
  toast(`${t('bought')} ${specName(spec)}`, 'ok');
  paintFreeButton(button, id, spec);
  renderPacks();
}

export async function purchase(spec, price, button, count = 1, item = null) {
  if (item && stockLeft(item) <= 0) { synth.playDenied(); toast(t('shopSoldOut'), 'error'); return false; }
  if (state.wallet < price) {
    synth.playDenied();
    toast(t('cantAfford'), 'error');
    return false;
  }
  if (serverEconomy()) {
    const section = sectionOf(item, spec);
    if (!section || (count !== 1 && section !== 'customs')) { synth.playDenied(); toast(esc(t('econFailed')), 'error'); return false; }
    const args = { section, id: item?.id ?? specId(spec) };
    if (section === 'customs') Object.assign(args, { customId: spec.customId ?? null, cards: spec.cards, count, req: buyRequestId() });
    if (!(await buyOnServer(args, button))) return false;
    ensureReady(spec);
  } else {
    store.saveWallet(state.wallet - price);
    gainBooster(spec, count);
    if (item) store.markShopBought(state.profile, item.id, 1);
  }
  refreshWallet();
  for (let i = 0; i < count; i++) reportQuest('buy', { price: price / count, kind: spec.kind, rarityId: spec.rarityId ?? null });
  synth.playPurchase();
  button.classList.add('is-bought');
  setTimeout(() => button.classList.remove('is-bought'), 700);
  toast(`${t('bought')} ${count > 1 ? `${count} × ` : ''}${specName(spec)}`, 'ok');
  repaintShop();
  renderPacks();
  return true;
}

export async function purchaseBundle(item, button) {
  if (stockLeft(item) <= 0) { synth.playDenied(); toast(t('shopSoldOut'), 'error'); return false; }
  if (state.wallet < item.price) { synth.playDenied(); toast(t('cantAfford'), 'error'); return false; }
  if (serverEconomy()) {
    if (!(await buyOnServer({ section: 'bundles', id: item.id }, button))) return false;
    for (const spec of item.specs) ensureReady(spec);
  } else {
    store.saveWallet(state.wallet - item.price);
    for (const spec of item.specs) gainBooster({ ...spec }, 1);
    store.markShopBought(state.profile, item.id, 1);
  }
  refreshWallet();
  for (const spec of item.specs) reportQuest('buy', { price: item.price / item.specs.length, kind: spec.kind, rarityId: spec.rarityId ?? null, bundle: true });
  synth.playPurchase();
  button.classList.add('is-bought');
  setTimeout(() => button.classList.remove('is-bought'), 700);
  toast(`${t('bought')} ${t('shopBundleOf', { n: item.specs.length })}`, 'ok');
  repaintShop();
  renderPacks();
  return true;
}

export { freeNoteText, payStipend, tickRestock } from './stipend.js';
