import { t } from '../i18n.js';
import { buckSvg, iconSvg } from '../data/icons.js';
import { synth } from '../ui/sound.js';

export function scrollerOf(node) {
  for (let at = node?.parentElement; at && at !== document.body; at = at.parentElement) {
    const st = getComputedStyle(at);
    if (/(auto|scroll)/.test(st.overflowY)) return at;
  }
  return null;
}

export class Progressive {
  constructor(container, { chunk = 48, start = chunk, margin = 1400, idle = 360, small = 120, release = null } = {}) {
    this.container = container;
    this.release = release;
    this.chunk = chunk;
    this.start = start;
    this.margin = margin;
    this.idle = idle;
    this.small = small;
    this.idleJob = 0;
    this.groups = [];
    this.built = 0;
    this.total = 0;
    this.sentinel = document.createElement('div');
    this.sentinel.className = 'grid-sentinel';
    this.sentinel.setAttribute('aria-hidden', 'true');
    this.observer = null;
    this.root = undefined;
  }

  set(groups, { make, section = null, first = this.start, onBuilt = null } = {}) {
    this.stop();
    this.make = make;
    this.section = section;
    this.onBuilt = onBuilt;
    this.groups = groups.filter((g) => g.items.length).map((g) => ({ ...g, grid: null, at: 0 }));
    this.gi = 0;
    this.built = 0;
    this.total = this.groups.reduce((n, g) => n + g.items.length, 0);
    this.release?.(this.container);
    this.container.replaceChildren();
    this.pump(this.total <= this.small ? this.total : Math.max(this.start, first));
    if (this.gi < this.groups.length) {
      this.container.appendChild(this.sentinel);
      this.watch();
      this.prefill();
    }
  }

  prefill() {
    const wait = typeof requestIdleCallback === 'function'
      ? (fn) => requestIdleCallback(fn, { timeout: 600 })
      : (fn) => setTimeout(() => fn({ timeRemaining: () => 12, didTimeout: true }), 60);
    const tick = (deadline) => {
      this.idleJob = 0;
      if (this.gi >= this.groups.length || this.built >= this.idle || !this.container.isConnected) return;
      const hidden = this.container.checkVisibility && !this.container.checkVisibility({ visibilityProperty: true });
      if (hidden || this.wasHidden) {
        this.wasHidden = hidden;
        this.idleTimer = setTimeout(() => { this.idleJob = wait(tick); }, hidden ? 500 : 900);
        return;
      }
      const room = deadline.timeRemaining();
      if (room > 6 || deadline.didTimeout) this.more(Math.min(8, this.idle - this.built));
      if (this.gi < this.groups.length && this.built < this.idle) this.idleJob = wait(tick);
    };
    this.idleJob = wait(tick);
  }

  more(n = this.chunk) {
    this.pump(n);
    if (this.gi >= this.groups.length) this.stop();
  }

  buildAll() {
    if (this.gi < this.groups.length) this.more(this.total);
  }

  pump(n) {
    let left = n;
    while (left > 0 && this.gi < this.groups.length) {
      const g = this.groups[this.gi];
      if (!g.grid) {
        if (this.section) {
          const made = this.section(g);
          g.grid = made.grid;
          this.container.insertBefore(made.node, this.sentinel.parentNode === this.container ? this.sentinel : null);
        } else {
          g.grid = this.container;
        }
      }
      const take = Math.min(left, g.items.length - g.at);
      const frag = document.createDocumentFragment();
      for (let k = 0; k < take; k++) frag.appendChild(this.make(g.items[g.at + k], this.built + k));
      if (g.grid === this.container && this.sentinel.parentNode === this.container) this.container.insertBefore(frag, this.sentinel);
      else g.grid.appendChild(frag);
      g.at += take;
      this.built += take;
      left -= take;
      if (g.at >= g.items.length) this.gi++;
    }
    this.onBuilt?.(this.built, this.total);
  }

  watch() {
    if (typeof IntersectionObserver !== 'function') { this.buildAll(); return; }
    if (this.root === undefined) this.root = scrollerOf(this.container);
    this.observer = new IntersectionObserver((list) => {
      const hidden = this.container.checkVisibility && !this.container.checkVisibility({ visibilityProperty: true });
      if (!list.some((e) => e.isIntersecting)) { if (hidden) this.wasHidden = true; return; }
      if (!this.sentinel.getClientRects().length || (this.root && !this.root.getClientRects().length) || hidden || this.wasHidden) {
        this.observer.unobserve(this.sentinel);
        clearTimeout(this.retry);
        this.retry = setTimeout(() => this.observer?.observe(this.sentinel), hidden || !this.wasHidden ? 500 : 900);
        this.wasHidden = hidden;
        return;
      }
      this.more();
      if (this.observer) {
        this.observer.unobserve(this.sentinel);
        requestAnimationFrame(() => this.observer?.observe(this.sentinel));
      }
    }, { root: this.root, rootMargin: `${this.margin}px 0px` });
    this.observer.observe(this.sentinel);
  }

  stop() {
    clearTimeout(this.idleTimer);
    if (this.idleJob) {
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(this.idleJob);
      else clearTimeout(this.idleJob);
      this.idleJob = 0;
    }
    clearTimeout(this.retry);
    this.observer?.disconnect();
    this.observer = null;
    this.sentinel.remove();
  }
}

export class Picker {
  constructor(container, { onChange = null, keyOf = (node) => node?.closest?.('[data-key]')?.dataset.key ?? null, longPress = true } = {}) {
    this.container = container;
    this.onChange = onChange;
    this.keyOf = keyOf;
    this.keys = new Set();
    this.active = false;
    this.longPress = longPress;
    this.suppress = false;
    this.bind();
  }

  bind() {
    const c = this.container;
    let press = null;
    let drag = null;
    c.addEventListener('click', (event) => {
      if (this.suppress) { this.suppress = false; event.preventDefault(); event.stopPropagation(); return; }
      if (!this.active) return;
      if (event.target.closest('.pick-skip')) return;
      const key = this.keyOf(event.target);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      this.toggle(key);
      synth.playTap();
    }, true);
    c.addEventListener('pointerdown', (event) => {
      if (event.button > 0) return;
      const key = this.keyOf(event.target);
      if (!key || event.target.closest('.pick-skip, .fav-button, .wish-button')) return;
      if (this.active) {
        drag = { key, x: event.clientX, y: event.clientY, on: !this.keys.has(key), moving: false, id: event.pointerId, mouse: event.pointerType === 'mouse' };
        return;
      }
      if (!this.longPress) return;
      clearTimeout(press?.timer);
      press = {
        x: event.clientX, y: event.clientY,
        timer: setTimeout(() => {
          press = null;
          this.suppress = true;
          setTimeout(() => { this.suppress = false; }, 900);
          this.enter();
          this.set(key, true);
          navigator.vibrate?.(12);
          synth.playArm?.();
        }, 480)
      };
    });
    const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };
    c.addEventListener('pointermove', (event) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 9) cancelPress();
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moving) {
        if (Math.hypot(dx, dy) < 10) return;
        if (!drag.mouse && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
        drag.moving = true;
        try { c.setPointerCapture(event.pointerId); } catch {}
        this.set(drag.key, drag.on);
      }
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const key = under && c.contains(under) ? this.keyOf(under) : null;
      if (key) this.set(key, drag.on);
      event.preventDefault();
    });
    const end = () => {
      cancelPress();
      if (drag?.moving) { this.suppress = true; setTimeout(() => { this.suppress = false; }, 0); }
      drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => { cancelPress(); drag = null; });
    c.addEventListener('contextmenu', (event) => { if (this.active || press) event.preventDefault(); });
  }

  enter() {
    if (this.active) return;
    this.active = true;
    this.container.classList.add('is-picking');
    this.changed();
  }

  exit() {
    if (!this.active && !this.keys.size) return;
    this.active = false;
    this.keys.clear();
    this.container.classList.remove('is-picking');
    for (const node of this.container.querySelectorAll('.is-picked')) node.classList.remove('is-picked');
    this.changed();
  }

  has(key) { return this.keys.has(key); }

  set(key, on) {
    if (on === this.keys.has(key)) return;
    if (on) this.keys.add(key); else this.keys.delete(key);
    this.paintKey(key);
    this.changed();
  }

  toggle(key) { this.set(key, !this.keys.has(key)); }

  replace(keys) {
    this.keys = new Set(keys);
    this.paint();
    this.changed();
  }

  paintKey(key) {
    for (const node of this.container.querySelectorAll(`[data-key="${CSS.escape(key)}"]`)) node.classList.toggle('is-picked', this.keys.has(key));
  }

  paint() {
    for (const node of this.container.querySelectorAll('[data-key]')) node.classList.toggle('is-picked', this.keys.has(node.dataset.key));
  }

  mark(node, key) {
    if (this.keys.has(key)) node.classList.add('is-picked');
    return node;
  }

  changed() {
    clearTimeout(this.tick);
    this.tick = setTimeout(() => this.onChange?.(this), 0);
  }
}

export function pickBar({ picker, all, actions, onClose, className = '' }) {
  const bar = document.createElement('div');
  bar.className = `pick-bar ${className}`.trim();
  bar.setAttribute('role', 'toolbar');
  bar.hidden = true;
  const count = document.createElement('b');
  count.className = 'pick-count tabular';
  const quick = document.createElement('div');
  quick.className = 'pick-quick';
  const doers = document.createElement('div');
  doers.className = 'pick-actions';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn is-mini pick-close';
  close.setAttribute('aria-label', t('pickDone'));
  close.innerHTML = iconSvg('close', { size: 16 });
  close.addEventListener('click', () => { synth.playTap(); picker.exit(); onClose?.(); });
  const small = (label, run) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip pick-chip';
    b.textContent = label;
    b.addEventListener('click', () => { synth.playTap(); run(); });
    return b;
  };
  quick.append(
    small(t('pickAll'), () => picker.replace(all())),
    small(t('pickNone'), () => picker.replace([])),
    small(t('pickInvert'), () => picker.replace(all().filter((k) => !picker.has(k)))));
  const head = document.createElement('div');
  head.className = 'pick-head';
  head.append(close, count, quick);
  bar.append(head, doers);
  const paint = () => {
    bar.hidden = !picker.active;
    count.textContent = t('pickCount', { n: picker.keys.size.toLocaleString() });
    const keys = [...picker.keys];
    doers.replaceChildren(...actions(keys).filter(Boolean).map((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn-sm ${a.primary ? 'btn-primary' : 'btn-ghost'} pick-act`;
      b.dataset.act = a.id;
      b.innerHTML = `${a.icon === 'buck' ? buckSvg({ size: 15 }) : a.icon ? iconSvg(a.icon, { size: 15 }) : ''}<span></span>`;
      b.querySelector('span').innerHTML = a.label;
      b.disabled = Boolean(a.disabled);
      b.addEventListener('click', () => { if (!b.disabled) a.run(keys); });
      return b;
    }));
  };
  return { node: bar, paint };
}
