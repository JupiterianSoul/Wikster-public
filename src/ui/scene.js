import { themeById } from './themes.js';

const TAU = Math.PI * 2;
const MAX_DPR = 2;

const paper = (w, h) => {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  return new OffscreenCanvas(w, h);
};
const nextFrame = typeof requestAnimationFrame === 'function' ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(performance.now()), 16);
const dropFrame = typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

export const sceneSize = (theme, view, strained) => {
  const soft = theme?.backdrop.renderer !== 'arcade';
  const cap = soft ? 1 : MAX_DPR;
  const pixels = (soft ? 0.8e6 : 2e6) * (strained ? 0.4 : 1) / Math.max(1, view.width * view.height);
  const dpr = Math.min(cap, view.dpr || 1, Math.sqrt(pixels));
  return { width: view.width, height: view.height, dpr, pixelWidth: Math.max(1, Math.floor(view.width * dpr)), pixelHeight: Math.max(1, Math.floor(view.height * dpr)) };
};

export class Scene {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.theme = null;
    this.raf = null;
    this.running = false;
    this.paused = false;
    this.lowPower = false;
    this.busy = false;
    this.busyTimer = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.seedField = null;
    this.strained = false;
    this.still = false;
    this.view = null;
    this.hidden = false;
  }

  mount(canvas, view = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.view = view;
    this.#resize();
    if (!view) window.addEventListener('resize', () => this.#resize(), { passive: true });
    return this;
  }

  resizeTo(view) {
    this.view = view;
    this.#resize();
  }

  setHidden(hidden) {
    this.hidden = Boolean(hidden);
  }

  snapshot() {
    return this.ctx ? this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height) : null;
  }

  setTheme(id) {
    this.theme = themeById(id);
    this.seedField = null;
    this.#resize();
    if (!this.running) this.#frame(performance.now(), true);
    return this;
  }

  setLowPower(low) {
    this.lowPower = low;
    if (low) {
      this.stop();
      this.#frame(performance.now(), true);
    } else if (!this.paused) this.start();
  }

  markBusy(ms = 420) {
    this.busy = true;
    clearTimeout(this.busyTimer);
    this.busyTimer = setTimeout(() => { this.busy = false; }, ms);
  }

  setPaused(paused) {
    this.paused = paused;
    if (paused) this.stop();
    else if (!this.lowPower) this.start();
  }

  start() {
    if (this.running || this.paused || !this.ctx) return;
    if (this.lowPower || this.still) {
      this.#frame(performance.now(), true);
      return;
    }
    this.running = true;
    let last = 0;
    let tick = 0;
    let slow = 0;
    let stall = 0;
    const loop = (now) => {
      if (!this.running) return;
      this.raf = nextFrame(loop);
      const hidden = this.hidden || (typeof document !== 'undefined' && document.hidden);
      if (tick && !hidden) {
        const gap = now - tick;
        if (!this.strained) {
          slow = gap > 30 && gap < 2000 ? slow + (gap > 100 ? 4 : 1) : Math.max(0, slow - 2);
          if (slow > 90) { this.strained = true; this.#resize(); }
        } else {
          stall = gap > 100 && gap < 2000 ? stall + 1 : Math.max(0, stall - 1);
          if (stall > 40) {
            this.still = true;
            this.stop();
            this.#frame(now, true);
            return;
          }
        }
      }
      tick = now;
      const budget = this.strained ? 100 : this.busy ? 66 : 40;
      if (now - last < budget) return;
      last = now;
      this.#frame(now);
    };
    this.raf = nextFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) dropFrame(this.raf);
    this.raf = null;
  }

  #resize() {
    if (!this.canvas) return;
    const view = this.view ?? { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 };
    const size = sceneSize(this.theme, view, this.strained);
    this.width = size.width;
    this.height = size.height;
    this.dpr = size.dpr;
    this.canvas.width = size.pixelWidth;
    this.canvas.height = size.pixelHeight;
    if (this.canvas.style) {
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
    }
    if (this.ctx) this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.running) this.#frame(performance.now(), true);
  }

  #frame(now, force = false) {
    if (!this.ctx || !this.theme) return;
    const { ctx } = this;
    const w = this.width;
    const h = this.height;
    const t = this.lowPower ? 0 : now;

    switch (this.theme.backdrop.renderer) {
      case 'paper': this.#paper(ctx, w, h, t); break;
      case 'arcade': this.#arcade(ctx, w, h, t); break;
      case 'noir': this.#noir(ctx, w, h, t); break;
      case 'sunset': this.#sunset(ctx, w, h, t); break;
      case 'meadow': this.#meadow(ctx, w, h, t); break;
      case 'toon': this.#toon(ctx, w, h, t); break;
      case 'matrix': this.#matrix(ctx, w, h, t); break;
      case 'casino': this.#casino(ctx, w, h, t); break;
      case 'horror': this.#horror(ctx, w, h, t); break;
      case 'rire': this.#rire(ctx, w, h, t); break;
      case 'assur': this.#assur(ctx, w, h, t); break;
      case 'pixel': this.#pixel(ctx, w, h, t); break;
      case 'tabletop': this.#tabletop(ctx, w, h, t); break;
      case 'apotheosis': this.#apotheosis(ctx, w, h, t); break;
      case 'raclette': this.#raclette(ctx, w, h, t); break;
      case 'hellfire': this.#hellfire(ctx, w, h, t); break;
      case 'lecture': this.#lecture(ctx, w, h, t); break;
      case 'yaourt': this.#yaourt(ctx, w, h, t); break;
      case 'wankel': this.#wankel(ctx, w, h, t); break;
      case 'elden': this.#elden(ctx, w, h, t); break;
      case 'season': this.#season(ctx, w, h, t); break;
      default: this.#aurora(ctx, w, h, t);
    }
  }

  #aurora(ctx, w, h, now) {
    const { ribbons, speed, alpha } = this.theme.backdrop;
    const t = now * speed;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#080b1a');
    sky.addColorStop(0.55, '#0a0e20');
    sky.addColorStop(1, '#05070f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ribbons; i++) {
      const phase = t * (0.6 + i * 0.17) + i * 1.9;
      const amp = h * (0.06 + 0.035 * Math.sin(t * 0.7 + i));
      const mid = h * (0.26 + i * 0.13) + Math.sin(phase * 0.5) * h * 0.05;
      const thickness = h * (0.05 + 0.03 * Math.sin(t * 1.1 + i * 2));

      const hue = 190 + i * 26 + Math.sin(t + i) * 18;
      const grad = ctx.createLinearGradient(0, mid - thickness, 0, mid + thickness);
      grad.addColorStop(0, `hsla(${hue}, 90%, 62%, 0)`);
      grad.addColorStop(0.5, `hsla(${hue}, 92%, 66%, ${alpha * (0.16 + i * 0.02)})`);
      grad.addColorStop(1, `hsla(${hue}, 90%, 62%, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      const stepX = Math.max(12, w / 40);
      for (let x = 0; x <= w + stepX; x += stepX) {
        const k = x / w;
        ctx.lineTo(x, mid + Math.sin(k * 5 + phase) * amp + Math.sin(k * 11 - phase * 0.6) * amp * 0.35);
      }
      for (let x = w + stepX; x >= -stepX; x -= stepX) {
        const k = x / w;
        ctx.lineTo(x, mid + thickness * 2 + Math.sin(k * 5 + phase) * amp + Math.sin(k * 11 - phase * 0.6) * amp * 0.35);
      }
      ctx.closePath();
      ctx.fill();
    }

    if (!this.seedField) {
      this.seedField = Array.from({ length: 70 }, () => ({
        x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.3, p: Math.random() * TAU
      }));
    }
    for (const s of this.seedField) {
      const twinkle = 0.35 + 0.3 * Math.sin(now * 0.0012 + s.p);
      ctx.fillStyle = `rgba(226, 232, 255, ${twinkle})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  #paper(ctx, w, h, now) {
    const { flecks, drift } = this.theme.backdrop;
    const t = now * drift;

    const sheet = ctx.createLinearGradient(0, 0, w * 0.4, h);
    sheet.addColorStop(0, '#f6f2e9');
    sheet.addColorStop(1, '#ebe5d7');
    ctx.fillStyle = sheet;
    ctx.fillRect(0, 0, w, h);

    if (!this.seedField) {
      this.seedField = Array.from({ length: flecks }, () => ({
        x: Math.random(), y: Math.random(),
        r: Math.random() * 1.4 + 0.2,
        a: Math.random() * 0.06 + 0.015,
        dark: Math.random() > 0.35
      }));
    }
    for (const f of this.seedField) {
      ctx.fillStyle = f.dark ? `rgba(60, 48, 30, ${f.a})` : `rgba(255, 255, 255, ${f.a * 1.6})`;
      ctx.beginPath();
      ctx.arc(f.x * w, f.y * h, f.r, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(31, 111, 92, 0.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const y = h * (0.3 + i * 0.4) + Math.sin(t + i * 2) * 14;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(80, 66, 40, 0.14)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  #arcade(ctx, w, h, now) {
    const { rows, speed } = this.theme.backdrop;
    const t = now * speed;

    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, w, h);

    const horizon = h * 0.46;

    const sun = ctx.createLinearGradient(0, horizon - h * 0.28, 0, horizon);
    sun.addColorStop(0, 'rgba(240, 171, 252, 0.55)');
    sun.addColorStop(1, 'rgba(34, 211, 238, 0.15)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(w / 2, horizon, Math.min(w, h) * 0.19, Math.PI, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.32)';
    ctx.lineWidth = 1;

    for (let i = 0; i < rows; i++) {
      const k = ((i / rows) + (t % 1)) % 1;
      const y = horizon + Math.pow(k, 2.4) * (h - horizon);
      ctx.globalAlpha = 0.15 + k * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.22;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * (w / 7), h);
      ctx.lineTo(w / 2 + i * 6, horizon);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  #noir(ctx, w, h, now) {
    const { grain } = this.theme.backdrop;
    const t = now * 0.00006;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    const lx = w * (0.5 + Math.sin(t) * 0.28);
    const ly = h * (0.34 + Math.cos(t * 0.7) * 0.18);
    const beam = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.62);
    beam.addColorStop(0, 'rgba(232, 195, 122, 0.15)');
    beam.addColorStop(0.4, 'rgba(232, 195, 122, 0.05)');
    beam.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(232, 195, 122, 0.022)';
    const bar = h / 14;
    for (let i = 0; i < 14; i++) {
      const y = i * bar + Math.sin(t * 3 + i) * 3;
      ctx.fillRect(0, y, w, bar * 0.4);
    }

    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.68);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    const bucket = Math.floor(now / 80);
    if (bucket !== this.grainBucket) {
      this.grainBucket = bucket;
      this.grainOffset = [Math.random(), Math.random()];
    }
    const tile = this.#grainTile(grain);
    if (tile) {
      const [ox, oy] = this.grainOffset ?? [0, 0];
      const pattern = ctx.createPattern(tile, 'repeat');
      ctx.save();
      ctx.translate(-Math.floor(ox * tile.width), -Math.floor(oy * tile.height));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w + tile.width, h + tile.height);
      ctx.restore();
    }
  }

  #grainTile(strength) {
    if (this.grainCanvas) return this.grainCanvas;
    const size = 128;
    const canvas = paper(size, size);
    const g = canvas.getContext('2d');
    const image = g.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const on = Math.random() > 0.93;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = on ? Math.floor(strength * 255) : 0;
    }
    g.putImageData(image, 0, 0);
    this.grainCanvas = canvas;
    return canvas;
  }

  #sunset(ctx, w, h, t) {
    const speed = this.theme.backdrop.speed ?? 0.00016;
    const horizon = h * 0.56;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#160a2e');
    sky.addColorStop(0.6, '#31164f');
    sky.addColorStop(1, '#6b2158');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);

    const r = Math.min(w, h) * 0.2;
    const cx = w / 2;
    const cy = horizon - r * 0.18;
    const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    sun.addColorStop(0, '#fcd34d');
    sun.addColorStop(0.55, '#fb7185');
    sun.addColorStop(1, '#f472b6');
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, horizon);
    ctx.clip();
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#31164f';
    for (let i = 0; i < 5; i++) {
      const y = cy - r * 0.1 + i * r * 0.24;
      ctx.fillRect(cx - r, y, r * 2, r * (0.035 + i * 0.02));
    }
    ctx.restore();

    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, '#2b1048');
    ground.addColorStop(1, '#0d0620');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.strokeStyle = 'rgba(244, 114, 182, 0.4)';
    ctx.lineWidth = 1;
    for (let i = -9; i <= 9; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * w * 0.011, horizon);
      ctx.lineTo(cx + i * w * 0.22, h);
      ctx.stroke();
    }
    const phase = (t * speed) % 1;
    for (let i = 0; i < 9; i++) {
      const p = ((i + phase) / 9) ** 2.2;
      const y = horizon + p * (h - horizon);
      ctx.globalAlpha = 0.15 + p * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();
  }

  #toon(ctx, w, h, t) {
    const sec = t / 1000;

    ctx.fillStyle = '#fff8e7';
    ctx.fillRect(0, 0, w, h);

    const dots = (cx, cy, reach, phase) => {
      const drift = Math.sin(sec * 0.12 + phase) * 6;
      ctx.fillStyle = 'rgba(28, 23, 16, 0.10)';
      for (let gx = -reach; gx <= reach; gx += 18) {
        for (let gy = -reach; gy <= reach; gy += 18) {
          const d = Math.hypot(gx, gy);
          if (d > reach) continue;
          const r = 3.4 * (1 - d / reach);
          if (r < 0.5) continue;
          ctx.beginPath();
          ctx.arc(cx + gx + drift, cy + gy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    dots(w + 20, -20, Math.min(w, h) * 0.55, 0);
    dots(-20, h + 20, Math.min(w, h) * 0.6, 2.1);

    for (let i = 0; i < 7; i++) {
      const speed = 0.014 + (i % 3) * 0.006;
      const x = ((i * 197.3) % w) + Math.sin(sec * 0.4 + i * 2.2) * 14;
      const y = h + 60 - (((sec * speed * h) + i * h * 0.31) % (h + 120));
      const r = 10 + (i % 4) * 7;
      ctx.strokeStyle = 'rgba(28, 23, 16, 0.14)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, Math.PI * 1.1, Math.PI * 1.5);
      ctx.stroke();
    }
  }

  #matrix(ctx, w, h, t) {
    const sec = t / 1000;

    ctx.fillStyle = '#010b04';
    ctx.fillRect(0, 0, w, h);

    const colW = 18;
    const cell = 20;
    const cols = Math.ceil(w / colW);
    const glyphs = '01アイウエオカキクケコサシスセソタチツテト<>+*';
    ctx.font = '14px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';

    for (let i = 0; i < cols; i++) {
      const speed = 2.4 + ((i * 7) % 5) * 1.3;
      const length = 9 + ((i * 13) % 8);
      const lane = ((i * 37) % 11) / 11;
      const headCell = (sec * speed + lane * 80) % ((h / cell) + length + 6) - length;
      for (let seg = 0; seg < length; seg++) {
        const y = (headCell - seg) * cell;
        if (y < -cell || y > h + cell) continue;
        const pick = Math.floor(Math.abs(Math.sin(i * 131 + seg * 17 + Math.floor(sec * 6))) * glyphs.length);
        const fade = 1 - seg / length;
        ctx.fillStyle = seg === 0
          ? 'rgba(190, 255, 210, 0.8)'
          : `rgba(0, 255, 65, ${(0.34 * fade * fade).toFixed(3)})`;
        ctx.fillText(glyphs[pick % glyphs.length], i * colW + colW / 2, y);
      }
    }
  }

  #casino(ctx, w, h, t) {
    const sec = t / 1000;

    const felt = ctx.createRadialGradient(w * 0.5, h * 0.36, 0, w * 0.5, h * 0.36, h * 0.85);
    felt.addColorStop(0, '#124a32');
    felt.addColorStop(0.55, '#0b2e20');
    felt.addColorStop(1, '#061a12');
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, w, h);

    const suits = ['\u2660', '\u2665', '\u2666', '\u2663'];
    ctx.textAlign = 'center';
    for (let i = 0; i < 10; i++) {
      const suit = suits[i % 4];
      const red = i % 4 === 1 || i % 4 === 2;
      const speed = 0.011 + (i % 3) * 0.005;
      const x = ((i * 173.7) % w) + Math.sin(sec * 0.3 + i * 1.9) * 16;
      const y = h + 40 - (((sec * speed * h) + i * h * 0.29) % (h + 90));
      const size = 15 + (i % 4) * 8;
      ctx.font = `${size}px Georgia, serif`;
      ctx.fillStyle = red ? 'rgba(224, 36, 94, 0.12)' : 'rgba(242, 202, 79, 0.1)';
      ctx.fillText(suit, x, y);
    }

    for (let i = 0; i < 3; i++) {
      const cx = w * (0.2 + i * 0.3) + Math.sin(sec * 0.2 + i * 2.4) * 6;
      const cy = h * 0.9 + Math.cos(sec * 0.16 + i) * 4;
      const r = 16 + i * 3;
      ctx.strokeStyle = 'rgba(242, 202, 79, 0.14)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 5, sec * 0.1 + i, sec * 0.1 + i + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  #rire(ctx, w, h, t) {
    const sec = t / 1000;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a1630');
    sky.addColorStop(1, '#050b1c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const spot = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, h * 0.6);
    const breathe = 0.16 + Math.sin(sec * 0.8) * 0.04;
    spot.addColorStop(0, `rgba(96, 165, 250, ${breathe})`);
    spot.addColorStop(1, 'rgba(96, 165, 250, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 14; i++) {
      const speed = 0.02 + (i % 3) * 0.008;
      const lane = ((i * 137.5) % w);
      const y = h + 40 - (((sec * speed * h) + i * h * 0.23) % (h + 120));
      const wobble = Math.sin(sec * 2.2 + i * 1.7) * 14;
      const size = 18 + (i % 4) * 12;
      const tilt = Math.sin(sec * 1.6 + i) * 0.22;
      ctx.save();
      ctx.translate(lane + wobble, y);
      ctx.rotate(tilt);
      ctx.font = `900 ${size}px 'Nunito', 'Trebuchet MS', sans-serif`;
      ctx.fillStyle = `rgba(147, 197, 253, ${0.08 + (i % 3) * 0.04})`;
      ctx.fillText(i % 5 === 0 ? 'HAHA' : 'HA', 0, 0);
      ctx.restore();
    }
  }

  #assur(ctx, w, h, t) {
    const sec = t / 1000;
    ctx.fillStyle = '#2a0f1f';
    ctx.fillRect(0, 0, w, h);

    const bh = 26;
    const bw = 68;
    for (let row = 0, y = -bh; y < h + bh; row++, y += bh) {
      const shift = row % 2 ? bw / 2 : 0;
      for (let x = -bw + shift; x < w + bw; x += bw) {
        const tone = ((row * 7 + Math.round(x / bw)) % 5);
        ctx.fillStyle = `rgba(244, 114, 182, ${0.05 + tone * 0.012})`;
        ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }

    const lamp = ctx.createRadialGradient(w * 0.18, h * 0.86, 0, w * 0.18, h * 0.86, h * 0.9);
    const flicker = 0.2 + Math.sin(sec * 3.1) * 0.012 + Math.sin(sec * 7.3) * 0.008;
    lamp.addColorStop(0, `rgba(245, 208, 169, ${flicker})`);
    lamp.addColorStop(0.5, 'rgba(245, 208, 169, 0.05)');
    lamp.addColorStop(1, 'rgba(245, 208, 169, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(245, 208, 169, 0.16)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const y = ((i * 97) % h) + Math.sin(sec * 0.3 + i) * 6;
      const x = ((sec * (6 + i * 1.5)) + i * 240) % (w + 260) - 130;
      ctx.save();
      ctx.translate(x, y);
      for (let k = 0; k < 6; k++) {
        const gx = k * 18;
        const kind = (i + k) % 3;
        ctx.beginPath();
        if (kind === 0) { ctx.moveTo(gx, -8); ctx.lineTo(gx + 4, 6); ctx.lineTo(gx - 4, 6); ctx.closePath(); }
        else if (kind === 1) { ctx.moveTo(gx - 6, 0); ctx.lineTo(gx + 8, 0); ctx.moveTo(gx + 8, 0); ctx.lineTo(gx + 3, -5); }
        else { ctx.moveTo(gx, -8); ctx.lineTo(gx, 8); ctx.moveTo(gx - 6, -2); ctx.lineTo(gx + 6, -2); }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  #pixel(ctx, w, h, t) {
    const sec = t / 1000;
    const px = 6;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#06162e';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 40; i++) {
      const x = Math.floor(((i * 191) % w) / px) * px;
      const y = Math.floor(((i * 73) % (h * 0.6)) / px) * px;
      const on = Math.floor(sec * 2 + i) % 7 !== 0;
      ctx.fillStyle = on ? `rgba(207, 231, 255, ${0.35 + (i % 3) * 0.2})` : 'rgba(207, 231, 255, 0.08)';
      ctx.fillRect(x, y, px, px);
    }

    const cloud = (y, speed, alpha, scale) => {
      const off = (sec * speed) % (w + 300);
      ctx.fillStyle = `rgba(30, 144, 255, ${alpha})`;
      for (let c = -1; c < w / 300 + 2; c++) {
        const cx = c * 300 - off;
        ctx.fillRect(cx, y, 60 * scale, 12 * scale);
        ctx.fillRect(cx + 18 * scale, y - 12 * scale, 36 * scale, 12 * scale);
        ctx.fillRect(cx - 12 * scale, y + 12 * scale, 84 * scale, 12 * scale);
      }
    };
    cloud(h * 0.2, 12, 0.12, 1.4);
    cloud(h * 0.34, 22, 0.08, 1);

    const horizon = h * 0.62;
    ctx.strokeStyle = 'rgba(30, 144, 255, 0.28)';
    ctx.lineWidth = 2;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * 40, horizon);
      ctx.lineTo(w / 2 + i * w * 0.32, h + 10);
      ctx.stroke();
    }
    const scroll = (sec * 40) % 60;
    for (let k = 0; k < 8; k++) {
      const p = (k * 60 + scroll) / 480;
      const y = horizon + p * p * (h - horizon);
      ctx.globalAlpha = 0.15 + p * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, Math.floor(y / px) * px);
      ctx.lineTo(w, Math.floor(y / px) * px);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(30, 144, 255, 0.35)';
    ctx.fillRect(0, horizon - 2, w, 4);
    ctx.imageSmoothingEnabled = true;
  }

  #hellfire(ctx, w, h, t) {
    const sec = t / 1000;
    ctx.fillStyle = '#0c0606';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 2; i++) {
      const x = w * (0.3 + 0.4 * i) + Math.sin(sec * 0.07 + i * 2.1) * w * 0.18;
      const y = h * (0.75 - 0.35 * i) + Math.cos(sec * 0.05 + i) * h * 0.1;
      const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.55);
      g.addColorStop(0, 'rgba(250, 128, 114, 0.14)');
      g.addColorStop(1, 'rgba(250, 128, 114, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const count = 70;
    for (let i = 0; i < count; i++) {
      const speed = 0.018 + ((i * 7) % 9) * 0.004;
      const life = (sec * speed + (i * 0.137) % 1) % 1;
      const x = ((i * 173.3) % w) + Math.sin(sec * 0.6 + i) * 22;
      const y = h * (1.05 - life * 1.15);
      const r = 1 + ((i * 5) % 3) * 0.7;
      const a = (1 - life) * (0.35 + ((i * 3) % 4) * 0.12);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = i % 5 === 0 ? `rgba(255, 228, 222, ${a.toFixed(3)})` : `rgba(250, 128, 114, ${a.toFixed(3)})`;
      ctx.fill();
    }

    const period = 7;
    const phase = sec % period;
    if (phase < 0.28) {
      const bolt = Math.floor(sec / period);
      const flash = 1 - phase / 0.28;
      ctx.fillStyle = `rgba(255, 228, 222, ${(0.16 * flash).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      let seed = bolt * 9973 + 17;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      let x = w * (0.2 + rnd() * 0.6), y = 0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      while (y < h * 0.7) { x += (rnd() - 0.5) * 60; y += 18 + rnd() * 30; ctx.lineTo(x, y); }
      ctx.strokeStyle = `rgba(255, 240, 236, ${(0.9 * flash).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(250, 128, 114, 0.9)';
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  #raclette(ctx, w, h, t) {
    const sec = t / 1000;
    const room = ctx.createLinearGradient(0, 0, 0, h);
    room.addColorStop(0, '#3a2a17');
    room.addColorStop(0.45, '#241a0f');
    room.addColorStop(1, '#140e07');
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, w, h);

    const heat = ctx.createLinearGradient(0, 0, 0, h * 0.34);
    heat.addColorStop(0, 'rgba(255, 190, 120, 0.24)');
    heat.addColorStop(1, 'rgba(255, 190, 120, 0)');
    ctx.fillStyle = heat;
    ctx.fillRect(0, 0, w, h * 0.34);
    ctx.fillStyle = 'rgba(255, 214, 160, 0.16)';
    ctx.fillRect(0, h * 0.1, w, 3);

    for (let i = 0; i < 9; i++) {
      const x = ((i + 0.5) / 9) * w + Math.sin(sec * 0.15 + i) * 10;
      const period = 7 + (i % 4) * 2.5;
      const phase = ((sec + i * 1.7) % period) / period;
      const y = h * 0.11 + phase * h * 0.85;
      const r = 4 + Math.sin(phase * Math.PI) * 4;
      ctx.globalAlpha = 0.5 * (1 - phase * 0.75);
      ctx.fillStyle = '#f5ead6';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.72, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 234, 214, 0.14)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.11);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  #lecture(ctx, w, h, t) {
    const sec = t / 1000;
    const paper = ctx.createRadialGradient(w * 0.68, h * 0.3, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.9);
    paper.addColorStop(0, '#11423c');
    paper.addColorStop(0.5, '#0b2b28');
    paper.addColorStop(1, '#061a18');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);

    const lamp = ctx.createRadialGradient(w * 0.72, h * 0.26, 0, w * 0.72, h * 0.26, h * 0.6);
    lamp.addColorStop(0, 'rgba(45, 212, 191, 0.16)');
    lamp.addColorStop(1, 'rgba(45, 212, 191, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(204, 251, 241, 0.055)';
    ctx.lineWidth = 1;
    const gap = 34;
    const shift = (sec * 5) % gap;
    for (let y = h + gap - shift; y > -gap; y -= gap) {
      ctx.beginPath();
      ctx.moveTo(w * 0.08, y);
      ctx.lineTo(w * 0.92, y + 6);
      ctx.stroke();
    }

    const lift = (Math.sin(sec * 0.28) + 1) / 2;
    ctx.fillStyle = `rgba(204, 251, 241, ${(0.05 + lift * 0.05).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(w, h);
    ctx.lineTo(w - 90 - lift * 40, h);
    ctx.quadraticCurveTo(w - 40, h - 50 - lift * 30, w, h - 110 - lift * 40);
    ctx.closePath();
    ctx.fill();
  }

  #yaourt(ctx, w, h, t) {
    const sec = t / 1000;
    const pot = ctx.createLinearGradient(0, 0, w, h);
    pot.addColorStop(0, '#2a1550');
    pot.addColorStop(0.5, '#1c0f33');
    pot.addColorStop(1, '#120920');
    ctx.fillStyle = pot;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.42;
    const cy = h * 0.46;
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 5; i++) {
      const turn = sec * (0.05 + i * 0.012) + i * 1.26;
      const r = h * (0.2 + i * 0.14);
      ctx.save();
      ctx.rotate(turn);
      ctx.strokeStyle = i % 2
        ? `rgba(237, 233, 254, ${(0.09 - i * 0.012).toFixed(3)})`
        : `rgba(167, 139, 250, ${(0.14 - i * 0.016).toFixed(3)})`;
      ctx.lineWidth = h * (0.1 - i * 0.012);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 1.15);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    const skin = ctx.createRadialGradient(w * 0.62, h * 0.2, 0, w * 0.62, h * 0.2, h * 0.55);
    skin.addColorStop(0, 'rgba(237, 233, 254, 0.12)');
    skin.addColorStop(1, 'rgba(237, 233, 254, 0)');
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, w, h);
  }

  #wankel(ctx, w, h, t) {
    const sky = ctx.createLinearGradient(0, 0, w * 0.4, h);
    sky.addColorStop(0, '#00004a');
    sky.addColorStop(0.6, '#00002c');
    sky.addColorStop(1, '#00001a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120, 132, 255, 0.07)';
    ctx.beginPath();
    for (let x = 0.5; x < w; x += 28) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0.5; y < h; y += 28) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 132, 255, 0.12)';
    ctx.beginPath();
    for (let x = 0.5; x < w; x += 140) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0.5; y < h; y += 140) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const phi = t * this.theme.backdrop.speed;
    const big = Math.min(w, h);
    this.#rotary(ctx, w * 0.64, h * 0.44, big * 0.34, phi, 0.42);
    this.#rotary(ctx, w * 0.14, h * 0.86, big * 0.15, phi + Math.PI, 0.22);

    ctx.fillStyle = 'rgba(204, 210, 255, 0.22)';
    ctx.font = `600 ${Math.max(10, Math.round(big * 0.018))}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('R 105  e 15  B 80', w * 0.64 - big * 0.3, h * 0.44 + big * 0.47);

    const shade = ctx.createRadialGradient(w * 0.5, h * 0.5, big * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    shade.addColorStop(0, 'rgba(0, 0, 20, 0)');
    shade.addColorStop(1, 'rgba(0, 0, 20, 0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
  }

  #erdtree(w, h) {
    const key = `${Math.round(w)}x${Math.round(h)}`;
    if (this.treeCache?.key === key) return this.treeCache.canvas;
    const canvas = paper(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    const g = canvas.getContext('2d');
    const size = Math.min(w, h);
    const crown = g.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, size * 0.62);
    crown.addColorStop(0, 'rgba(255, 214, 120, 0.3)');
    crown.addColorStop(0.45, 'rgba(232, 184, 74, 0.1)');
    crown.addColorStop(1, 'rgba(232, 184, 74, 0)');
    g.fillStyle = crown;
    g.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const segments = [];
    const grow = (x, y, angle, len, width, depth) => {
      const nx = x + Math.sin(angle) * len;
      const ny = y - Math.cos(angle) * len;
      segments.push([x, y, nx, ny, width]);
      if (depth <= 0) return;
      const forks = depth > 5 ? 2 : 2 + (rnd() > 0.6 ? 1 : 0);
      for (let i = 0; i < forks; i++) {
        const spread = (i - (forks - 1) / 2) * (0.5 + rnd() * 0.25);
        grow(nx, ny, angle * 0.6 + spread, len * (0.7 + rnd() * 0.08), width * 0.66, depth - 1);
      }
    };
    grow(w * 0.5, h * 1.02, 0, h * 0.2, size * 0.04, 7);
    g.lineCap = 'round';
    for (const [pass, alpha, scale] of [[0, 0.16, 3.2], [1, 0.75, 1]]) {
      g.strokeStyle = pass ? `rgba(246, 210, 122, ${alpha})` : `rgba(232, 184, 74, ${alpha})`;
      for (const [x, y, nx, ny, width] of segments) {
        g.lineWidth = Math.max(0.6, width * scale);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(nx, ny);
        g.stroke();
      }
    }
    this.treeCache = { key, canvas };
    return canvas;
  }

  #elden(ctx, w, h, t) {
    const sec = t / 1000;
    const ash = ctx.createLinearGradient(0, 0, 0, h);
    ash.addColorStop(0, '#1b1311');
    ash.addColorStop(0.55, '#120c0b');
    ash.addColorStop(1, '#0a0606');
    ctx.fillStyle = ash;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.32 + Math.sin(sec * 0.35) * 0.04;
    ctx.drawImage(this.#erdtree(w, h), 0, 0, w, h);
    ctx.globalAlpha = 1;

    const size = Math.min(w, h);
    ctx.save();
    ctx.translate(w * 0.5, h * 0.4);
    ctx.rotate(sec * 0.02);
    ctx.strokeStyle = 'rgba(232, 184, 74, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      const r = size * 0.42;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const k = i % 3;
      ctx.moveTo(c * r, s * r);
      ctx.lineTo(c * (r + size * (k ? 0.012 : 0.026)), s * (r + size * (k ? 0.012 : 0.026)));
      if (k === 0) {
        ctx.moveTo(c * (r + size * 0.02) - s * size * 0.008, s * (r + size * 0.02) + c * size * 0.008);
        ctx.lineTo(c * (r + size * 0.02) + s * size * 0.008, s * (r + size * 0.02) - c * size * 0.008);
      }
    }
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < 2; i++) {
      const x = w * (0.25 + i * 0.5) + Math.sin(sec * 0.08 + i * 2) * w * 0.12;
      const mist = ctx.createRadialGradient(x, h * 1.02, 0, x, h * 1.02, h * 0.5);
      mist.addColorStop(0, 'rgba(200, 16, 46, 0.32)');
      mist.addColorStop(1, 'rgba(200, 16, 46, 0)');
      ctx.fillStyle = mist;
      ctx.fillRect(0, 0, w, h);
    }

    for (let i = 0; i < 34; i++) {
      const fall = 14 + (i % 5) * 6;
      const y = ((sec * fall + i * 97) % (h + 40)) - 20;
      const x = ((i * 0.618034) % 1) * w + Math.sin(sec * 0.7 + i) * 22;
      const r = 1.6 + (i % 3);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sec * (0.6 + (i % 4) * 0.3) + i);
      ctx.fillStyle = i % 7 === 0 ? 'rgba(255, 90, 100, 0.55)' : `rgba(246, 210, 122, ${(0.35 + (i % 4) * 0.12).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.8, r, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    const shade = ctx.createRadialGradient(w * 0.5, h * 0.45, size * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    shade.addColorStop(0, 'rgba(8, 4, 4, 0)');
    shade.addColorStop(1, 'rgba(8, 4, 4, 0.6)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
  }

  #rotary(ctx, cx, cy, R, phi, alpha) {
    const e = R * 0.143;
    const housing = (scale) => {
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * TAU;
        const x = scale * (e * Math.cos(3 * a) + R * Math.cos(a));
        const y = scale * (e * Math.sin(3 * a) + R * Math.sin(a));
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2);
    ctx.globalAlpha = alpha;

    housing(1.16);
    ctx.fillStyle = 'rgba(0, 0, 255, 0.16)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(170, 180, 255, 0.28)';
    ctx.stroke();
    housing(1);
    ctx.fillStyle = 'rgba(0, 0, 30, 0.7)';
    ctx.fill();

    const since = (((phi - Math.PI / 2) % TAU) + TAU) % TAU;
    const fire = since < 1.3 ? 1 - since / 1.3 : 0;
    if (fire > 0) {
      ctx.save();
      ctx.clip();
      const fx = 0;
      const fy = (R - e) * 0.72;
      const flame = ctx.createRadialGradient(fx, fy, 0, fx, fy, R * 0.7);
      flame.addColorStop(0, `rgba(150, 165, 255, ${(0.5 * fire).toFixed(3)})`);
      flame.addColorStop(0.5, `rgba(0, 0, 255, ${(0.3 * fire).toFixed(3)})`);
      flame.addColorStop(1, 'rgba(0, 0, 255, 0)');
      ctx.fillStyle = flame;
      ctx.fillRect(-R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
      ctx.restore();
    }
    housing(1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(170, 180, 255, 0.55)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(204, 210, 255, 0.5)';
    const plug = R * 0.05;
    ctx.fillRect(-R * 0.16 - plug / 2, (R - e) * 1.06, plug, R * 0.13);
    ctx.fillRect(R * 0.16 - plug / 2, (R - e) * 1.06, plug, R * 0.13);
    ctx.fillStyle = 'rgba(0, 0, 255, 0.45)';
    ctx.fillRect(-R * 0.62, -(R - e) * 1.2, R * 0.3, R * 0.1);
    ctx.fillRect(R * 0.32, -(R - e) * 1.2, R * 0.3, R * 0.1);

    const rx = e * Math.cos(phi);
    const ry = e * Math.sin(phi);
    const psi = phi / 3;
    const apex = [0, 1, 2].map((j) => [rx + R * Math.cos(psi + (j * TAU) / 3), ry + R * Math.sin(psi + (j * TAU) / 3)]);
    ctx.beginPath();
    ctx.moveTo(apex[0][0], apex[0][1]);
    for (let j = 0; j < 3; j++) {
      const m = psi + ((j + 0.5) * TAU) / 3;
      const next = apex[(j + 1) % 3];
      ctx.quadraticCurveTo(rx + 0.82 * R * Math.cos(m), ry + 0.82 * R * Math.sin(m), next[0], next[1]);
    }
    ctx.closePath();
    const body = ctx.createLinearGradient(rx - R, ry - R, rx + R, ry + R);
    body.addColorStop(0, 'rgba(60, 72, 255, 0.62)');
    body.addColorStop(1, 'rgba(0, 0, 160, 0.62)');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(204, 210, 255, 0.75)';
    ctx.stroke();

    ctx.lineWidth = Math.max(1, R * 0.012);
    ctx.strokeStyle = 'rgba(204, 210, 255, 0.4)';
    ctx.setLineDash([R * 0.035, R * 0.035]);
    ctx.beginPath();
    ctx.arc(rx, ry, R * 0.3, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.2, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.fillStyle = 'rgba(204, 210, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.06, 0, TAU);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, R * 0.03);
    ctx.strokeStyle = '#e6e9ff';
    ctx.beginPath();
    for (let j = 0; j < 3; j++) {
      const a = psi + (j * TAU) / 3;
      ctx.moveTo(rx + 0.9 * R * Math.cos(a), ry + 0.9 * R * Math.sin(a));
      ctx.lineTo(apex[j][0], apex[j][1]);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.restore();
  }

  #apotheosis(ctx, w, h, t) {
    const sec = t / 1000;
    const ground = ctx.createRadialGradient(w * 0.28, h * 0.22, 0, w * 0.5, h * 0.5, Math.max(w, h));
    ground.addColorStop(0, '#231703');
    ground.addColorStop(0.5, '#120c04');
    ground.addColorStop(1, '#070502');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w * 0.24, h * 0.16);
    ctx.rotate(Math.sin(sec * 0.06) * 0.22 + 0.5);
    const shaft = ctx.createLinearGradient(0, 0, 0, h * 1.3);
    shaft.addColorStop(0, 'rgba(253, 230, 138, 0.16)');
    shaft.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-w * 0.55, h * 1.3);
    ctx.lineTo(w * 0.75, h * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(w * 0.5, h * 0.82);
    ctx.rotate(sec * 0.05);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.09)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const a = (Math.PI * 2 / 24) * i;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * h * 0.12, Math.sin(a) * h * 0.12);
      ctx.lineTo(Math.cos(a) * h * 0.95, Math.sin(a) * h * 0.95);
      ctx.stroke();
    }
    ctx.restore();

    for (let i = 0; i < 26; i++) {
      const phase = i * 0.618;
      const x = ((phase * w) + Math.sin(sec * 0.12 + i) * w * 0.06) % w;
      const y = ((sec * (6 + (i % 5) * 3) + i * 90) % (h + 60)) - 30;
      const size = 1.1 + (i % 4) * 0.7;
      ctx.globalAlpha = 0.18 + ((i % 6) / 6) * 0.5;
      ctx.fillStyle = i % 3 === 0 ? '#fff7d6' : '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 1.7, sec * 0.6 + i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  #tabletop(ctx, w, h, t) {
    const sec = t / 1000;
    const felt = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, h * 0.95);
    felt.addColorStop(0, '#3b1a66');
    felt.addColorStop(0.55, '#24103f');
    felt.addColorStop(1, '#150827');
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(216, 180, 254, 0.07)';
    ctx.lineWidth = 1.5;
    const r = 38;
    const hx = r * 1.5;
    const hy = r * Math.sqrt(3);
    for (let col = -1; col < w / hx + 1; col++) {
      for (let row = -1; row < h / hy + 1; row++) {
        const cx = col * hx;
        const cy = row * hy + (col % 2 ? hy / 2 : 0);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 3 * k;
          const x = cx + r * Math.cos(a);
          const y = cy + r * Math.sin(a);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    const lamp = ctx.createRadialGradient(w * 0.58, h * 0.12, 0, w * 0.58, h * 0.12, h * 0.8);
    lamp.addColorStop(0, 'rgba(251, 191, 36, 0.16)');
    lamp.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, w, h);

    const meeple = (x, y, size, alpha) => {
      ctx.fillStyle = `rgba(216, 180, 254, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y - size * 0.7, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - size * 0.5, y - size * 0.3);
      ctx.quadraticCurveTo(x, y - size * 0.75, x + size * 0.5, y - size * 0.3);
      ctx.lineTo(x + size * 0.34, y + size * 0.05);
      ctx.lineTo(x + size * 0.5, y + size * 0.6);
      ctx.lineTo(x + size * 0.1, y + size * 0.6);
      ctx.lineTo(x, y + size * 0.3);
      ctx.lineTo(x - size * 0.1, y + size * 0.6);
      ctx.lineTo(x - size * 0.5, y + size * 0.6);
      ctx.lineTo(x - size * 0.34, y + size * 0.05);
      ctx.closePath();
      ctx.fill();
    };
    for (let i = 0; i < 6; i++) {
      const x = w * (0.12 + i * 0.15) + Math.sin(sec * 0.25 + i * 1.3) * 18;
      const y = h * (0.78 + (i % 2) * 0.1) + Math.cos(sec * 0.2 + i) * 6;
      meeple(x, y, 22 + (i % 3) * 6, 0.1 + (i % 3) * 0.04);
    }

    const die = (x, y, s, rot, pips) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(233, 213, 255, 0.14)';
      ctx.beginPath();
      ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.18);
      ctx.fill();
      ctx.fillStyle = 'rgba(26, 11, 46, 0.7)';
      for (const [px, py] of pips) {
        ctx.beginPath();
        ctx.arc(px * s * 0.28, py * s * 0.28, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    die(w * 0.84, h * 0.62, 56, 0.35 + Math.sin(sec * 0.15) * 0.06, [[-1, -1], [1, 1], [0, 0], [-1, 1], [1, -1]]);
    die(w * 0.9, h * 0.72, 48, -0.2, [[-1, -1], [1, 1], [0, 0]]);
  }

  #horror(ctx, w, h, t) {
    const sec = t / 1000;

    ctx.fillStyle = '#070408';
    ctx.fillRect(0, 0, w, h);

    for (let bank = 0; bank < 2; bank++) {
      const drift = sec * (bank ? 6 : -4);
      for (let i = 0; i < 4; i++) {
        const x = (((i * 331.7) + drift * (10 + i * 3)) % (w + 400)) - 200;
        const y = h * (0.55 + bank * 0.22) + Math.sin(sec * 0.12 + i * 2.1 + bank) * 24;
        const r = 190 + i * 60;
        const fog = ctx.createRadialGradient(x, y, 0, x, y, r);
        fog.addColorStop(0, `rgba(122, 138, 153, ${bank ? 0.045 : 0.06})`);
        fog.addColorStop(1, 'rgba(122, 138, 153, 0)');
        ctx.fillStyle = fog;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }

    const beat = Math.sin(sec * 0.7) * 0.5 + 0.5;
    const stumble = Math.sin(sec * 9.3) > 0.985 ? 0.5 : 0;
    const lamp = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, w * 0.7);
    lamp.addColorStop(0, `rgba(200, 16, 46, ${0.05 + beat * 0.03 + stumble * 0.05})`);
    lamp.addColorStop(1, 'rgba(200, 16, 46, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, w, h);

    const edge = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.3, w * 0.5, h * 0.5, h * 0.85);
    edge.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(1, 'rgba(0, 0, 0, 0.78)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
  }

  #meadow(ctx, w, h, t) {
    const sec = t / 1000;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1c2913');
    sky.addColorStop(0.5, '#1a2511');
    sky.addColorStop(1, '#10180a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 26; i++) {
      const sx = ((i * 379.7) % w);
      const sy = ((i * 173.3) % (h * 0.42));
      const tw = 0.45 + 0.35 * Math.sin(sec * 0.6 + i * 1.7);
      ctx.globalAlpha = tw * 0.55;
      ctx.fillStyle = '#f5fbe8';
      ctx.fillRect(sx, sy, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;

    const glow = ctx.createRadialGradient(w * 0.28, h * 0.4, 0, w * 0.28, h * 0.4, w * 0.55);
    glow.addColorStop(0, 'rgba(251, 191, 36, 0.13)');
    glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const ridges = [
      { base: 0.6, amp: 22, tone: 'rgba(96, 142, 54, 0.16)', k: 1.15, drift: 0.05 },
      { base: 0.73, amp: 30, tone: 'rgba(45, 74, 22, 0.7)', k: 0.85, drift: 0.035 },
      { base: 0.85, amp: 36, tone: 'rgba(18, 30, 9, 0.95)', k: 0.6, drift: 0.02 }
    ];
    for (const ridge of ridges) {
      ctx.fillStyle = ridge.tone;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 16; x += 16) {
        const y = h * ridge.base
          + Math.sin(x * 0.0045 * ridge.k + sec * ridge.drift) * ridge.amp
          + Math.sin(x * 0.011 * ridge.k + 2.4) * ridge.amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    const count = this.theme.backdrop.motes ?? 34;
    for (let i = 0; i < count; i++) {
      const seed = i * 127.31;
      const firefly = i % 3 === 0;
      if (firefly) {
        const bx = ((seed * 7.13) % w);
        const by = h * (0.35 + ((seed * 3.7) % 45) / 100);
        const x = bx + Math.sin(sec * 0.16 + seed) * 34 + Math.sin(sec * 0.07 + seed * 2.1) * 18;
        const y = by + Math.cos(sec * 0.12 + seed) * 22;
        const pulse = Math.max(0, Math.sin(sec * 0.9 + seed));
        ctx.globalAlpha = 0.15 + pulse * 0.6;
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(((x % w) + w) % w, y, 1.9, 0, Math.PI * 2);
        ctx.fill();
        if (pulse > 0.75) {
          ctx.globalAlpha = (pulse - 0.75) * 1.2;
          ctx.beginPath();
          ctx.arc(((x % w) + w) % w, y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const p = ((sec / 35) * (0.6 + (i % 5) * 0.16) + seed / 97) % 1;
        const x = ((seed * 5.77) % w) + Math.sin(sec * 0.1 + seed) * 26;
        const y = h - p * h * 0.85;
        ctx.globalAlpha = Math.sin(p * Math.PI) * 0.35;
        ctx.fillStyle = '#e8f7cf';
        ctx.beginPath();
        ctx.arc(((x % w) + w) % w, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  #season(ctx, w, h, now) {
    const { sky, particle, count = 50, speed = 1, glow } = this.theme.backdrop;
    const sec = (now / 1000) * speed;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(0.55, sky[1]);
    grad.addColorStop(1, sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    if (glow) {
      const g = ctx.createRadialGradient(w * 0.3, h * 0.85, 0, w * 0.3, h * 0.85, Math.max(w, h) * 0.7);
      g.addColorStop(0, glow);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (!this.seedField || this.seedField.kind !== particle) {
      this.seedField = { kind: particle, items: Array.from({ length: count }, (_, i) => ({
        x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, p: Math.random() * TAU,
        s: 0.5 + Math.random() * 0.9, hue: Math.random()
      })) };
    }
    const light = this.theme.swatch[1];
    const light2 = this.theme.swatch[2];
    ctx.globalCompositeOperation = 'lighter';
    for (const it of this.seedField.items) {
      let x, y, a, size = it.r;
      switch (particle) {
        case 'snow': {
          const fall = (it.y + sec * 0.018 * it.s) % 1;
          x = (it.x + Math.sin(sec * 0.4 + it.p) * 0.02) * w;
          y = fall * h;
          a = 0.35 + 0.35 * Math.sin(sec + it.p);
          ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
          ctx.beginPath(); ctx.arc(x, y, size * 1.3, 0, TAU); ctx.fill();
          break;
        }
        case 'heart':
        case 'bubble': {
          const rise = (it.y - sec * 0.012 * it.s + 10) % 1;
          x = (it.x + Math.sin(sec * 0.3 + it.p) * 0.015) * w;
          y = rise * h;
          a = 0.12 + 0.18 * Math.sin(rise * Math.PI);
          size = it.r * (particle === 'heart' ? 4 : 5);
          ctx.strokeStyle = particle === 'bubble' ? `rgba(255, 255, 255, ${a})` : 'transparent';
          ctx.fillStyle = particle === 'heart' ? this.#tint(it.hue > 0.5 ? light : light2, a) : 'rgba(255,255,255,0.02)';
          ctx.lineWidth = 1;
          if (particle === 'bubble') { ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.stroke(); }
          else this.#heart(ctx, x, y, size);
          break;
        }
        case 'petal':
        case 'leaf': {
          const drift = (it.y + sec * 0.014 * it.s) % 1;
          x = ((it.x + sec * 0.01 * it.s + Math.sin(sec * 0.5 + it.p) * 0.03) % 1) * w;
          y = drift * h;
          a = 0.25 + 0.25 * Math.sin(sec * 0.8 + it.p);
          size = it.r * 3.2;
          ctx.fillStyle = this.#tint(it.hue > 0.6 ? light2 : light, a);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(sec * 0.6 * it.s + it.p);
          ctx.beginPath();
          ctx.ellipse(0, 0, size, size * (particle === 'leaf' ? 0.45 : 0.6), 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'ember': {
          const rise = (it.y - sec * 0.02 * it.s + 10) % 1;
          x = (it.x + Math.sin(sec * 0.9 + it.p) * 0.01) * w;
          y = (1 - rise * 0.9) * h;
          a = Math.max(0, 0.5 - rise * 0.5) * (0.6 + 0.4 * Math.sin(sec * 3 + it.p));
          ctx.fillStyle = this.#tint(it.hue > 0.5 ? light : light2, a);
          ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
          break;
        }
        default: {
          x = it.x * w; y = it.y * h;
          const flash = Math.max(0, Math.sin(sec * 1.4 * it.s + it.p));
          a = flash * flash * 0.6;
          ctx.fillStyle = this.#tint(it.hue > 0.5 ? light : '#ffffff', a);
          ctx.beginPath(); ctx.arc(x, y, size * (0.6 + flash), 0, TAU); ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  #tint(hex, a) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    if (!Number.isFinite(n)) return `rgba(255, 255, 255, ${a})`;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }

  #heart(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    ctx.closePath();
    ctx.fill();
  }

}
