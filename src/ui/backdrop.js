import { themeById } from './themes.js';

const canOffload = () => typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
  && typeof HTMLCanvasElement !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype
  && !/[?&]scene=page/.test(location.search);

const viewNow = () => ({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 });

class Backdrop {
  constructor() {
    this.canvas = null;
    this.theme = null;
    this.running = false;
    this.paused = false;
    this.lowPower = false;
    this.mounted = false;
    this.scene = null;
    this.worker = null;
    this.waiting = [];
    this.busyUntil = 0;
    this.snaps = new Map();
    this.snapId = 0;
    this.offloaded = false;
  }

  mount(canvas) {
    this.canvas = canvas;
    this.mounted = true;
    if (canOffload()) {
      try {
        this.#offload(canvas);
        return this;
      } catch {
        this.worker = null;
      }
    }
    this.#local();
    return this;
  }

  setTheme(id) {
    this.theme = themeById(id);
    this.#call('setTheme', id);
    return this;
  }

  setLowPower(low) {
    this.lowPower = low;
    if (!this.paused && this.mounted) this.running = true;
    this.#call('setLowPower', low);
  }

  markBusy(ms = 420) {
    const now = performance.now();
    if (now < this.busyUntil - ms / 2) return;
    this.busyUntil = now + ms;
    this.#call('markBusy', ms);
  }

  setPaused(paused) {
    this.paused = paused;
    if (paused) this.running = false;
    else if (!this.lowPower && this.mounted) this.running = true;
    this.#call('setPaused', paused);
  }

  start() {
    if (!this.running && !this.paused && this.mounted) this.running = true;
    this.#call('start');
  }

  stop() {
    this.running = false;
    this.#call('stop');
  }

  snapshot() {
    if (this.scene) return Promise.resolve(this.scene.snapshot());
    if (!this.worker) return Promise.resolve(null);
    const id = ++this.snapId;
    return new Promise((resolve) => {
      this.snaps.set(id, resolve);
      this.worker.postMessage({ type: 'snapshot', id });
    });
  }

  #call(name, ...args) {
    if (this.scene) this.scene[name](...args);
    else if (this.worker) this.worker.postMessage({ type: 'call', name, args });
    else this.waiting.push([name, args]);
  }

  #offload(canvas) {
    const view = viewNow();
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    const worker = new Worker(new URL('./backdrop-worker.js', import.meta.url), { type: 'module' });
    const offscreen = canvas.transferControlToOffscreen();
    worker.addEventListener('message', ({ data }) => {
      if (data?.type !== 'snapshot') return;
      const done = this.snaps.get(data.id);
      this.snaps.delete(data.id);
      done?.(data.data ? { width: data.width, height: data.height, data: data.data } : null);
    });
    worker.addEventListener('error', () => this.#fallback());
    worker.postMessage({ type: 'mount', canvas: offscreen, view }, [offscreen]);
    this.worker = worker;
    this.offloaded = true;
    for (const [name, args] of this.waiting.splice(0)) worker.postMessage({ type: 'call', name, args });
    window.addEventListener('resize', () => {
      if (!this.worker) return;
      const next = viewNow();
      this.canvas.style.width = `${next.width}px`;
      this.canvas.style.height = `${next.height}px`;
      this.worker.postMessage({ type: 'resize', view: next });
    }, { passive: true });
    document.addEventListener('visibilitychange', () => this.worker?.postMessage({ type: 'hidden', hidden: document.hidden }));
  }

  #fallback() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.offloaded = false;
    for (const done of this.snaps.values()) done(null);
    this.snaps.clear();
    const fresh = document.createElement('canvas');
    for (const { name, value } of this.canvas.attributes) fresh.setAttribute(name, value);
    this.canvas.replaceWith(fresh);
    this.canvas = fresh;
    this.#local();
  }

  #local() {
    import('./scene.js').then(({ Scene }) => {
      const scene = new Scene().mount(this.canvas);
      if (this.theme) scene.setTheme(this.theme.id);
      scene.lowPower = this.lowPower;
      scene.paused = this.paused;
      this.scene = scene;
      this.waiting = [];
      if (this.running) scene.start();
    }).catch(() => {});
  }
}

export const backdrop = new Backdrop();
