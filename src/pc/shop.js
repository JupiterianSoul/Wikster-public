import { t, tx } from '../i18n.js';
import { buckSvg, iconSvg, inkSvg } from '../data/icons.js';
import { formatAmount } from '../pricing.js';
import { freeWindowAt, nextFreeAt, nextRefreshAt, windowIndexAt } from '../economy.js';
import { formatCountdown } from '../shop.js';
import { liveVersion } from '../live.js';
import { seasonAt } from '../season.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { state } from '../app/core.js';
import {
  buildCrateStall, buildFeatured, buildLiveStall, buildPress, buildSeasonStall, buildTodayStall, bundleTile,
  customTile, payStipend, shopMarket, shopPainters, shopSafe, shopTile
} from '../app/shop.js';
import { live } from '../app/live.js';
import { packHidden } from '../app/mature.js';
import { goScreen, isAway, registerView } from './shell.js';
import { empty, fitStack, heading, keeper, observeSize } from './kit.js';

const PAGES = [
  { id: 'spot', key: 'pcShopSpot', icon: 'star' },
  { id: 'subjects', key: 'shopSubjects', icon: 'globe' },
  { id: 'press', key: 'shopPress', icon: 'gem' },
  { id: 'bundles', key: 'shopBundles', icon: 'packs' },
  { id: 'crate', key: 'shopCrate', icon: 'gift' },
  { id: 'custom', key: 'shopCustomRow', icon: 'wand' }
];

const view = { node: h('section.pc-view.pcs'), page: 'spot', timer: null, clocks: null, purse: null, ink: null };

const group = (title, note, ...body) => h('section.pcs-group',
  heading(title),
  note ? h('p.pcs-note', note) : null,
  ...body);

const tiles = (list) => h('div.pcs-tiles', list);

function page(market) {
  switch (view.page) {
    case 'subjects':
      return h('div.pcs-page.is-grid', group(t('shopSubjects'), t('shopSubjectsNote'), tiles(market.subjects.map((item) => shopTile(item)))));
    case 'press': {
      const press = buildPress(market.press);
      return h('div.pcs-page.is-press', group(t('shopPress'), t('shopPressNote'), press));
    }
    case 'bundles':
      return h('div.pcs-page.is-grid.is-bundles', group(t('shopBundles'), t('shopBundlesNote'), tiles(market.bundles.map((item) => bundleTile(item)))));
    case 'crate':
      return h('div.pcs-page.is-crate', group(t('shopCrate'), t('shopCrateNote'), buildCrateStall()));
    case 'custom':
      return h('div.pcs-page.is-grid.is-custom', group(t('shopCustomRow'), t('shopSizeNote'),
        market.customs.some((item) => !packHidden(item.spec))
          ? h('div.pcs-tiles.is-sized', market.customs.filter((item) => !packHidden(item.spec)).map((item) => customTile(item)))
          : empty('wand', t('pcNoWikis'), t('pcShopCustomEmpty'))));
    default: {
      const today = shopSafe('pc today', () => buildTodayStall());
      const season = shopSafe('pc season', () => buildSeasonStall());
      const special = shopSafe('pc live', () => buildLiveStall());
      return h('div.pcs-page.is-spot',
        h('div.pcs-hero', { dataset: { drop: '1' } }, shopSafe('pc featured', () => buildFeatured(market.featured))),
        h('div.pcs-row', [
          shopSafe('pc free', () => group(t('shopFreeRow'), null, tiles(market.free.map((item) => shopTile(item, { free: true }))))),
          today ? group(t('todayBooster'), null, tiles([...today.querySelectorAll('.shop-tile')])) : null,
          season ? group(tx(seasonAt().season.name), null, tiles([...season.querySelectorAll('.shop-tile')])) : null,
          special?.querySelector('.shop-tile') ? group(t('shopLiveRow'), null, tiles([...special.querySelectorAll('.shop-tile')])) : null
        ].filter(Boolean).map((node) => { node.style.setProperty('--n', String(node.querySelectorAll('.shop-tile').length || 1)); return node; })));
    }
  }
}

function counts(market) {
  return {
    spot: market.free.length + 3, subjects: market.subjects.length, press: market.press.length,
    bundles: market.bundles.length, crate: null, custom: market.customs.filter((item) => !packHidden(item.spec)).length
  };
}

function paintClocks() {
  if (!view.clocks) return;
  view.purse.textContent = formatAmount(state.wallet ?? 0);
  view.ink.textContent = formatAmount(state.ink ?? 0);
  view.clocks[0].textContent = formatCountdown(nextRefreshAt() - Date.now());
  view.clocks[1].textContent = formatCountdown(nextFreeAt() - Date.now());
}

function render() {
  shopPainters.length = 0;
  const market = shopMarket();
  const n = counts(market);
  view.purse = h('b');
  view.ink = h('b');
  view.clocks = [h('b.tabular'), h('b.tabular')];
  const nav = h('nav.pcs-nav', PAGES.map((p) => {
    const btn = h('button.pcs-link', { type: 'button', dataset: { page: p.id } },
      h('span.pcs-link-icon', { html: iconSvg(p.icon, { size: 20 }) }),
      h('span.pcs-link-label', t(p.key)),
      n[p.id] != null ? h('span.pcs-link-count', String(n[p.id])) : null);
    btn.classList.toggle('is-on', p.id === view.page);
    btn.addEventListener('click', () => { if (p.id !== view.page) { synth.playNav(true); view.page = p.id; render(); } });
    return btn;
  }));
  fill(view.node,
    h('aside.pcs-side',
      h('div.pcs-wallet.pcx-panel',
        h('div.pcs-coin', h('span.pcs-coin-mark', { html: buckSvg({ size: 24 }) }), view.purse),
        h('div.pcs-coin.is-ink', h('span.pcs-coin-mark', { html: inkSvg({ size: 18 }) }), view.ink, h('button.pcs-ink-link', { type: 'button', onclick: () => { synth.playTap(); goScreen('atelier'); } }, t('tabAtelier')))),
      h('div.pcs-clocks.pcx-panel', { dataset: { drop: '1' } },
        h('div', h('span', { html: iconSvg('clock', { size: 15 }) }), h('span', t('pcRestock')), view.clocks[0]),
        h('div', h('span', { html: iconSvg('gift', { size: 15 }) }), h('span', t('pcFreeRestock')), view.clocks[1])),
      nav),
    h('main.pcs-main', shopSafe(`pc ${view.page}`, () => page(market)) ?? empty('gem', t('tabShop'), '')));
  fitStack(view.node.querySelector('.pcs-side'));
  const main = view.node.querySelector('.pcs-main');
  observeSize(main, () => fitPage(main));
  paintClocks();
  signature = currentSignature();
  keep.mark();
}

const TILE_STEPS = [1, 0.93, 0.86, 0.79, 0.72, 0.65, 0.58];

function fitPage(main) {
  const pageNode = main.firstElementChild;
  if (!pageNode) return;
  const over = () => pageNode.scrollHeight > main.clientHeight + 1 || pageNode.scrollWidth > main.clientWidth + 1;
  const drops = [...pageNode.querySelectorAll('[data-drop]')];
  for (const node of drops) node.classList.remove('pc-dropped');
  pageNode.classList.remove('is-scroll');
  const shrink = () => {
    for (const k of TILE_STEPS) {
      main.style.setProperty('--shop-k', String(k));
      if (!over()) return true;
    }
    return false;
  };
  if (shrink()) return;
  for (const rank of [...new Set(drops.map((node) => node.dataset.drop))].sort()) {
    for (const node of drops) if (node.dataset.drop === rank) node.classList.add('pc-dropped');
    if (shrink()) return;
  }
  for (const node of drops) node.classList.remove('pc-dropped');
  main.style.setProperty('--shop-k', '1');
  pageNode.classList.toggle('is-scroll', over());
}

let signature = '';
const currentSignature = () => JSON.stringify([windowIndexAt(), freeWindowAt(), state.wallet, state.profile?.shopBought, state.profile?.freeTaken, state.profile?.todayBought, (state.customPacks ?? []).length, view.page, liveVersion(), state.profile?.liveBought, state.profile?.eventsClaimed]);

const keep = keeper(currentSignature);

function tick() {
  if (isAway(view.node) || live.sheet?.open) return;
  if (currentSignature() !== signature) { render(); return; }
  paintClocks();
}

function step(dir) {
  const at = PAGES.findIndex((p) => p.id === view.page);
  const next = PAGES[(at + dir + PAGES.length) % PAGES.length];
  synth.playNav(dir > 0);
  view.page = next.id;
  render();
}

registerView('shop', {
  node: view.node,
  screens: ['shop'],
  render() {
    payStipend();
    render();
    clearInterval(view.timer);
    view.timer = setInterval(tick, 1000);
  },
  show() {
    if (!keep.fresh()) { this.render(); return; }
    payStipend();
    paintClocks();
    clearInterval(view.timer);
    view.timer = setInterval(tick, 1000);
  },
  key(event) {
    if (event.key === 'ArrowDown' || event.key === 'PageDown') { step(1); event.preventDefault(); }
    else if (event.key === 'ArrowUp' || event.key === 'PageUp') { step(-1); event.preventDefault(); }
  },
  prompts: () => [['↑  ↓', t('pcPromptShelf')]]
});
