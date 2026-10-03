import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { h } from '../ui/dom.js';
import { specId } from '../booster.js';
import { synth } from '../ui/sound.js';
import { el, settings, state } from '../app/core.js';
import { completeRip, goTo, layoutDeck, openScreenFor, setFastOpen, skipToSummary, stackDeck, tapOpens, toggleBatch, useDeckLayout } from '../app/open.js';
import * as store from '../collection.js';
import { keycap, segmented } from './kit.js';

const phase = (name) => el.openScreen?.classList.contains(`phase-${name}`);
const opening = () => el.openScreen?.classList.contains('is-active');

function spread() {
  const cards = state.cards;
  const stack = el.cardStack;
  if (!cards.length || !stack) return;
  const box = stack.getBoundingClientRect();
  const s = Number(getComputedStyle(document.documentElement).getPropertyValue('--pc-s')) || 1;
  const gap = 22 * s;
  const n = cards.length;
  const rows = Math.max(1, Math.ceil(n / 8));
  const cols = Math.ceil(n / rows);
  const byWidth = (box.width - gap * (cols - 1)) / cols;
  const byHeight = ((box.height - gap * (rows - 1)) / rows) * (5 / 7);
  const width = Math.max(60, Math.min(byWidth, byHeight, 300 * s));
  const height = width * 1.4;
  stack.style.setProperty('--pc-card-w', `${width}px`);
  const revealing = phase('reveal') || phase('summary');
  cards.forEach((card, i) => {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const col = i - row * cols;
    const x = (col - (inRow - 1) / 2) * (width + gap);
    const y = (row - (rows - 1) / 2) * (height + gap);
    const focus = revealing && i === state.index && !phase('summary');
    card.classList.toggle('is-focus', focus);
    card.style.opacity = '1';
    card.style.zIndex = String(focus ? 60 : 10 + i);
    card.style.transform = `translate(${x}px, ${y}px)${focus ? ' translateY(-4%) scale(1.07)' : ''}`;
  });
}

function stack() {
  const box = el.cardStack.getBoundingClientRect();
  const s = Number(getComputedStyle(document.documentElement).getPropertyValue('--pc-s')) || 1;
  const width = Math.max(120, Math.min((box.height * 0.9) / 1.4, box.width * 0.6, 26 * 16 * s));
  el.cardStack.style.setProperty('--pc-card-w', `${width}px`);
  for (const card of state.cards) card.classList.remove('is-focus');
  stackDeck();
}

const spreadOn = () => settings().spreadOpen !== false;

function layout() {
  const summary = phase('summary');
  const table = spreadOn() || summary;
  if (summary) {
    state.cards.filter((card) => !card.classList.contains('is-revealed'))
      .forEach((card, i) => setTimeout(() => card.classList.add('is-revealed', 'is-lit'), 90 * i));
  }
  el.openScreen.classList.toggle('is-stack', !table);
  if (table) spread();
  else stack();
}

let viewSlot = null;
let fastButton = null;

function paintFast() {
  if (!fastButton) return;
  const on = Boolean(settings().skipOpening);
  fastButton.setAttribute('aria-checked', String(on));
  fastButton.querySelector('.switch')?.classList.toggle('is-on', on);
}

function flipFast() {
  synth.resume();
  setFastOpen(!settings().skipOpening);
  synth.playToggle(Boolean(settings().skipOpening));
  paintFast();
  hintFor();
}

function paintView() {
  if (!viewSlot) return;
  const seg = segmented([
    { value: 'table', label: t('pcTableView'), icon: 'grid' },
    { value: 'stack', label: t('pcStackView'), icon: 'collection' }
  ], spreadOn() ? 'table' : 'stack', (value) => setSpread(value === 'table'), { name: t('pcCardLayout') });
  viewSlot.replaceChildren(fastButton ?? '', seg, keycap('V'));
  paintFast();
}

function setSpread(on) {
  if (spreadOn() === on) return;
  settings().spreadOpen = on;
  store.saveProfile(state.profile);
  paintView();
  if (!phase('idle')) layoutDeck();
  else el.openScreen.classList.toggle('is-stack', !on);
}

function nextHidden() {
  const n = state.pulls.length;
  for (let i = 1; i <= n; i++) {
    const at = (state.index + i) % n;
    if (!state.seen.has(at)) return at;
  }
  return null;
}

function advance() {
  const next = nextHidden();
  if (next == null) { skipToSummary(); return; }
  goTo(next);
}

function again() {
  const spec = state.spec;
  if (spec && (state.inventory?.[specId(spec)]?.count ?? 0) > 0) {
    synth.playTap();
    openScreenFor(spec);
    return true;
  }
  return false;
}

export function openingKey(event) {
  if (!opening()) return false;
  const key = event.key;
  if (key === 'v' || key === 'V') { synth.playTap(); setSpread(!spreadOn()); return true; }
  if ((key === 'f' || key === 'F') && (phase('idle') || phase('summary'))) { flipFast(); return true; }
  if ((key === 'a' || key === 'A') && (phase('idle') || phase('summary'))) { synth.resume(); toggleBatch(); return true; }
  if (phase('idle')) {
    if (key === ' ' || key === 'Enter') { completeRip(); return true; }
    if (key === 'Escape') { el.openBack?.click(); return true; }
    return false;
  }
  if (phase('reveal')) {
    if (key === ' ' || key === 'Enter' || key === 'ArrowRight') { synth.resume(); advance(); return true; }
    if (key === 'ArrowLeft') { goTo(state.index - 1); return true; }
    if (key === 'Escape') { skipToSummary(); return true; }
    return false;
  }
  if (phase('summary')) {
    if (key === ' ') { if (!again()) el.openDone?.click(); return true; }
    if (key === 'Enter' || key === 'Escape') { el.openDone?.click(); return true; }
    return false;
  }
  return phase('opening') && (key === ' ' || key === 'Enter');
}

function idleHint() {
  if (state.batch) return t('pcOpenAllHint', { n: state.batch });
  return tapOpens() ? t('pcTapHint') : t('pcRipHint');
}

function hintFor() {
  if (!opening()) return;
  if (phase('idle') && !el.openHint.classList.contains('is-error') && !el.openHint.classList.contains('is-warn') && !el.openHint.classList.contains('is-arriving')) {
    el.openHint.textContent = idleHint();
  } else if (phase('reveal')) {
    el.openHint.textContent = state.seen.size >= state.pulls.length ? t(state.growing ? 'cardsArriving' : 'pcRevealDone') : t('pcRevealHint');
  } else if (phase('summary')) {
    const more = state.spec && (state.inventory?.[specId(state.spec)]?.count ?? 0) > 0;
    el.openHint.textContent = more ? t('pcSummaryMore') : t('pcSummaryDone');
  }
}

let againButton = null;

function paintAgain() {
  if (!againButton) return;
  const left = state.spec ? (state.inventory?.[specId(state.spec)]?.count ?? 0) : 0;
  againButton.hidden = !(phase('summary') && left > 0);
  againButton.querySelector('.pc-open-again-count').textContent = `×${left}`;
}

export function mountOpening() {
  useDeckLayout(layout);
  fastButton = h('button.pcx-btn.pc-open-fast', { type: 'button', role: 'switch', 'aria-checked': 'false', title: t('settingsSkipOpeningNote') },
    h('span', t('openSkipAnim')),
    h('span.switch', { 'aria-hidden': 'true' }, h('span.switch-knob')),
    keycap('F'));
  fastButton.addEventListener('click', flipFast);
  viewSlot = h('div.pc-open-view');
  el.openSkip.before(viewSlot);
  paintView();
  el.openScreen.classList.toggle('is-stack', !spreadOn());
  againButton = h('button.pcx-btn.is-primary.is-big.pc-open-again', { type: 'button', hidden: true },
    h('span.pcx-btn-icon', { html: iconSvg('packs', { size: 18 }) }),
    h('span', t('pcOpenAnother')),
    h('span.pc-open-again-count'),
    keycap(t('pcSpace')));
  againButton.addEventListener('click', () => again());
  el.openDone.parentElement.insertBefore(h('div.pc-open-actions', againButton), el.openDone);
  againButton.parentElement.appendChild(el.openDone);
  el.cardStack.addEventListener('click', (event) => {
    const card = event.target.closest('.stack-card');
    if (!card || !phase('reveal')) return;
    const i = state.cards.indexOf(card);
    if (i >= 0 && !card.classList.contains('is-revealed')) { event.stopPropagation(); synth.resume(); goTo(i); }
  }, { capture: true });
  addEventListener('resize', () => { if (opening() && !phase('idle')) layoutDeck(); });
  new MutationObserver(() => {
    hintFor();
    paintAgain();
    paintFast();
    if (phase('summary')) layoutDeck();
    if (phase('idle') && viewSlot.dataset.on !== String(spreadOn())) { viewSlot.dataset.on = String(spreadOn()); paintView(); el.openScreen.classList.toggle('is-stack', !spreadOn()); }
  })
    .observe(el.openScreen, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => {
    const want = phase('idle') ? idleHint() : phase('reveal') ? (state.seen.size >= state.pulls.length ? t(state.growing ? 'cardsArriving' : 'pcRevealDone') : t('pcRevealHint')) : null;
    if (want && el.openHint.textContent !== want && !el.openHint.classList.contains('is-error') && !el.openHint.classList.contains('is-warn') && !el.openHint.classList.contains('is-arriving')) hintFor();
  }).observe(el.openHint, { childList: true, characterData: true, subtree: true });
}
