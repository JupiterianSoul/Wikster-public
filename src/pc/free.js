import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { RARITIES } from '../data/rarities.js';
import { formatCountdown } from '../shop.js';
import { LEVEL_STEPS, MAX_TIMED_LEVEL, TIMED_CARDS, levelProgress, maxHeld, msToNext, regenMs, timedLevel, timedTopTier } from '../timed.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { state } from '../app/core.js';
import { buildBooster, currentTimedSpec, openAllTimed, openTimed, syncTimed } from '../app/packs.js';
import { schedulePrefetch } from '../app/open.js';
import { live } from '../app/live.js';
import { isAway, registerView } from './shell.js';
import { button, fitPanel, fitStack, heading, keeper, meter } from './kit.js';
import { ringSvg } from './home.js';

const view = { node: h('section.pc-view.pcf'), timer: null };

function ladder(level, opened) {
  return h('ol.pcf-ladder', Array.from({ length: MAX_TIMED_LEVEL }, (_, i) => {
    const n = i + 1;
    const top = timedTopTier(n);
    const maxed = top.id === RARITIES[RARITIES.length - 1].id;
    const state = n < level ? 'is-done' : n === level ? 'is-now' : 'is-next';
    const away = n === level ? null : String(Math.abs(n - level) * 2 + (n < level ? 1 : 0));
    return h(`li.pcf-rung.${state}`, { dataset: away ? { drop: away } : {} },
      h('span.pcf-rung-mark', n < level ? h('span', { html: iconSvg('check', { size: 16 }) }) : String(n)),
      h('div.pcf-rung-body',
        h('div.pcf-rung-head',
          h('b', t('freeLevel', { level: n })),
          h('span.pcf-rung-need', n === 1 ? t('pcFreeStart') : t('pcFreeNeed', { n: LEVEL_STEPS[i] }))),
        h('div.pcf-rung-perks',
          h('span', { html: `${iconSvg('clock', { size: 14 })}<span>${t('pcFreeEvery', { n: Math.round(regenMs(n) / 60000) })}</span>` }),
          h('span', { html: `${iconSvg('packs', { size: 14 })}<span>${t('pcFreeHolds', { n: maxHeld(n) })}</span>` }),
          h('span', { style: { '--rarity': top.color }, html: `${iconSvg('gem', { size: 14 })}<span>${maxed ? t('pcFreeAnyTier') : t('pcFreeUpTo', { tier: tx(top.name) })}</span>` })),
        n === level && level < MAX_TIMED_LEVEL
          ? h('div.pcf-rung-progress', meter(levelProgress(opened)), h('span', t('pcFreeToGo', { n: LEVEL_STEPS[level] - opened })))
          : null));
  }));
}

function render() {
  const timed = syncTimed();
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const held = timed.count ?? 0;
  const left = msToNext(timed);
  const step = regenMs(level);
  const spec = currentTimedSpec();
  schedulePrefetch(spec);
  const art = buildBooster(spec, { size: 'is-pc-free' });
  art.addEventListener('click', () => { if (held) openTimed(); else synth.playDenied(); });
  signature = `${held}|${timed.opened}|${cap}`;
  fill(view.node,
    h('section.pcf-show',
      h('div.pcf-show-glow'),
      h('div.pcf-art', art),
      h('p.pcx-kicker', t('pcFreeKicker', { level })),
      h('h2.pcf-title', t('tabTimed')),
      h('p.pcf-lede', t('freeFoot', { cards: TIMED_CARDS, minutes: Math.round(step / 60000) }))),
    h('section.pcf-dial-panel.pcx-panel',
      h('div.pcf-dial',
        h('span.pcf-dial-ring', { html: ringSvg(left === null ? 1 : 1 - left / step, { stroke: 4 }) }),
        h('div.pcf-dial-core',
          h('b', { dataset: { live: 'count' } }, String(held)),
          h('small', t('pcOfMax', { n: cap })))),
      h('p.pcf-state', { dataset: { live: 'state' } }, left === null ? t('pcFreeFullShort') : t('pcFreeNext', { time: formatCountdown(left) })),
      h('div.pcf-pips', Array.from({ length: cap }, (_, i) => h(`i${i < held ? '.is-on' : ''}`))),
      h('div.pcf-actions',
        button(t('timedOpen'), { kind: 'primary', size: 'big', icon: 'packs', key: t('pcSpace'), disabled: held < 1, onClick: () => openTimed() }),
        button(t('timedOpenAll', { n: held }), { size: 'big', key: 'A', disabled: held < 2, onClick: () => openAllTimed() }))),
    h('section.pcf-track.pcx-panel',
      heading(t('pcFreeTrackTitle'), h('span.pcx-chip', t('pcFreeOpened', { n: timed.opened ?? 0 }))),
      ladder(level, timed.opened ?? 0)));
  const show = view.node.querySelector('.pcf-show');
  fitPanel(show, { media: show.querySelector('.pcf-art'), max: 24, min: 9, drops: [show.querySelector('.pcf-lede')] });
  const dial = view.node.querySelector('.pcf-dial-panel');
  fitPanel(dial, { media: dial.querySelector('.pcf-dial'), prop: '--dial', max: 20, min: 8, drops: [dial.querySelector('.pcf-pips')] });
  fitStack(view.node.querySelector('.pcf-ladder'));
  keep.mark();
}

function tick() {
  if (isAway(view.node) || live.sheet?.open) return;
  const timed = syncTimed();
  const level = timedLevel(timed.opened ?? 0);
  if (`${timed.count ?? 0}|${timed.opened}|${maxHeld(level)}` !== signature) { render(); return; }
  const left = msToNext(timed);
  const node = view.node.querySelector('[data-live="state"]');
  if (node) node.textContent = left === null ? t('pcFreeFullShort') : t('pcFreeNext', { time: formatCountdown(left) });
  const ring = view.node.querySelector('.pcf-dial-ring');
  if (ring && left !== null) ring.innerHTML = ringSvg(1 - left / regenMs(level), { stroke: 4 });
}

let signature = '';
const keep = keeper(() => {
  const timed = state.profile.timed ?? {};
  return `${timed.count ?? 0}|${timed.opened}|${maxHeld(timedLevel(timed.opened ?? 0))}|${JSON.stringify(currentTimedSpec())}`;
});

registerView('free', {
  node: view.node,
  screens: ['timed'],
  render() {
    render();
    clearInterval(view.timer);
    view.timer = setInterval(tick, 1000);
  },
  show() {
    syncTimed();
    if (!keep.fresh()) { this.render(); return; }
    schedulePrefetch(currentTimedSpec());
    tick();
    clearInterval(view.timer);
    view.timer = setInterval(tick, 1000);
  },
  key(event) {
    const held = state.profile.timed?.count ?? 0;
    if (event.key === ' ' || (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement))) {
      if (held) openTimed(); else synth.playDenied();
      event.preventDefault();
    } else if (event.key.toLowerCase() === 'a' && held > 1) {
      openAllTimed();
      event.preventDefault();
    }
  },
  prompts: () => [[t('pcSpace'), t('timedOpen')], ['A', t('pcPromptAll')]]
});
