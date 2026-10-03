import { iconSvg } from '../data/icons.js';
import { t } from '../i18n.js';
import { synth } from './sound.js';

const TAG = 'wk-select';
const SEARCH_AT = 12;
const TYPE_GAP = 700;
let seq = 0;
let openNow = null;
const typed = { text: '', at: 0 };

const SHADOW = `
:host { display: inline-flex; align-items: center; gap: 0.5em; box-sizing: border-box; min-width: 0; cursor: pointer; user-select: none; -webkit-user-select: none; vertical-align: middle; -webkit-tap-highlight-color: transparent; }
:host([hidden]) { display: none !important; }
:host([disabled]) { cursor: default; opacity: 0.55; }
.value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: start; }
.mark { flex: none; display: grid; place-items: center; }
.mark[hidden] { display: none; }
.dot { width: 0.55em; height: 0.55em; border-radius: 2px; transform: rotate(45deg); background: var(--dot); box-shadow: 0 0 0.45em color-mix(in srgb, var(--dot) 70%, transparent); }
.mark svg { width: 1.2em; height: 1.2em; }
.caret { flex: none; display: grid; place-items: center; margin-inline-end: -0.2em; opacity: 0.8; transition: transform calc(180ms * var(--motion-scale, 1)) var(--ease, ease); }
.caret svg { width: 1.1em; height: 1.1em; }
:host([aria-expanded='true']) .caret { transform: rotate(180deg); }
`;

const fold = (text) => String(text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const sheetMode = () => !document.documentElement.classList.contains('is-pc') && (coarse() || innerWidth < 640);
const textOf = (option) => (option.label || option.textContent || '').trim();

function markFor(option, className) {
  const dot = option.dataset.dot;
  const art = option.wkArt;
  if (!dot && !art) return null;
  const mark = document.createElement('span');
  mark.className = className;
  mark.setAttribute('aria-hidden', 'true');
  if (art) {
    mark.classList.add('is-art');
    mark.innerHTML = art;
    const accent = option.dataset.accent;
    if (accent) {
      mark.style.setProperty('--e1', `color-mix(in srgb, ${accent} 55%, #ffffff)`);
      mark.style.setProperty('--e2', accent);
      mark.style.setProperty('--e3', option.dataset.accent2 || accent);
      mark.style.setProperty('--mark', accent);
    }
  } else {
    const gem = document.createElement('i');
    gem.className = 'dot';
    mark.style.setProperty('--dot', dot);
    mark.appendChild(gem);
  }
  return mark;
}

class WkSelect extends HTMLElement {
  static observedAttributes = ['disabled'];
  #value = null;
  #watch = null;
  #mark;
  #text;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${SHADOW}</style><slot name="before"></slot><span class="mark" part="mark" hidden></span><span class="value" part="value"></span><span class="caret" part="caret">${iconSvg('chevronDown', { size: 16 })}</span>`;
    this.#mark = root.querySelector('.mark');
    this.#text = root.querySelector('.value');
    this.addEventListener('click', (event) => {
      if (this.disabled) return;
      event.preventDefault();
      if (openNow?.host === this) closeDropdown();
      else openDropdown(this);
    });
    this.addEventListener('keydown', (event) => this.#key(event));
  }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = this.disabled ? -1 : 0;
    if (!this.hasAttribute('role')) this.setAttribute('role', 'combobox');
    this.setAttribute('aria-haspopup', 'listbox');
    if (!this.hasAttribute('aria-expanded')) this.setAttribute('aria-expanded', 'false');
    this.#watch ??= new MutationObserver(() => this.refresh());
    this.#watch.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'label', 'disabled', 'hidden', 'selected', 'data-dot'] });
    this.refresh();
  }

  disconnectedCallback() {
    this.#watch?.disconnect();
    if (openNow?.host === this) closeDropdown({ focus: false });
  }

  attributeChangedCallback() {
    this.setAttribute('aria-disabled', String(this.disabled));
    if (this.isConnected) this.tabIndex = this.disabled ? -1 : 0;
    if (this.disabled && openNow?.host === this) closeDropdown({ focus: false });
  }

  get options() { return [...this.querySelectorAll('option')]; }
  get length() { return this.querySelectorAll('option').length; }
  get label() { return this.getAttribute('aria-label') ?? ''; }

  get selectedOption() {
    const list = this.options;
    if (this.#value !== null) {
      const hit = list.find((o) => o.value === this.#value);
      if (hit) return hit;
    }
    return list.find((o) => o.hasAttribute('selected')) ?? list.find((o) => !o.disabled) ?? list[0] ?? null;
  }

  get selectedIndex() {
    const option = this.selectedOption;
    return option ? this.options.indexOf(option) : -1;
  }

  set selectedIndex(index) {
    const option = this.options[index];
    this.#value = option ? option.value : null;
    this.refresh();
  }

  get value() { return this.selectedOption?.value ?? ''; }
  set value(next) {
    this.#value = next == null ? '' : String(next);
    this.refresh();
  }

  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(on) { this.toggleAttribute('disabled', Boolean(on)); }

  get open() { return openNow?.host === this; }

  refresh() {
    const option = this.selectedOption;
    this.#text.textContent = option ? textOf(option) : '';
    const mark = option ? markFor(option, 'mark-in') : null;
    this.#mark.hidden = !mark;
    this.#mark.replaceChildren(...(mark ? [...mark.childNodes] : []));
    if (mark) this.#mark.style.cssText = mark.style.cssText;
    if (openNow?.host === this) openNow.sync();
  }

  choose(option) {
    if (!option || option.disabled) return false;
    const changed = option.value !== this.value;
    this.#value = option.value;
    this.refresh();
    if (changed) {
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return changed;
  }

  #key(event) {
    if (openNow?.host === this || this.disabled || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    const stop = () => { event.preventDefault(); event.stopPropagation(); };
    if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'ArrowUp' || key === 'F4') {
      stop();
      openDropdown(this, { keys: true });
      return;
    }
    const usable = this.options.filter((o) => !o.disabled && !o.hidden);
    if (key === 'Home' || key === 'End') {
      stop();
      this.choose(key === 'Home' ? usable[0] : usable.at(-1));
      return;
    }
    if (key.length === 1 && !event.altKey && /\S/.test(key)) {
      const hit = typeAhead(usable, key, this.selectedOption);
      if (hit) { stop(); this.choose(hit); }
    }
  }
}

function typeAhead(list, key, from) {
  const now = performance.now();
  typed.text = now - typed.at > TYPE_GAP ? key : typed.text + key;
  typed.at = now;
  const want = fold(typed.text);
  const start = list.indexOf(from);
  const order = start < 0 ? list
    : typed.text.length === 1 ? [...list.slice(start + 1), ...list.slice(0, start + 1)] : [...list.slice(start), ...list.slice(0, start)];
  return order.find((o) => fold(textOf(o)).startsWith(want)) ?? null;
}

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) customElements.define(TAG, WkSelect);

export const dropdownOpen = () => Boolean(openNow);

export function closeDropdown({ focus = true } = {}) {
  const now = openNow;
  if (!now) return false;
  openNow = null;
  now.host.setAttribute('aria-expanded', 'false');
  now.host.removeAttribute('aria-controls');
  now.host.removeAttribute('aria-activedescendant');
  document.removeEventListener('pointerdown', now.away, true);
  document.removeEventListener('keydown', now.keys, true);
  document.removeEventListener('scroll', now.scrolled, true);
  removeEventListener('resize', now.resized);
  const inside = now.layer.contains(document.activeElement);
  const gone = () => {
    try { if (now.layer.matches(':popover-open')) now.layer.hidePopover(); } catch {}
    now.layer.remove();
  };
  if (now.sheet) {
    now.layer.classList.add('is-leaving');
    setTimeout(gone, 180 * motionScale());
  } else {
    gone();
  }
  if (focus || inside) now.host.focus({ preventScroll: true });
  dispatchEvent(new Event('wikster:dropdown'));
  return true;
}

function motionScale() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale'));
  return Number.isFinite(v) ? v : 1;
}

export function openDropdown(host, { keys = false } = {}) {
  closeDropdown({ focus: false });
  if (!host?.isConnected || host.disabled) return;
  const id = `wkd-${++seq}`;
  const sheet = sheetMode();
  const options = host.options.filter((o) => !o.hidden);
  const searchable = host.hasAttribute('search') ? host.getAttribute('search') !== 'off' : options.length >= SEARCH_AT;
  const label = host.label || host.getAttribute('title') || '';

  const layer = document.createElement('div');
  layer.className = `wk-drop ${sheet ? 'is-sheet' : 'is-pop'}`;
  layer.dataset.for = host.id || host.dataset.key || '';
  const panel = document.createElement('div');
  panel.className = 'wk-drop-panel';
  if (sheet) {
    const scrim = document.createElement('div');
    scrim.className = 'wk-drop-scrim';
    scrim.addEventListener('click', () => closeDropdown());
    layer.appendChild(scrim);
    const handle = document.createElement('div');
    handle.className = 'wk-drop-handle';
    handle.setAttribute('aria-hidden', 'true');
    panel.appendChild(handle);
    if (label) {
      const head = document.createElement('div');
      head.className = 'wk-drop-head';
      head.textContent = label;
      panel.appendChild(head);
    }
  }
  const search = searchable ? document.createElement('input') : null;
  if (search) {
    search.type = 'search';
    search.className = 'wk-drop-search';
    search.placeholder = t('pcSearch');
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.setAttribute('aria-label', label ? `${t('pcSearch')}: ${label}` : t('pcSearch'));
    search.setAttribute('aria-controls', `${id}-list`);
    search.setAttribute('aria-autocomplete', 'list');
    panel.appendChild(search);
  }
  const list = document.createElement('div');
  list.className = 'wk-drop-list';
  list.id = `${id}-list`;
  list.tabIndex = -1;
  list.setAttribute('role', 'listbox');
  if (label) list.setAttribute('aria-label', label);
  const empty = document.createElement('p');
  empty.className = 'wk-drop-empty';
  empty.textContent = t('dropdownNone');
  empty.hidden = true;
  panel.append(list, empty);
  layer.appendChild(panel);

  const rows = options.map((option, i) => {
    const row = document.createElement('div');
    row.className = 'wk-drop-opt';
    row.id = `${id}-${i}`;
    row.setAttribute('role', 'option');
    row.dataset.value = option.value;
    if (option.disabled) row.setAttribute('aria-disabled', 'true');
    const mark = markFor(option, 'wk-drop-mark');
    const name = document.createElement('span');
    name.className = 'wk-drop-name';
    name.textContent = textOf(option);
    const check = document.createElement('span');
    check.className = 'wk-drop-check';
    check.setAttribute('aria-hidden', 'true');
    check.innerHTML = iconSvg('check', { size: 16 });
    row.append(...(mark ? [mark] : []), name);
    if (option.dataset.meta) {
      const meta = document.createElement('span');
      meta.className = 'wk-drop-meta';
      meta.textContent = option.dataset.meta;
      row.appendChild(meta);
    }
    row.appendChild(check);
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      pick(i);
    });
    row.addEventListener('pointermove', () => { if (state.active !== i && !row.hidden) setActive(i, false); });
    list.appendChild(row);
    return { option, row, text: fold(textOf(option)) };
  });

  const state = { host, layer, panel, list, search, rows, sheet, active: -1, away: null, keys: null, scrolled: null, resized: null, sync: null };
  const visible = () => rows.map((r, i) => i).filter((i) => !rows[i].row.hidden && !rows[i].option.disabled);

  function setActive(i, scroll = true) {
    state.active = i;
    rows.forEach((r, n) => r.row.classList.toggle('is-active', n === i));
    const row = rows[i]?.row;
    for (const node of [list, search, host]) {
      if (!node) continue;
      if (row) node.setAttribute('aria-activedescendant', row.id);
      else node.removeAttribute('aria-activedescendant');
    }
    if (row && scroll) row.scrollIntoView({ block: 'nearest' });
  }

  function paintSelected() {
    const value = host.value;
    rows.forEach((r) => {
      const on = r.option.value === value;
      r.row.classList.toggle('is-on', on);
      r.row.setAttribute('aria-selected', String(on));
    });
  }

  function pick(i) {
    const entry = rows[i];
    if (!entry || entry.option.disabled) return;
    closeDropdown();
    host.choose(entry.option);
  }

  function filter() {
    const q = fold(search?.value.trim() ?? '');
    rows.forEach((r) => { r.row.hidden = Boolean(q) && !r.text.includes(q); });
    const shown = visible();
    empty.hidden = shown.length > 0;
    setActive(shown.includes(state.active) && !q ? state.active : shown[0] ?? -1);
    if (!sheet) place(state);
  }

  function step(delta) {
    const shown = visible();
    if (!shown.length) return;
    const at = shown.indexOf(state.active);
    const next = at < 0 ? (delta > 0 ? 0 : shown.length - 1) : Math.max(0, Math.min(shown.length - 1, at + delta));
    setActive(shown[next]);
  }

  state.sync = () => paintSelected();
  search?.addEventListener('input', filter);

  state.keys = (event) => {
    const key = event.key;
    const inSearch = search && event.target === search;
    const done = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    panel.classList.add('is-keys');
    if (key === 'Escape') { done(); closeDropdown(); return; }
    if (key === 'Tab') { event.stopImmediatePropagation(); closeDropdown(); return; }
    if (key === 'ArrowDown' || key === 'ArrowUp') { done(); step(key === 'ArrowDown' ? 1 : -1); return; }
    if (key === 'PageDown' || key === 'PageUp') { done(); step(key === 'PageDown' ? 8 : -8); return; }
    if ((key === 'Home' || key === 'End') && !inSearch) { done(); const shown = visible(); setActive(key === 'Home' ? shown[0] : shown.at(-1)); return; }
    if (key === 'Enter' || (key === ' ' && !inSearch)) { done(); if (state.active >= 0) pick(state.active); return; }
    if (inSearch) { event.stopImmediatePropagation(); return; }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && /\S/.test(key)) {
      if (search) { event.stopImmediatePropagation(); search.focus({ preventScroll: true }); return; }
      done();
      const hit = typeAhead(visible().map((i) => rows[i].option), key, rows[state.active]?.option ?? null);
      if (hit) setActive(rows.findIndex((r) => r.option === hit));
      return;
    }
    event.stopImmediatePropagation();
  };
  state.away = (event) => {
    if (panel.contains(event.target) || host.contains(event.target) || event.composedPath?.().includes(host)) return;
    if (sheet) return;
    closeDropdown({ focus: false });
  };
  state.scrolled = (event) => {
    if (sheet) return;
    const target = event.target;
    if (target instanceof Node && panel.contains(target)) return;
    closeDropdown({ focus: false });
  };
  state.resized = () => { if (!sheet) place(state); };

  const min = Number(host.dataset.panelWidth);
  if (min) state.minWidth = min;
  document.body.appendChild(layer);
  if (typeof layer.showPopover === 'function') {
    layer.setAttribute('popover', 'manual');
    try { layer.showPopover(); } catch {}
  }
  openNow = state;
  host.setAttribute('aria-expanded', 'true');
  host.setAttribute('aria-controls', list.id);
  paintSelected();
  const chosen = rows.findIndex((r) => r.option.value === host.value);
  if (!sheet) place(state);
  setActive(chosen >= 0 ? chosen : visible()[0] ?? -1, false);
  const row = rows[state.active]?.row;
  if (row) list.scrollTop = Math.max(0, row.offsetTop - (list.clientHeight - row.offsetHeight) / 2);
  if (keys) panel.classList.add('is-keys');
  const focusTarget = search && !coarse() ? search : list;
  focusTarget.focus({ preventScroll: true });
  document.addEventListener('pointerdown', state.away, true);
  document.addEventListener('keydown', state.keys, true);
  document.addEventListener('scroll', state.scrolled, true);
  addEventListener('resize', state.resized);
  try { synth.playTap(); } catch {}
  dispatchEvent(new Event('wikster:dropdown'));
}

function place(state) {
  const { host, panel } = state;
  const box = host.getBoundingClientRect();
  const vw = document.documentElement.clientWidth || innerWidth;
  const vh = window.visualViewport?.height ?? innerHeight;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const margin = 8;
  const gap = 6;
  const minWidth = Math.min(Math.max(box.width, state.minWidth ?? 0, 10 * rem), vw - margin * 2);
  panel.style.minWidth = `${minWidth}px`;
  panel.style.maxWidth = `${Math.max(minWidth, Math.min(28 * rem, vw - margin * 2))}px`;
  panel.style.maxHeight = 'none';
  panel.style.left = '0px';
  panel.style.top = '0px';
  const natural = { width: panel.offsetWidth, height: panel.offsetHeight };
  const below = vh - box.bottom - gap - margin;
  const above = box.top - gap - margin;
  const up = natural.height > below && above > below;
  const room = Math.min(up ? above : below, 26 * rem);
  const height = Math.min(natural.height, Math.max(room, Math.min(natural.height, vh - margin * 2, 12 * rem)));
  panel.style.maxHeight = `${height}px`;
  let top = up ? box.top - gap - height : box.bottom + gap;
  top = Math.max(margin, Math.min(top, vh - margin - height));
  const left = Math.max(margin, Math.min(box.left, vw - margin - natural.width));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.classList.toggle('is-up', up);
}

function toOption(item) {
  const spec = Array.isArray(item) ? { value: item[0], label: item[1], ...(item[2] ?? {}) } : item;
  return choice(spec.value, spec.label, spec);
}

export function choice(value, label, { dot = null, art = null, accent = null, accent2 = null, meta = null, disabled = false } = {}) {
  const option = document.createElement('option');
  option.value = value == null ? '' : String(value);
  option.textContent = label ?? '';
  if (dot) option.dataset.dot = dot;
  if (accent) option.dataset.accent = accent;
  if (accent2) option.dataset.accent2 = accent2;
  if (meta != null) option.dataset.meta = String(meta);
  if (art) option.wkArt = art;
  if (disabled) option.disabled = true;
  return option;
}

export function dropdown(items, value, onChange, { label = '', className = '', search = null, panelWidth = null } = {}) {
  const node = document.createElement(TAG);
  if (className) node.className = className;
  if (label) node.setAttribute('aria-label', label);
  if (search != null) node.setAttribute('search', search ? 'on' : 'off');
  if (panelWidth) node.dataset.panelWidth = String(panelWidth);
  node.replaceChildren(...items.map(toOption));
  node.value = value;
  if (onChange) node.addEventListener('change', () => onChange(node.value, node));
  return node;
}

export function setChoices(node, items) {
  node.replaceChildren(...items.map(toOption));
}
