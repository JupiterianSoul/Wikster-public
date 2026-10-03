import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { rarityById, rarityOfCard, rarityText } from '../data/rarities.js';
import { specColours, specId, specName, specTagline } from '../booster.js';
import { canClaim, msUntilNextUtcDay } from '../daily.js';
import { formatCountdown } from '../shop.js';
import { MAX_TIMED_LEVEL, levelProgress, maxHeld, msToNext, regenMs, timedLevel } from '../timed.js';
import { claimableTiers, daysLeft, nextRung, seasonAt, seasonEntry } from '../season.js';
import * as quests from '../quests.js';
import * as store from '../collection.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { state } from '../app/core.js';
import { buildBooster, currentTimedSpec, openAllTimed, openTimed, ownedFor, syncTimed } from '../app/packs.js';
import { batchFor, openScreenFor, schedulePrefetch } from '../app/open.js';
import { buildStaticCard, openCardDetail } from '../app/detail.js';
import { openDaily } from '../app/daily.js';
import { questUserKey } from '../app/arcade.js';
import { live } from '../app/live.js';
import { go, goScreen, isAway, registerView } from './shell.js';
import { button, fitStack, heading, keeper, meter, observeSize, rem, segmented } from './kit.js';

const HAND = 16;

const home = {
  node: h('section.pc-view.pch'),
  mode: 'boosters',
  picks: { boosters: 0, custom: 0, free: 0 },
  items: [],
  flow: null,
  info: null,
  count: null,
  timer: null
};

export function ringSvg(fraction, { stroke = 7 } = {}) {
  const r = 50 - stroke / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction || 0));
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" class="pcx-ring-back" stroke-width="${stroke}" fill="none"/>`
    + `<circle cx="50" cy="50" r="${r}" class="pcx-ring-fill" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" transform="rotate(-90 50 50)"/></svg>`;
}

function lists() {
  const timed = state.profile.timed ?? {};
  const boosters = ownedFor('owned');
  const custom = store.ownedBoosters(state.inventory)
    .filter((s) => s.spec.kind === 'custom')
    .sort((a, b) => specName(a.spec).localeCompare(specName(b.spec)));
  const code = ownedFor('custom').filter((s) => s.spec.kind === 'code');
  return {
    boosters: [...boosters, ...code],
    custom,
    free: (timed.count ?? 0) > 0 ? [{ spec: currentTimedSpec(), count: timed.count, free: true }] : []
  };
}

function place() {
  const items = home.items;
  const at = home.picks[home.mode] ?? 0;
  const pack = home.packH || 20.5 * rem();
  const packW = pack / 1.79;
  const gap = 1.6 * rem();
  const half = (items[0]?.parentElement?.clientWidth ?? 0) / 2;
  const scaleAt = (a) => (a === 0 ? 1 : Math.max(0.5, 0.78 - (a - 1) * 0.1));
  const offsets = [0];
  for (let a = 1; a < 8; a++) offsets[a] = offsets[a - 1] + (packW * scaleAt(a - 1)) / 2 + gap + (packW * scaleAt(a)) / 2;
  items.forEach((node, i) => {
    const d = i - at;
    const a = Math.abs(d);
    const s = Math.sign(d);
    const scale = scaleAt(a);
    const x = s * (offsets[Math.min(a, 7)] ?? 0);
    const fits = a === 0 || !half || Math.abs(x) + (packW * scale) / 2 <= half;
    node.style.transform = `translate3d(calc(-50% + ${x}px), -50%, 0) scale(${scale})`;
    node.style.zIndex = String(100 - a);
    node.style.opacity = !fits || a > 3 ? '0' : '1';
    node.style.filter = a === 0 ? '' : `brightness(${Math.max(0.4, 0.72 - (a - 1) * 0.12)}) saturate(0.85)`;
    node.style.pointerEvents = !fits || a > 3 ? 'none' : '';
    node.classList.toggle('is-far', !fits || a > 3);
    node.classList.toggle('is-center', a === 0);
    node.setAttribute('aria-selected', String(a === 0));
  });
}

function paintInfo() {
  const list = lists()[home.mode];
  const at = home.picks[home.mode] ?? 0;
  const slot = list[at];
  if (home.count) home.count.textContent = list.length > 1 ? `${at + 1} / ${list.length}` : '';
  if (!slot) return;
  const colours = specColours(slot.spec);
  home.stage.style.setProperty('--spot', colours.accent);
  home.stage.style.setProperty('--spot-2', colours.accent2 ?? colours.accent);
  schedulePrefetch(slot.spec);
  const tier = slot.spec.rarityId ? rarityById(slot.spec.rarityId) : null;
  const actions = slot.free
    ? [
      button(t('openPack'), { kind: 'primary', size: 'big', icon: 'packs', key: t('pcSpace'), onClick: () => openTimed() }),
      slot.count > 1 ? button(t('pcOpenAll', { n: slot.count }), { size: 'big', onClick: () => openAllTimed() }) : null
    ]
    : [
      button(t('openPack'), { kind: 'primary', size: 'big', icon: 'packs', key: t('pcSpace'), onClick: () => openSlot(slot) }),
      batchFor(slot.spec) ? button(t('openAllN', { n: batchFor(slot.spec) }), { size: 'big', icon: 'collection', onClick: () => { synth.resume(); openScreenFor(slot.spec, { batch: true }); } }) : null,
      button(t('pcBuyMore'), { size: 'big', icon: 'gem', onClick: () => go('shop') })
    ];
  fill(home.info,
    h('h2.pch-name', specName(slot.spec)),
    h('p.pch-tag', slot.free ? t('pcFreeTagline') : specTagline(slot.spec)),
    h('div.pch-chips',
      h('span.pcx-chip', { html: `${iconSvg('packs', { size: 14 })}<span>${slot.count > 1 ? t('pcHeldMany', { n: slot.count }) : t('pcHeldOne')}</span>` }),
      h('span.pcx-chip', t('pcCards', { n: slot.spec.cards })),
      tier ? h('span.pcx-chip.is-tier', { style: { '--rarity': tier.color, '--rarity-text': rarityText(tier) } }, t('pcGuarantee', { tier: tx(tier.name) })) : null),
    h('div.pch-actions', actions));
}

function pick(i, sound = true) {
  const list = lists()[home.mode];
  if (!list.length) return;
  const next = Math.max(0, Math.min(list.length - 1, i));
  if (next === home.picks[home.mode]) return;
  home.picks[home.mode] = next;
  if (sound) synth.playSnap?.();
  place();
  paintInfo();
}

function openSlot(slot) {
  synth.resume();
  if (slot.free) openTimed();
  else openScreenFor(slot.spec);
}

function emptyStage() {
  const custom = home.mode === 'custom';
  return h('div.pch-empty',
    h('span.pcx-empty-mark', { html: iconSvg(custom ? 'wand' : home.mode === 'free' ? 'hourglass' : 'packs', { size: 44 }) }),
    h('h3', custom ? t('pcNoCustom') : home.mode === 'free' ? t('pcNoFree') : t('pcNoBoosters')),
    h('p', custom ? t('pcNoCustomNote') : home.mode === 'free' ? t('pcFreeNext', { time: formatCountdown(msToNext(state.profile.timed ?? {}) ?? 0) }) : t('pcNoBoostersNote')),
    h('div.pcx-row',
      custom
        ? button(t('pcForgeOpen'), { kind: 'primary', icon: 'wand', onClick: () => goScreen('custom') })
        : button(t('goShop'), { kind: 'primary', icon: 'gem', onClick: () => go('shop') })));
}

function stage() {
  const all = lists();
  const list = all[home.mode];
  home.picks[home.mode] = Math.min(home.picks[home.mode] ?? 0, Math.max(0, list.length - 1));
  const total = (l) => l.reduce((n, s) => n + s.count, 0);
  const seg = segmented([
    { value: 'boosters', label: t('tabBoosters'), icon: 'packs', count: total(all.boosters) },
    { value: 'custom', label: t('tabCustom'), icon: 'wand', count: total(all.custom) },
    { value: 'free', label: t('tabTimed'), icon: 'hourglass', count: total(all.free) }
  ], home.mode, (mode) => { home.mode = mode; render(); }, { name: t('pcShelf') });
  home.count = h('span.pch-count');
  home.info = h('div.pch-info');
  home.items = [];
  let body;
  if (!list.length) {
    body = emptyStage();
  } else {
    home.items = list.map((slot, i) => {
      const item = h('button.pch-flow-item', { type: 'button', role: 'option', title: specName(slot.spec) },
        buildBooster(slot.spec, { size: 'is-pc-flow' }),
        h('span.pch-flow-count', `×${slot.count}`));
      item.addEventListener('click', () => {
        if (i === home.picks[home.mode]) openSlot(slot);
        else pick(i);
      });
      return item;
    });
    home.flow = h('div.pch-flow', { role: 'listbox', 'aria-label': t('pcShelf') }, home.items);
    observeSize(home.flow, (box) => {
      home.packH = Math.max(7 * rem(), Math.min(box.height * 0.84, (box.width / 3.1) * 1.79, 24 * rem()));
      home.flow.style.setProperty('--flow-pack-h', `${Math.round(home.packH)}px`);
      place();
    });
    let lock = 0;
    home.flow.addEventListener('wheel', (event) => {
      event.preventDefault();
      const now = performance.now();
      if (now < lock) return;
      lock = now + 140;
      const d = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(d) > 3) pick(home.picks[home.mode] + (d > 0 ? 1 : -1));
    }, { passive: false });
    const arrow = (dir) => {
      const btn = h('button.pch-arrow', { type: 'button', 'aria-label': t(dir < 0 ? 'pcPrevPage' : 'pcNextPage'), dataset: { dir: String(dir) } },
        h('span', { html: iconSvg(dir < 0 ? 'chevronLeft' : 'chevronRight', { size: 26 }) }));
      btn.addEventListener('click', () => pick(home.picks[home.mode] + dir));
      return btn;
    };
    body = h('div.pch-flow-wrap', arrow(-1), home.flow, arrow(1));
  }
  home.stage = h('section.pch-stage.pcx-panel',
    h('div.pch-glow'),
    h('header.pch-stage-head', seg, home.count),
    body,
    list.length ? home.info : null);
  return home.stage;
}

function hand() {
  const entries = store.allEntries(state.collection)
    .filter((e) => !e.special)
    .sort((a, b) => (b.lastPulledAt ?? 0) - (a.lastPulledAt ?? 0))
    .slice(0, HAND);
  const n = entries.length;
  const cards = entries.map((entry, i) => {
    const rarity = rarityById(entry.rarityId) ?? rarityOfCard(entry);
    const card = buildStaticCard(entry, rarity, entry.key, { fav: false, wish: false });
    const slot = h('button.pch-hand-card', { type: 'button', title: entry.title }, card);
    slot.addEventListener('click', () => { synth.playTap(); openCardDetail(entry.key, entry, rarity); });
    return slot;
  });
  return h('section.pch-latest',
    heading(t('pcLatest'), button(t('pcSeeCollection'), { kind: 'link', onClick: () => go('collection') })),
    n ? h('div.pch-hand', cards) : h('p.pcx-faint.pch-hand-empty', t('pcLatestEmpty')));
}

function widget(cls, icon, title, meta, ...body) {
  return h(`section.pch-widget.pcx-panel.${cls}`,
    h('header.pch-widget-head',
      h('span.pch-widget-icon', { html: iconSvg(icon, { size: 18 }) }),
      h('h3.pcx-title', title),
      meta ? h('span.pch-widget-meta', meta) : null),
    ...body);
}

function freeWidget() {
  const timed = syncTimed();
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const held = timed.count ?? 0;
  const left = msToNext(timed);
  const step = regenMs(level);
  const fraction = left === null ? 1 : 1 - left / step;
  return widget('is-free', 'hourglass', t('tabTimed'), h('span.pcx-chip', t('freeLevel', { level })),
    h('div.pch-free',
      h('button.pch-dial', { type: 'button', title: t('tabTimed'), onclick: () => { synth.playTap(); goScreen('timed'); } },
        h('span.pch-dial-ring', { html: ringSvg(fraction, { stroke: 6 }) }),
        h('span.pch-dial-core', h('b', { dataset: { live: 'free-count' } }, String(held)), h('small', t('pcOfMax', { n: cap })))),
      h('div.pch-free-side',
        h('p.pch-free-state', { dataset: { live: 'free-state' } },
          left === null ? t('pcFreeFullShort') : t('pcFreeNext', { time: formatCountdown(left) })),
        h('div.pch-pips', Array.from({ length: cap }, (_, i) => h(`i${i < held ? '.is-on' : ''}`))),
        h('div.pch-free-actions',
          button(t('openPack'), { kind: 'primary', icon: 'packs', disabled: held < 1, onClick: () => openTimed() }),
          held > 1 ? button(t('pcAllN', { n: held }), { onClick: () => openAllTimed() }) : null))),
    level < MAX_TIMED_LEVEL
      ? h('div.pch-free-track', h('span', t('pcFreeTrack', { level: level + 1 })), meter(levelProgress(timed.opened ?? 0)))
      : null);
}

function dailyWidget() {
  const ready = canClaim(state.profile.daily);
  return h(`section.pch-widget.pcx-panel.pch-daily${ready ? '.is-ready' : ''}`,
    h('span.pch-daily-mark', { html: iconSvg('gift', { size: 30 }) }),
    h('div.pch-daily-text',
      h('h3.pcx-title', t('dailyTitle')),
      h('p', { dataset: { live: 'gift' } }, ready ? t('pcGiftReady') : t('panelGiftIn', { time: formatCountdown(msUntilNextUtcDay()) }))),
    ready ? button(t('questClaim'), { kind: 'primary', icon: 'gift', onClick: () => openDaily() }) : null);
}

function questsWidget() {
  const board = quests.loadBoard(questUserKey());
  const rows = quests.describe(board);
  const done = rows.filter((r) => r.progress >= r.target).length;
  const claimable = quests.claimableCount(questUserKey());
  return widget('is-quests', 'scroll', t('pcDailyQuests'), h('span.pch-widget-meta', `${done} / ${rows.length}`),
    h('ul.pch-quests', rows.map((row) => {
      const ready = !row.claimed && row.progress >= row.target;
      return h(`li.pch-quest${row.claimed ? '.is-claimed' : ready ? '.is-ready' : ''}`,
        h('span.pch-quest-name', tx(row.quest.name)),
        h('span.pch-quest-count', row.claimed ? h('span', { html: iconSvg('check', { size: 15 }) }) : `${Math.min(row.progress, row.target)} / ${row.target}`),
        meter(row.target ? row.progress / row.target : 0, { kind: row.claimed || ready ? 'good' : '' }));
    })),
    claimable
      ? button(claimable >= 2 ? t('claimAll', { n: claimable }) : t('panelClaim', { n: claimable }), { kind: 'primary', icon: 'check', onClick: (event) => {
        if (claimable < 2) { goScreen('quests'); return; }
        const btn = event?.currentTarget ?? null;
        if (btn) btn.disabled = true;
        import('../app/quests.js').then((m) => m.claimAllQuests(btn)).catch(() => {}).finally(() => refresh());
      } })
      : button(t('pcAllQuests'), { kind: 'link', onClick: () => goScreen('quests') }));
}

function seasonWidget() {
  const current = seasonAt();
  const entry = seasonEntry(state.profile, current.key);
  const next = nextRung(state.profile, current.key);
  const ready = claimableTiers(state.profile, current.key);
  const fraction = next ? (entry.points - next.from) / Math.max(1, next.need - next.from) : 1;
  return widget('is-season', 'calendar', tx(current.season.name), h('span.pch-widget-meta', t('pcSeasonDays', { n: daysLeft() })),
    h('div.pch-season',
      h('div.pch-season-line', h('span', next ? t('pcSeasonTier', { n: next.index + 1 }) : t('pcSeasonDoneShort')), h('b', next ? `${entry.points} / ${next.need}` : '')),
      meter(fraction)),
    ready
      ? button(ready >= 2 ? t('claimAll', { n: ready }) : t('panelClaim', { n: ready }), { kind: 'primary', icon: 'gift', onClick: (event) => {
        if (ready < 2) { goScreen('season'); return; }
        const btn = event?.currentTarget ?? null;
        if (btn) btn.disabled = true;
        import('../app/season.js').then((m) => m.claimAllSeason(btn)).catch(() => {}).finally(() => refresh());
      } })
      : button(t('pcOpenSeason'), { kind: 'link', onClick: () => goScreen('season') }));
}

function dropFirst(node, rank) {
  node.dataset.drop = String(rank);
  return node;
}

function fitHand(main) {
  const latest = main.querySelector('.pch-latest');
  const handNode = main.querySelector('.pch-hand');
  if (!latest) return;
  latest.hidden = false;
  const unit = rem();
  const box = main.getBoundingClientRect();
  const all = handNode ? [...handNode.children] : [];
  if (all.length) {
    const w = Math.max(5.2 * unit, Math.min(8.6 * unit, (box.height * 0.3) / 1.45));
    const gap = 0.9 * unit;
    const n = Math.max(1, Math.min(all.length, Math.floor((box.width + gap) / (w + gap))));
    all.forEach((card, i) => { card.hidden = i >= n; });
    handNode.style.setProperty('--hand-w', `${w}px`);
  }
  latest.hidden = box.height - latest.getBoundingClientRect().height < 27 * unit;
  const stageNode = main.querySelector('.pch-stage');
  stageNode?.classList.toggle('is-short', (stageNode?.getBoundingClientRect().height ?? 0) < 30 * unit);
}

function render() {
  signature = currentSignature();
  const main = h('div.pch-main', stage(), hand());
  const side = h('aside.pch-side',
    freeWidget(),
    dailyWidget(),
    dropFirst(questsWidget(), 1),
    dropFirst(seasonWidget(), 2));
  fill(home.node, main, side);
  observeSize(main, () => fitHand(main));
  fitStack(side);
  if (home.items.length) place();
  paintInfo();
  keep.mark();
}

function paintClocks() {
  const timed = state.profile.timed ?? {};
  const left = msToNext(timed);
  const freeState = home.node.querySelector('[data-live="free-state"]');
  if (freeState) freeState.textContent = left === null ? t('pcFreeFullShort') : t('pcFreeNext', { time: formatCountdown(left) });
  const ring = home.node.querySelector('.pch-dial-ring');
  if (ring && left !== null) {
    const step = regenMs(timedLevel(timed.opened ?? 0));
    ring.innerHTML = ringSvg(1 - left / step, { stroke: 6 });
  }
  const gift = home.node.querySelector('[data-live="gift"]');
  if (gift && !canClaim(state.profile.daily)) gift.textContent = t('panelGiftIn', { time: formatCountdown(msUntilNextUtcDay()) });
}

let signature = '';

function latestStamp() {
  let latest = 0;
  let copies = 0;
  for (const e of Object.values(state.collection?.entries ?? {})) {
    copies += e.count ?? 1;
    if ((e.lastPulledAt ?? 0) > latest) latest = e.lastPulledAt;
  }
  return `${latest}:${copies}`;
}

function currentSignature() {
  const board = quests.loadBoard(questUserKey());
  const season = seasonAt();
  return JSON.stringify([
    latestStamp(), state.profile.seasons?.[season.key]?.points ?? 0, season.key, (state.customPacks ?? []).length,
    Object.entries(state.inventory ?? {}).map(([id, s]) => `${id}:${s?.count}`),
    state.profile.timed?.count, state.profile.timed?.opened, state.profile.progress?.level, canClaim(state.profile.daily),
    board.quests.map((q) => `${q.id}:${q.progress}:${q.claimed}`), claimableTiers(state.profile),
    Object.keys(state.collection?.entries ?? {}).length, home.mode
  ]);
}

const keep = keeper(currentSignature);

function refresh() {
  if (isAway(home.node) || live.sheet?.open) return;
  if (currentSignature() !== signature) render();
  else paintClocks();
}

function key(event) {
  const list = lists()[home.mode];
  if (event.key === 'ArrowRight') { pick(home.picks[home.mode] + 1); event.preventDefault(); return; }
  if (event.key === 'ArrowLeft') { pick(home.picks[home.mode] - 1); event.preventDefault(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const modes = ['boosters', 'custom', 'free'];
    const at = modes.indexOf(home.mode);
    home.mode = modes[(at + (event.key === 'ArrowDown' ? 1 : -1) + modes.length) % modes.length];
    synth.playTap();
    render();
    event.preventDefault();
    return;
  }
  if (event.key === ' ' || (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement))) {
    const slot = list[home.picks[home.mode]];
    if (slot) openSlot(slot);
    event.preventDefault();
  }
}

function tick() {
  clearInterval(home.timer);
  home.timer = setInterval(refresh, 1000);
}

registerView('home', {
  node: home.node,
  screens: ['home'],
  render() {
    render();
    tick();
  },
  show() {
    if (!keep.fresh()) { render(); tick(); return; }
    paintClocks();
    const slot = lists()[home.mode][home.picks[home.mode]];
    if (slot) schedulePrefetch(slot.spec);
    tick();
  },
  key,
  prompts: () => [['←  →', t('pcPromptPick')], ['↑  ↓', t('pcPromptShelf')], [t('pcSpace'), t('openPack')]]
});

export const homeSlotId = () => {
  const slot = lists()[home.mode][home.picks[home.mode]];
  return slot ? specId(slot.spec) : null;
};

addEventListener('resize', () => { if (!isAway(home.node) && home.items.length) place(); });
