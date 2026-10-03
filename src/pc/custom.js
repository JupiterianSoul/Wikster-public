import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { specId, specName } from '../booster.js';
import { generateShop } from '../shop.js';
import { CUSTOM_CARD_RANGE, freeWindowAt, windowIndexAt } from '../economy.js';
import * as store from '../collection.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { el, openSheet, state } from '../app/core.js';
import { deleteCustomPackNow, renderCreator } from '../app/packs.js';
import { customTile } from '../app/shop.js';
import { openScreenFor, schedulePrefetch } from '../app/open.js';
import { packHidden } from '../app/mature.js';
import { live } from '../app/live.js';
import { isAway, registerView } from './shell.js';
import { BoosterGrid, boosterDetail } from './boosters.js';
import { Pager, button, empty, fitStack, heading, keeper, observeSize, pageKeys, rem, segmented, wheelPager } from './kit.js';

const view = {
  node: h('section.pc-view.pcc'),
  tab: null,
  pick: null,
  grid: null,
  side: null,
  wikis: h('div.pcc-wikis'),
  wikiPager: null,
  wikiBox: null,
  timer: null
};

const owned = () => store.ownedBoosters(state.inventory)
  .filter((slot) => slot.spec.kind === 'custom' && !packHidden(slot.spec))
  .map((slot) => ({ ...slot, id: specId(slot.spec) }))
  .sort((a, b) => specName(a.spec).localeCompare(specName(b.spec)));

function forge() {
  const form = document.getElementById('creator');
  renderCreator();
  const panel = h('aside.pcc-forge.pcx-panel',
    h('div.pcc-forge-glow'),
    heading(t('creatorTitle')),
    form ?? h('p', t('pcForgeNote')),
    h('ol.pcc-steps', { dataset: { drop: '1' } },
      h('li', h('b', '1'), h('span', t('pcForgeStep1'))),
      h('li', h('b', '2'), h('span', t('pcForgeStep2', { min: CUSTOM_CARD_RANGE[0], max: CUSTOM_CARD_RANGE[1] }))),
      h('li', h('b', '3'), h('span', t('pcForgeStep3')))));
  if (form) {
    form.hidden = false;
    el.creatorWrap.hidden = true;
  }
  fitStack(panel);
  return panel;
}

function wikiItems() {
  const market = generateShop(windowIndexAt(), state.customPacks, freeWindowAt());
  const bySpec = new Map(market.customs.map((item) => [item.spec.customId, item]));
  return (state.customPacks ?? []).filter((pack) => !packHidden(pack)).map((pack) => ({ pack, item: bySpec.get(pack.id) ?? null }));
}

function askDelete(pack) {
  synth.playTap();
  openSheet(t('deleteBoosterNamed', { name: pack.name }), (body) => {
    const text = h('p.pcc-confirm-text', t('deleteBoosterBody', { name: pack.name }));
    const go = h('button.btn.btn-danger.btn-block.pcc-confirm-go', { type: 'button' },
      h('span', { html: iconSvg('trash', { size: 16 }) }), h('span', t('deleteBoosterGo')));
    const keep = h('button.btn.btn-ghost.btn-block', { type: 'button', onclick: () => live.sheet.hide() }, t('deleteBoosterKeep'));
    go.addEventListener('click', async () => {
      go.disabled = true;
      live.sheet.hide();
      if (await deleteCustomPackNow(pack)) render();
      else go.disabled = false;
    });
    body.append(text, h('div.pcc-confirm', go, keep));
  });
}

function wikiTile({ pack, item }) {
  const del = h('button.pcc-delete', { type: 'button', title: t('deleteBoosterNamed', { name: pack.name }), 'aria-label': t('deleteBoosterNamed', { name: pack.name }) },
    h('span', { html: iconSvg('trash', { size: 16 }) }));
  del.addEventListener('click', (event) => {
    event.stopPropagation();
    askDelete(pack);
  });
  if (item) {
    const tile = customTile(item, { tool: del });
    tile.classList.add('pcc-wiki');
    return tile;
  }
  return h('div.shop-tile.pcc-wiki.is-off',
    h('div.shop-tile-head', h('p.shop-tile-name', pack.name), del),
    h('p.shop-tile-meta', t('pcWikiNotStocked')));
}

function paintWikis() {
  const items = wikiItems();
  if (!items.length) {
    fill(view.wikis, empty('wand', t('pcNoWikis'), t('pcNoWikisNote')));
    view.wikiPager.set(0, 1);
    return;
  }
  const unit = rem();
  const box = view.wikiBox ?? view.wikis.getBoundingClientRect();
  const gap = 1.1 * unit;
  const cols = Math.max(1, Math.min(items.length, Math.floor((box.width + gap) / (22 * unit + gap))));
  view.wikis.style.setProperty('--cols', String(cols));
  view.wikis.classList.remove('is-compact');
  fill(view.wikis, [wikiTile(items[0])]);
  let tall = view.wikis.firstElementChild.getBoundingClientRect().height;
  if (tall > box.height) {
    view.wikis.classList.add('is-compact');
    tall = view.wikis.firstElementChild.getBoundingClientRect().height;
  }
  const rows = Math.max(1, Math.floor((box.height + gap) / (tall + gap)));
  const per = cols * rows;
  const pages = Math.ceil(items.length / per);
  view.wikiPager.set(Math.min(view.wikiPager.page, pages - 1), pages);
  const start = view.wikiPager.page * per;
  fill(view.wikis, items.slice(start, start + per).map(wikiTile));
}

function pickSlot(slot) {
  synth.playTap();
  view.pick = slot.id;
  view.grid.set(owned(), view.pick);
  paintSide();
}

function paintSide() {
  const slot = owned().find((s) => s.id === view.pick) ?? null;
  const host = slot?.spec?.wiki ? (() => { try { return new URL(slot.spec.wiki.apiUrl).host; } catch { return ''; } })() : '';
  const next = view.tab === 'ready' ? boosterDetail(slot, { note: host ? t('pcFromWiki', { host }) : null }) : h('aside.pcb-detail.is-gone');
  view.side.replaceWith(next);
  view.side = next;
}

function render() {
  const list = owned();
  const wikis = (state.customPacks ?? []).filter((pack) => !packHidden(pack));
  view.tab ??= list.length || !wikis.length ? 'ready' : 'wikis';
  if (!list.some((s) => s.id === view.pick)) view.pick = list[0]?.id ?? null;
  view.grid ??= new BoosterGrid({
    onPick: (slot) => pickSlot(slot),
    onOpen: (slot) => { synth.resume(); openScreenFor(slot.spec); },
    empty: () => empty('wand', t('pcNoCustom'), wikis.length ? t('pcNoCustomBuy') : t('pcNoCustomNote'),
      wikis.length ? button(t('pcSeeWikis'), { kind: 'primary', icon: 'gem', onClick: () => { view.tab = 'wikis'; render(); } }) : null)
  });
  if (!view.wikiPager) {
    view.wikiPager = new Pager({ onChange: () => paintWikis() });
    wheelPager(view.wikis, view.wikiPager);
    observeSize(view.wikis, (box) => { view.wikiBox = box; if (view.tab === 'wikis') paintWikis(); });
  }
  const ready = view.tab === 'ready';
  view.side = h('aside.pcb-detail');
  fill(view.node,
    forge(),
    h('main.pcb-main',
      h('header.pcb-bar',
        segmented([
          { value: 'ready', label: t('pcReadyToOpen'), icon: 'packs', count: list.reduce((n, s) => n + s.count, 0) },
          { value: 'wikis', label: t('pcYourWikis'), icon: 'wand', count: wikis.length }
        ], view.tab, (tab) => { view.tab = tab; render(); }, { name: t('tabCustom') }),
        h('span.pcb-bar-note', ready ? t('pcReadyNote') : t('pcWikisNote'))),
      ready ? view.grid.node : view.wikis,
      ready ? view.grid.pager.node : view.wikiPager.node),
    view.side);
  view.node.classList.toggle('is-wikis', !ready);
  if (ready) view.grid.set(list, view.pick);
  else requestAnimationFrame(paintWikis);
  paintSide();
  keep.mark();
}

let signature = '';
const currentSignature = () => JSON.stringify([
  Object.entries(state.inventory ?? {}).filter(([id]) => id.startsWith('custom|')).map(([id, s]) => `${id}:${s?.count}`),
  (state.customPacks ?? []).map((p) => p.id)
]);

const keep = keeper(currentSignature);

function refresh() {
  if (isAway(view.node) || live.sheet?.open) return;
  const now = currentSignature();
  if (now !== signature) { signature = now; render(); }
}

registerView('custom', {
  node: view.node,
  screens: ['custom'],
  render() {
    signature = currentSignature();
    render();
    clearInterval(view.timer);
    view.timer = setInterval(refresh, 1000);
  },
  show() {
    const form = document.getElementById('creator');
    if (!keep.fresh() || (form && !view.node.contains(form))) { this.render(); return; }
    const slot = owned().find((s) => s.id === view.pick);
    if (slot && view.tab === 'ready') schedulePrefetch(slot.spec);
    clearInterval(view.timer);
    view.timer = setInterval(refresh, 1000);
  },
  find() { el.creatorInput?.focus(); },
  key(event) {
    if (view.tab === 'wikis') {
      if (pageKeys(event, view.wikiPager) || (event.key === 'ArrowRight' && view.wikiPager.go(view.wikiPager.page + 1, true)) || (event.key === 'ArrowLeft' && view.wikiPager.go(view.wikiPager.page - 1, true))) event.preventDefault();
      return;
    }
    if (view.grid?.move(event)) { event.preventDefault(); return; }
    if (event.key === ' ' || (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement))) {
      const slot = owned().find((s) => s.id === view.pick);
      if (slot) { synth.resume(); openScreenFor(slot.spec); }
      event.preventDefault();
    }
  },
  prompts: () => (view.tab === 'wikis'
    ? [['PgUp  PgDn', t('pcPromptPage')], ['Ctrl F', t('pcPromptForge')]]
    : [['←  →  ↑  ↓', t('pcPromptPick')], [t('pcSpace'), t('openPack')], ['Ctrl F', t('pcPromptForge')]])
});
