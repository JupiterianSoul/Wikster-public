import { padLabel } from './gamepad.js';
import { t } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { h, fill } from '../ui/dom.js';
import { synth } from '../ui/sound.js';
import { closeDropdown, dropdown as makeDropdown, dropdownOpen } from '../ui/dropdown.js';

export { keeper } from '../app/keep.js';

export const rem = () => (Number(document.documentElement.style.getPropertyValue('--pc-s')) || 1) * 16;

export const keycap = (label) => h('kbd.pcx-key', { dataset: { key: label } }, padLabel(label));

export function button(label, { kind = 'ghost', icon = null, key = null, size = '', onClick, title = null, disabled = false } = {}) {
  const btn = h(`button.pcx-btn.is-${kind}${size ? `.is-${size}` : ''}`, { type: 'button', title, disabled },
    icon ? h('span.pcx-btn-icon', { html: iconSvg(icon, { size: 18 }) }) : null,
    label != null ? h('span.pcx-btn-label', label) : null,
    key ? keycap(key) : null);
  btn.addEventListener('click', (event) => {
    if (btn.disabled) return;
    synth.playTap();
    onClick?.(event);
  });
  return btn;
}

export const iconButton = (icon, { title, onClick, kind = 'ghost' } = {}) => {
  const btn = h(`button.pcx-icon-btn.is-${kind}`, { type: 'button', title, 'aria-label': title },
    h('span', { html: iconSvg(icon, { size: 20 }) }));
  btn.addEventListener('click', (event) => { synth.playTap(); onClick?.(event); });
  return btn;
};

export const heading = (text, ...extra) => h('header.pcx-heading', h('h3.pcx-title', text), h('span.pcx-rule'), ...extra);

export const meter = (fraction, { kind = '' } = {}) => h(`span.pcx-meter${kind ? `.is-${kind}` : ''}`,
  h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, fraction || 0)) * 1000) / 10}%` } }));

export function segmented(options, value, onChange, { name = '' } = {}) {
  const wrap = h('div.pcx-seg', { role: 'tablist', 'aria-label': name });
  const paint = (current) => {
    for (const node of wrap.children) {
      const on = node.dataset.value === current;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-selected', String(on));
    }
  };
  fill(wrap, options.map((opt) => {
    const btn = h('button.pcx-seg-item', { type: 'button', role: 'tab', dataset: { value: opt.value } },
      opt.icon ? h('span.pcx-seg-icon', { html: iconSvg(opt.icon, { size: 17 }) }) : null,
      h('span', opt.label),
      opt.count != null ? h('span.pcx-seg-count', String(opt.count)) : null);
    btn.addEventListener('click', () => {
      if (btn.dataset.value === value) return;
      synth.playTap();
      value = opt.value;
      paint(value);
      onChange(opt.value);
    });
    return btn;
  }));
  paint(value);
  return wrap;
}

export function dropdown(options, value, onChange, { label = '', icon = null, search = false, width = null, name = '' } = {}) {
  const owner = makeDropdown(options, value, (next) => { synth.playTap(); onChange(next); },
    { label: label || name, className: 'pcx-drop', search: search || null, panelWidth: width });
  if (label) owner.title = label;
  owner.prepend(...[
    icon ? h('span.pcx-drop-icon', { slot: 'before', html: iconSvg(icon, { size: 17 }) }) : null,
    label ? h('span.pcx-drop-label', { slot: 'before' }, label) : null
  ].filter(Boolean));
  owner.set = (next) => { owner.value = next; };
  return owner;
}

export const popOpen = () => dropdownOpen();
export const closePop = () => closeDropdown({ focus: false });

export function searchField({ value = '', placeholder = '', onInput, hotkey = null } = {}) {
  const input = h('input.pcx-search-input', { type: 'search', value, placeholder, 'aria-label': placeholder, spellcheck: 'false' });
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => onInput?.(input.value), 110);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) { input.value = ''; onInput?.(''); event.stopPropagation(); event.preventDefault(); }
    else if (event.key === 'Escape' || event.key === 'Enter') { input.blur(); event.preventDefault(); event.stopPropagation(); }
  });
  const wrap = h('label.pcx-search', h('span.pcx-search-icon', { html: iconSvg('search', { size: 17 }) }), input, hotkey ? keycap(hotkey) : null);
  wrap.input = input;
  return wrap;
}

export class Pager {
  constructor({ onChange, dots = 14 } = {}) {
    this.page = 0;
    this.pages = 1;
    this.onChange = onChange;
    this.maxDots = dots;
    this.prev = h('button.pcx-page-arrow', { type: 'button', title: t('pcPrevPage'), 'aria-label': t('pcPrevPage') },
      h('span', { html: iconSvg('chevronLeft', { size: 20 }) }));
    this.next = h('button.pcx-page-arrow', { type: 'button', title: t('pcNextPage'), 'aria-label': t('pcNextPage') },
      h('span', { html: iconSvg('chevronRight', { size: 20 }) }));
    this.track = h('div.pcx-page-track');
    this.node = h('nav.pcx-pager', { 'aria-label': t('pcPages') }, this.prev, this.track, this.next);
    this.prev.addEventListener('click', () => this.go(this.page - 1, true));
    this.next.addEventListener('click', () => this.go(this.page + 1, true));
  }

  set(page, pages) {
    this.pages = Math.max(1, pages);
    this.page = Math.max(0, Math.min(this.pages - 1, page));
    this.paint();
  }

  go(page, sound = false) {
    const next = Math.max(0, Math.min(this.pages - 1, page));
    if (next === this.page) return false;
    if (sound) synth.playPageTurn();
    const dir = next > this.page ? 1 : -1;
    this.page = next;
    this.paint();
    this.onChange?.(next, dir);
    return true;
  }

  paint() {
    this.node.classList.toggle('is-single', this.pages <= 1);
    this.node.setAttribute('aria-hidden', String(this.pages <= 1));
    this.prev.disabled = this.page <= 0;
    this.next.disabled = this.page >= this.pages - 1;
    if (this.pages <= this.maxDots) {
      fill(this.track, Array.from({ length: this.pages }, (_, i) => {
        const dot = h('button.pcx-page-dot', { type: 'button', 'aria-label': String(i + 1) });
        dot.classList.toggle('is-on', i === this.page);
        dot.addEventListener('click', () => this.go(i, true));
        return dot;
      }));
    } else {
      fill(this.track, h('span.pcx-page-count', h('b', String(this.page + 1)), h('span', ` / ${this.pages}`)));
    }
  }
}

export function fitGrid(box, { aspect, extra = 0, gap, minW, maxW, maxRows = 6, target = null }) {
  const W = box.width;
  const H = box.height;
  if (W <= 0 || H <= 0) return { cols: 1, rows: 1, w: minW, h: minW * aspect + extra };
  let best = null;
  for (let rows = 1; rows <= maxRows; rows++) {
    const cellH = (H - gap * (rows - 1)) / rows;
    let w = Math.min(maxW, (cellH - extra) / aspect);
    if (w < minW) break;
    const cols = Math.max(1, Math.floor((W + gap) / (w + gap)));
    w = Math.min(w, (W - gap * (cols - 1)) / cols);
    const score = cols * rows * (target ? Math.min(1, w / target) ** 2 : 1);
    if (!best || score > best.score) best = { cols, rows, w, h: w * aspect + extra, score };
  }
  if (!best) {
    const w = Math.max(24, Math.min(maxW, (H - extra) / aspect));
    const cols = Math.max(1, Math.floor((W + gap) / (w + gap)));
    best = { cols, rows: 1, w, h: w * aspect + extra };
  }
  return best;
}

export function wheelPager(node, pager) {
  let lock = 0;
  node.addEventListener('wheel', (event) => {
    if (event.ctrlKey) return;
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 4) return;
    event.preventDefault();
    const now = performance.now();
    if (now < lock) return;
    lock = now + 260;
    pager.go(pager.page + (delta > 0 ? 1 : -1), true);
  }, { passive: false });
}

export function pageKeys(event, pager) {
  if (event.key === 'PageDown' || event.key === ']') { pager.go(pager.page + 1, true); return true; }
  if (event.key === 'PageUp' || event.key === '[') { pager.go(pager.page - 1, true); return true; }
  if (event.key === 'Home' && pager.pages > 1) { pager.go(0, true); return true; }
  if (event.key === 'End' && pager.pages > 1) { pager.go(pager.pages - 1, true); return true; }
  return false;
}

export function empty(icon, title, note, ...actions) {
  return h('div.pcx-empty',
    h('span.pcx-empty-mark', { html: iconSvg(icon, { size: 44 }) }),
    h('h3', title),
    note ? h('p', note) : null,
    actions.length ? h('div.pcx-row', actions) : null);
}

export function observeSize(node, run) {
  let last = '';
  const ro = new ResizeObserver(() => {
    const box = node.getBoundingClientRect();
    const key = `${Math.round(box.width)}x${Math.round(box.height)}`;
    if (key === last || !box.width) return;
    last = key;
    run(box);
  });
  ro.observe(node);
  return ro;
}

export function fitStack(node, { gap = 0 } = {}) {
  const kids = () => [...node.children].sort((a, b) => Number(b.dataset.drop ?? 0) - Number(a.dataset.drop ?? 0));
  const over = () => node.scrollHeight > node.clientHeight + 1;
  const run = () => {
    if (!node.isConnected || !node.clientHeight) return;
    for (const kid of node.children) kid.classList.remove('pc-dropped');
    for (const kid of kids()) {
      if (!over()) break;
      if (!kid.dataset.drop) break;
      kid.classList.add('pc-dropped');
    }
    node.classList.toggle('is-crowded', over());
  };
  observeSize(node, run);
  requestAnimationFrame(run);
  return run;
}

export function fitPanel(panel, { media, prop = '--pack-h', max, min, drops = [] }) {
  const unit = () => rem();
  const over = () => panel.scrollHeight - panel.clientHeight;
  const run = () => {
    if (!panel.isConnected || !panel.clientHeight || !media) return;
    const hi = max * unit();
    const lo = min * unit();
    for (const node of drops) node?.classList.remove('pc-dropped');
    const tryFit = () => {
      media.style.setProperty(prop, `${hi}px`);
      const extra = over();
      if (extra <= 1) return true;
      const next = Math.max(lo, hi - extra - 2);
      media.style.setProperty(prop, `${next}px`);
      return over() <= 1 && next > lo;
    };
    if (tryFit()) return;
    for (const node of drops) {
      if (!node) continue;
      node.classList.add('pc-dropped');
      if (tryFit()) return;
    }
  };
  observeSize(panel, run);
  requestAnimationFrame(run);
  return run;
}

export function fitRow(node) {
  const over = () => {
    if (node.scrollWidth > node.clientWidth + 1) return true;
    const edge = node.getBoundingClientRect().right + 1;
    return [...node.children].some((kid) => !kid.classList.contains('pc-dropped') && kid.getBoundingClientRect().right > edge);
  };
  const run = () => {
    if (!node.isConnected || !node.clientWidth) return;
    node.classList.remove('is-tight', 'is-wrap');
    for (const kid of node.children) kid.classList.remove('pc-dropped');
    if (!over()) return;
    node.classList.add('is-tight');
    const kids = [...node.children].filter((kid) => kid.dataset.drop)
      .sort((a, b) => Number(b.dataset.drop) - Number(a.dataset.drop));
    for (const kid of kids) {
      if (!over()) return;
      kid.classList.add('pc-dropped');
    }
    if (over()) node.classList.add('is-wrap');
  };
  observeSize(node, run);
  new MutationObserver(() => requestAnimationFrame(run)).observe(node, { childList: true });
  requestAnimationFrame(run);
  return run;
}
