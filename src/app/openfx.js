import { synth } from '../ui/sound.js';

const EASE = {
  out: 'cubic-bezier(.16,1,.3,1)',
  soft: 'cubic-bezier(.4,0,.2,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
  in: 'cubic-bezier(.55,0,1,.45)',
  back: 'cubic-bezier(.34,1.56,.64,1)',
  snap: 'cubic-bezier(.22,1.28,.36,1)',
  drop: 'cubic-bezier(.5,0,.75,0)'
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const lowPower = () => document.documentElement.dataset.lowpower === '1';
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVG = 'http://www.w3.org/2000/svg';

function stage({ root, center, pack, packW, packH, cards, targets, quiet = false }) {
  const u = packW / 24;
  const hh = packH / u / 2;
  const lite = lowPower();
  const anims = new Set();
  const loops = new Set();
  const sleepers = new Set();
  let budget = lite ? 16 : 46;

  const origin = document.createElement('div');
  origin.className = 'ofx-origin';
  origin.style.cssText = `position:absolute;left:${center.x}px;top:${center.y}px;width:0;height:0;z-index:5`;
  root.appendChild(origin);

  const x = { root, origin, u, hh, lite, fast: false, beat: 0, level: 0, k: 0.4, s: {}, center };

  const A = (el, kf, o = {}) => {
    const opt = { duration: 600, easing: EASE.out, fill: 'forwards', ...o };
    if (x.fast) { opt.duration = 1; opt.delay = 0; opt.endDelay = 0; opt.iterations = 1; }
    let anim;
    try { anim = el.animate(kf, opt); } catch { return Promise.resolve(); }
    anims.add(anim);
    return anim.finished.catch(() => {}).then(() => { anims.delete(anim); });
  };
  const loop = (el, kf, o = {}) => {
    if (x.fast) return null;
    let anim;
    try { anim = el.animate(kf, { duration: 1000, iterations: Infinity, easing: 'linear', ...o }); } catch { return null; }
    loops.add(anim);
    return anim;
  };
  const wait = (ms) => (x.fast || ms <= 0 ? Promise.resolve() : new Promise((resolve) => {
    const done = () => { clearTimeout(timer); sleepers.delete(done); resolve(); };
    const timer = setTimeout(done, ms);
    sleepers.add(done);
  }));
  const add = (css = '', where = origin) => {
    const e = document.createElement('div');
    e.className = 'ofx-fx';
    e.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;${css}`;
    where.appendChild(e);
    return e;
  };
  const sfx = (name, opts) => { if (!quiet && !x.fast) synth.cue(name, opts); };
  const px = (v) => `${(v * u).toFixed(2)}px`;
  const box = (cx, cy, w, h) => `left:${px(cx - w / 2)};top:${px(cy - h / 2)};width:${px(w)};height:${px(h)}`;

  const wrap = document.createElement('div');
  wrap.className = 'ofx-pack';
  wrap.style.cssText = `position:absolute;left:0;top:0;width:${packW}px;height:${packH}px;margin:${-packH / 2}px 0 0 ${-packW / 2}px;z-index:10`;
  const body = document.createElement('div');
  body.className = 'ofx-body';
  body.style.cssText = 'position:absolute;inset:0';
  body.appendChild(pack);
  wrap.appendChild(body);

  const n = cards.length;
  const list = cards.map((el, i) => {
    const w = el.offsetWidth || parseFloat(el.style.width) || 13 * u;
    const h = el.offsetHeight || parseFloat(el.style.height) || 18.2 * u;
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.margin = `${-h / 2}px 0 0 ${-w / 2}px`;
    el.style.zIndex = String(5 + n - i);
    el.style.opacity = '0';
    el.style.willChange = 'transform, opacity';
    origin.appendChild(el);
    return { el, i, w: w / u, h: h / u, t: { x: 0, y: 0, r: 0, s: 1, rx: 0, ry: 0 }, o: 0 };
  });
  origin.appendChild(wrap);

  const cs = getComputedStyle(pack);
  const accent = cs.getPropertyValue('--accent').trim() || '#f0b43c';
  const accent2 = cs.getPropertyValue('--accent2').trim() || '#2b2f45';
  const hot = `color-mix(in srgb, ${accent} 55%, #fff)`;

  const tf = (t) => `perspective(1000px) translate3d(${px(t.x)}, ${px(t.y)}, 0) rotate(${(t.r || 0).toFixed(2)}deg) rotateX(${t.rx || 0}deg) rotateY(${t.ry || 0}deg) scale(${t.s ?? 1})`;
  const slots = list.map((_, i) => ({ x: targets[i]?.x ?? 0, y: targets[i]?.y ?? 0, r: targets[i]?.r ?? 0 }));
  const top = Math.min(...slots.map((s, i) => s.y - (list[i].h / 2)));
  const mid = (n - 1) / 2;

  Object.assign(x, {
    A, loop, wait, add, sfx, px, box, wrap, body, pack, cards: list, n, accent, accent2, hot, tf, mid, top,
    light: '#fff6e2',
    slot: (i) => ({ x: slots[i].x, y: slots[i].y, r: slots[i].r, s: 1, rx: 0, ry: 0 }),
    fan: (i) => (n > 1 ? (i - mid) / Math.max(1, mid) : 0),
    set(c, t, o) {
      c.t = { ...c.t, ...t };
      c.el.style.transform = tf(c.t);
      if (o != null) { c.o = o; c.el.style.opacity = String(o); }
    },
    move(c, to, o = {}) {
      const from = { transform: tf(c.t), opacity: c.o };
      c.t = { ...c.t, ...to };
      if (to.o != null) c.o = to.o;
      const { via, ...rest } = o;
      const kf = via
        ? [from, ...via.map((v) => ({ transform: tf({ ...c.t, ...v }), opacity: v.o ?? c.o, offset: v.offset, easing: v.easing })), { transform: tf(c.t), opacity: c.o }]
        : [from, { transform: tf(c.t), opacity: c.o }];
      return A(c.el, kf, rest);
    },
    land({ stagger = 70, duration = 620, easing = EASE.snap, glint = true, order = null, delay = 0, tick = true } = {}) {
      return Promise.all(list.map((c, i) => {
        const k = order ? order(i) : i;
        return x.move(c, { ...x.slot(i), o: 1 }, { duration, delay: delay + k * stagger, easing }).then(() => {
          if (glint) x.glint(c);
          if (tick && i % 2 === 0) sfx('tick', { level: 0.35 });
        });
      }));
    },
    erupt({ from = { x: 0, y: 0 }, lift = 12, spread = 9, duration = 900, stagger = 60, s0 = 0.4, spin = 10, easing = EASE.soft, z = null } = {}) {
      return Promise.all(list.map((c, i) => {
        const f = x.fan(i);
        const end = x.slot(i);
        if (z != null) c.el.style.zIndex = String(z + n - i);
        x.set(c, { x: from.x, y: from.y, r: 0, s: s0, rx: 0, ry: 0 }, 0);
        const apex = { x: (from.x + end.x) / 2 + f * spread, y: Math.min(from.y, end.y) - lift - Math.abs(f) * -2, r: f * -spin, s: 0.86, o: 1, offset: 0.42 };
        return x.move(c, { ...end, o: 1 }, { duration, delay: i * stagger, easing, via: [{ ...apex, easing: EASE.out }] }).then(() => x.glint(c));
      }));
    },
    glint(c, o = {}) { x.sweep(c.el, { duration: 620, ...o }); },
    sweep(el, { duration = 700, color = 'rgba(255,255,255,.7)', width = 36, delay = 0, z = 40 } = {}) {
      if (x.fast) return Promise.resolve();
      const holder = document.createElement('span');
      holder.className = 'ofx-sweep';
      holder.style.cssText = `position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;z-index:${z}`;
      const band = document.createElement('i');
      band.style.cssText = `position:absolute;top:-30%;bottom:-30%;left:0;width:${width}%;background:linear-gradient(90deg,transparent,${color} 50%,transparent);transform:translateX(-110%) skewX(-18deg)`;
      holder.appendChild(band);
      el.appendChild(holder);
      return A(band, [{ transform: 'translateX(-110%) skewX(-18deg)' }, { transform: `translateX(${Math.ceil(10000 / width) + 20}%) skewX(-18deg)` }], { duration, delay, easing: EASE.inOut }).then(() => holder.remove());
    },
    glow({ x: gx = 0, y: gy = 0, size = 30, color = hot, z = 2, o = 0, sx = 1, where = origin } = {}) {
      return add(`${box(gx, gy, size * sx, size)};border-radius:50%;background:radial-gradient(closest-side,${color},color-mix(in srgb, ${color} 35%, transparent) 45%,transparent);opacity:${o};z-index:${z}`, where);
    },
    rays({ x: rx = 0, y: ry = 0, size = 70, color = hot, z = 1, count = 18, o = 0 } = {}) {
      const step = 360 / count;
      return add(`${box(rx, ry, size, size)};border-radius:50%;background:repeating-conic-gradient(from 0deg,${color} 0deg ${step * 0.28}deg,transparent ${step * 0.28}deg ${step}deg);-webkit-mask:radial-gradient(closest-side,#000 8%,rgba(0,0,0,.5) 40%,transparent);mask:radial-gradient(closest-side,#000 8%,rgba(0,0,0,.5) 40%,transparent);opacity:${o};z-index:${z}`);
    },
    shock(sx, sy, { color = hot, from = 0.2, to = 5, duration = 720, size = 12, width = 0.7, z = 16, delay = 0 } = {}) {
      const r = add(`${box(sx, sy, size, size)};border-radius:50%;border:${px(width)} solid ${color};box-shadow:0 0 ${px(1.4)} ${color},inset 0 0 ${px(1.4)} ${color};opacity:0;z-index:${z}`);
      return A(r, [{ transform: `scale(${from})`, opacity: 1 }, { transform: `scale(${to})`, opacity: 0 }], { duration, delay, easing: EASE.out }).then(() => r.remove());
    },
    sparks(sx, sy, count, { color = hot, colors = null, dist = [8, 22], life = [520, 900], size = [0.7, 1.4], gravity = 0, angle = [0, 360], z = 30, shape = 'dot', delay = 0 } = {}) {
      const all = [];
      for (let i = 0; i < count; i++) {
        if (budget <= 0) break;
        budget--;
        const col = colors ? pick(colors) : color;
        const a = rand(angle[0], angle[1]) * Math.PI / 180;
        const d = rand(dist[0], dist[1]);
        const ex = sx + Math.cos(a) * d;
        const ey = sy + Math.sin(a) * d;
        const s = rand(size[0], size[1]);
        const dur = rand(life[0], life[1]);
        const deg = a * 180 / Math.PI;
        let e;
        let kf;
        if (shape === 'streak') {
          e = add(`width:${px(s * 3.4)};height:${px(s * 0.34)};margin:${px(-s * 0.17)} 0 0 ${px(-s * 3.4)};transform-origin:100% 50%;border-radius:${px(s)};background:linear-gradient(90deg,transparent,${col} 60%,#fff);z-index:${z};opacity:0`);
          kf = [
            { transform: `translate(${px(sx)},${px(sy)}) rotate(${deg}deg) scaleX(.2)`, opacity: 1 },
            { transform: `translate(${px(sx + Math.cos(a) * d * 0.7)},${px(sy + Math.sin(a) * d * 0.7 + gravity * 0.3)}) rotate(${deg}deg) scaleX(1)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${px(ex)},${px(ey + gravity)}) rotate(${deg}deg) scaleX(.3)`, opacity: 0 }
          ];
        } else {
          const spin = rand(-260, 260);
          const look = shape === 'square'
            ? `width:${px(s * 1.1)};height:${px(s * 1.7)};margin:${px(-s * 0.85)} 0 0 ${px(-s * 0.55)};background:${col};border-radius:${px(s * 0.15)}`
            : shape === 'star'
              ? `width:${px(s * 3)};height:${px(s * 3)};margin:${px(-s * 1.5)} 0 0 ${px(-s * 1.5)};background:radial-gradient(closest-side,#fff,${col} 40%,transparent);clip-path:polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%)`
              : `width:${px(s * 2.4)};height:${px(s * 2.4)};margin:${px(-s * 1.2)} 0 0 ${px(-s * 1.2)};border-radius:50%;background:radial-gradient(closest-side,#fff,${col} 38%,transparent)`;
          e = add(`${look};z-index:${z};opacity:0`);
          kf = [
            { transform: `translate(${px(sx)},${px(sy)}) rotate(0deg) scale(${shape === 'star' ? 0.2 : 1})`, opacity: 1 },
            { transform: `translate(${px(sx + (ex - sx) * 0.7)},${px(sy + (ey - sy) * 0.7 + gravity * 0.25)}) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${px(ex)},${px(ey + gravity)}) rotate(${spin}deg) scale(.2)`, opacity: 0 }
          ];
        }
        all.push(A(e, kf, { duration: dur, delay: delay + rand(0, 60), easing: 'cubic-bezier(.12,.75,.3,1)' }).then(() => { e.remove(); budget++; }));
      }
      return Promise.all(all);
    },
    inward(count, { radius = [16, 28], color = hot, life = [520, 820], z = 9, cx = 0, cy = 0, swirl = 0 } = {}) {
      const all = [];
      for (let i = 0; i < count; i++) {
        if (budget <= 0) break;
        budget--;
        const a = rand(0, Math.PI * 2);
        const r = rand(radius[0], radius[1]);
        const s = rand(0.6, 1.2);
        const e = add(`width:${px(s * 2.2)};height:${px(s * 2.2)};margin:${px(-s * 1.1)} 0 0 ${px(-s * 1.1)};border-radius:50%;background:radial-gradient(closest-side,#fff,${color} 40%,transparent);z-index:${z};opacity:0`);
        const b = a + swirl;
        all.push(A(e, [
          { transform: `translate(${px(cx + Math.cos(a) * r)},${px(cy + Math.sin(a) * r)}) scale(.4)`, opacity: 0 },
          { transform: `translate(${px(cx + Math.cos((a + b) / 2) * r * 0.6)},${px(cy + Math.sin((a + b) / 2) * r * 0.6)}) scale(1)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${px(cx + Math.cos(b) * 1.5)},${px(cy + Math.sin(b) * 1.5)}) scale(.3)`, opacity: 0 }
        ], { duration: rand(life[0], life[1]), delay: rand(0, 220), easing: EASE.in }).then(() => { e.remove(); budget++; }));
      }
      return Promise.all(all);
    },
    flash(color = '#fff', duration = 520, peak = 0.9) {
      const f = add(`inset:0;width:auto;height:auto;z-index:60;background:radial-gradient(circle at ${center.x}px ${center.y}px, ${color}, color-mix(in srgb, ${color} 40%, transparent) 30%, transparent 75%);opacity:0`, root);
      return A(f, [{ opacity: 0 }, { opacity: peak, offset: 0.18 }, { opacity: 0 }], { duration, easing: 'ease-out' }).then(() => f.remove());
    },
    dim(level = 0.6, duration = 420) {
      const d = add(`inset:0;width:auto;height:auto;z-index:1;background:radial-gradient(circle at ${center.x}px ${center.y}px, rgba(2,3,8,${level * 0.55}), rgba(2,3,8,${level}) 62%);opacity:0`, root);
      A(d, [{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASE.soft });
      d.lift = (ms = 500) => A(d, [{ opacity: getComputedStyle(d).opacity }, { opacity: 0 }], { duration: ms, easing: EASE.soft }).then(() => d.remove());
      return d;
    },
    shake(el = body, amp = 0.6, duration = 420, steps = 9) {
      const kf = [];
      for (let i = 0; i <= steps; i++) {
        const k = i === steps ? 0 : (1 - i / steps);
        const sx = (i % 2 ? 1 : -1) * amp * k * rand(0.6, 1);
        const sy = rand(-0.4, 0.4) * amp * k;
        kf.push({ transform: `translate(${px(sx)},${px(sy)}) rotate(${(sx * 0.6).toFixed(2)}deg)` });
      }
      return A(el, kf, { duration, easing: 'linear', fill: 'none' });
    },
    clonePack(clip, z = 11) {
      const p = wrap.cloneNode(true);
      p.style.clipPath = clip;
      p.style.zIndex = String(z);
      origin.appendChild(p);
      return p;
    },
    hidePack() { wrap.style.visibility = 'hidden'; },
    svg(css, viewBox, where = origin) {
      const s = document.createElementNS(SVG, 'svg');
      s.setAttribute('viewBox', viewBox);
      s.setAttribute('preserveAspectRatio', 'none');
      s.style.cssText = `position:absolute;overflow:visible;pointer-events:none;${css}`;
      where.appendChild(s);
      return s;
    },
    line(svg, points, { stroke = '#fff', width = 0.3, opacity = 1 } = {}) {
      const l = document.createElementNS(SVG, 'polyline');
      l.setAttribute('points', points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' '));
      l.setAttribute('fill', 'none');
      l.setAttribute('stroke', stroke);
      l.setAttribute('stroke-width', String(width));
      l.setAttribute('stroke-linejoin', 'round');
      l.setAttribute('stroke-linecap', 'round');
      l.setAttribute('opacity', String(opacity));
      svg.appendChild(l);
      return l;
    },
    skip() {
      if (x.fast) return;
      x.fast = true;
      for (const a of [...anims]) { try { a.finish(); } catch { a.cancel(); } }
      for (const a of loops) a.cancel();
      loops.clear();
      for (const s of [...sleepers]) s();
    },
    finish() {
      for (const a of loops) a.cancel();
      loops.clear();
      for (const e of root.querySelectorAll('.ofx-fx')) {
        if (x.fast) { e.remove(); continue; }
        e.animate([{ opacity: getComputedStyle(e).opacity }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.catch(() => {}).then(() => e.remove());
      }
      list.forEach((c, i) => x.set(c, x.slot(i), 1));
      for (const c of list) c.el.style.willChange = '';
    }
  });
  return x;
}

const FX = {};

FX.tearstrip = {
  async charge(x) {
    const { A, u, hh, add, px } = x;
    const cut = 0.15;
    const y = -hh + hh * 2 * cut;
    const glow = x.glow({ y, size: 30, sx: 1.2, z: 9 });
    A(glow, [{ opacity: 0, transform: 'scaleY(.4)' }, { opacity: 0.4, transform: 'scaleY(.6)' }], { duration: 700 });
    const perf = add(`left:${px(-11)};top:${px(y - 0.14)};width:${px(22)};height:${px(0.28)};background:repeating-linear-gradient(90deg,rgba(255,255,255,.95) 0 ${0.8 * u}px,transparent ${0.8 * u}px ${1.5 * u}px);transform-origin:0 50%;transform:scaleX(0);z-index:12`);
    const head = add(`width:${px(3)};height:${px(3)};margin:${px(-1.5)} 0 0 ${px(-1.5)};border-radius:50%;background:radial-gradient(closest-side,#fff,${x.hot} 45%,transparent);z-index:14`);
    x.sfx('zip', { dur: 0.42, level: 0.25 });
    await Promise.all([
      A(perf, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 480, easing: EASE.inOut }),
      A(head, [{ transform: `translate(${px(-11)},${px(y)}) scale(.5)`, opacity: 1 }, { transform: `translate(${px(11)},${px(y)}) scale(1.2)`, opacity: 1, offset: 0.9 }, { transform: `translate(${px(11.5)},${px(y)}) scale(0)`, opacity: 0 }], { duration: 520, easing: EASE.inOut })
    ]);
    head.remove();
    x.sparks(11, y, 6, { dist: [3, 8], size: [0.4, 0.8] });
    const strip = x.clonePack(`inset(0 0 ${100 - cut * 100}% 0)`, 13);
    strip.style.transformOrigin = `100% ${cut * 100}%`;
    x.wrap.style.clipPath = `inset(${cut * 100}% 0 0 0)`;
    const leak = add(`left:${px(-12)};top:${px(y - 0.5)};width:${px(24)};height:${px(1)};background:linear-gradient(90deg,transparent,${x.hot} 20% 80%,transparent);opacity:0;z-index:12`);
    perf.style.zIndex = '14';
    Object.assign(x.s, { y, strip, glow, perf, leak, lift: 0 });
  },
  async hold(x) {
    const { A, s, k, u } = x;
    const deg = 7 + 9 * k;
    x.sfx('stretch', { level: k });
    A(s.strip, [{ transform: `rotate(${-s.lift}deg)` }, { transform: `rotate(${-deg}deg) translateY(${-0.3 * u}px)`, offset: 0.35 }, { transform: `rotate(${-3 - 2 * k}deg)` }], { duration: 640, easing: EASE.inOut });
    s.lift = 3 + 2 * k;
    A(s.leak, [{ opacity: 0.2 + 0.2 * k }, { opacity: 0.6 + 0.4 * k, offset: 0.35 }, { opacity: 0.3 + 0.3 * k }], { duration: 640 });
    A(s.glow, [{ opacity: 0.4 }, { opacity: 0.6 + 0.3 * k, offset: 0.35 }, { opacity: 0.45 + 0.2 * k }], { duration: 640 });
    x.shake(x.body, 0.2 + 0.25 * k, 300, 6);
    await x.wait(660);
  },
  async burst(x) {
    const { A, s, u, cards, n, hh, add, px } = x;
    x.sfx('crack', { level: 0.5 });
    x.sfx('whoosh', { level: 0.7 });
    s.perf.remove();
    x.flash(x.light, 420, 0.45);
    x.shock(0, s.y, { to: 4, duration: 560, width: 0.5 });
    A(s.strip, [{ transform: `rotate(${-s.lift}deg)` }, { transform: `translate(${px(10)},${px(-10)}) rotate(14deg)`, opacity: 1, offset: 0.4 }, { transform: `translate(${px(30)},${px(-22)}) rotate(48deg)`, opacity: 0 }], { duration: 760, easing: EASE.out });
    x.sparks(4, s.y, 10, { shape: 'square', colors: [x.accent, '#fff', x.hot], dist: [6, 16], gravity: 14, life: [700, 1000], angle: [-160, -20] });
    const beam = add(`left:${px(-9)};top:${px(s.y - 46)};width:${px(18)};height:${px(46)};background:linear-gradient(0deg,${x.hot},color-mix(in srgb, ${x.hot} 30%, transparent) 40%,transparent);-webkit-mask:linear-gradient(90deg,transparent,#000 30% 70%,transparent);mask:linear-gradient(90deg,transparent,#000 30% 70%,transparent);transform-origin:50% 100%;z-index:4;opacity:0`);
    A(beam, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 0.85, offset: 0.3 }, { transform: 'scaleY(1.1)', opacity: 0 }], { duration: 1300, easing: EASE.out }).then(() => beam.remove());
    A(s.glow, [{ opacity: 0.6 }, { opacity: 1, transform: 'scale(1.3)', offset: 0.2 }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 900 });
    A(s.leak, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    cards.forEach((c, i) => { c.el.style.zIndex = String(5 + i); x.set(c, { x: 0, y: s.y + c.h * 0.5, s: 0.8 }, 1); });
    await Promise.all(cards.map((c, i) => x.move(c, { x: (i - x.mid) * 0.9, y: s.y - c.h * 0.32 - (n - i) * 0.5, r: (i - x.mid) * 1.6 }, { duration: 420, delay: i * 30, easing: EASE.out })));
    A(x.wrap, [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${px(hh * 1.4)}) rotate(4deg)`, opacity: 0 }], { duration: 460, easing: EASE.in });
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + n - i); });
    await x.land({ stagger: 75, duration: 640 });
  }
};

FX.zipper = {
  async charge(x) {
    const { A, add, px, hh } = x;
    const seam = add(`left:${px(-0.45)};top:${px(-hh)};width:${px(0.9)};height:${px(hh * 2)};background:linear-gradient(90deg,transparent,rgba(4,5,10,.92) 25% 75%,transparent);transform-origin:50% 0;transform:scaleY(0);z-index:12`);
    const seamGlow = add(`left:${px(-2)};top:${px(-hh)};width:${px(4)};height:${px(hh * 2)};background:linear-gradient(90deg,transparent,${x.hot} 45% 55%,transparent);transform-origin:50% 0;transform:scaleY(0);opacity:.8;z-index:11`);
    const pull = add(`left:${px(-1.5)};top:${px(-hh - 0.6)};width:${px(3)};height:${px(5.4)};border-radius:${px(0.7)} ${px(0.7)} ${px(1.4)} ${px(1.4)};background:radial-gradient(circle at 50% 74%,rgba(0,0,0,.65) 0 ${px(0.55)},transparent ${px(0.65)}),linear-gradient(90deg,#8a6420,#fff3c4 35%,#e2b24a 55%,#7a5416);box-shadow:0 ${px(0.3)} ${px(0.8)} rgba(0,0,0,.55),inset 0 0 0 ${px(0.12)} rgba(255,255,255,.35);z-index:14;transform-origin:50% 0;overflow:hidden`);
    x.sfx('tick', { level: 0.5 });
    await A(pull, [{ transform: 'translateY(0) scale(0)', opacity: 0 }, { transform: 'translateY(0) scale(1.18)', opacity: 1, offset: 0.65 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 420, easing: EASE.out });
    x.sweep(pull, { duration: 520, color: 'rgba(255,255,255,.9)', width: 60 });
    await x.wait(200);
    Object.assign(x.s, { seam, seamGlow, pull, p: 0 });
  },
  async hold(x) {
    const { A, s, k, hh, px, beat } = x;
    const p = 0.08 + 0.3 * (1 - Math.pow(0.62, beat + 1));
    const from = s.p;
    s.p = p;
    x.sfx('zip', { dur: 0.2, level: 0.2 + 0.3 * k });
    const y0 = from * hh * 2;
    const y1 = p * hh * 2;
    A(s.pull, [{ transform: `translateY(${px(y0)})` }, { transform: `translateY(${px(y1 + 0.8)})`, offset: 0.55 }, { transform: `translateY(${px(y1)})` }], { duration: 520, easing: EASE.inOut });
    A(s.seam, [{ transform: `scaleY(${from})` }, { transform: `scaleY(${p})` }], { duration: 300, easing: EASE.inOut });
    A(s.seamGlow, [{ transform: `scaleY(${from})`, opacity: 0.5 + 0.3 * k }, { transform: `scaleY(${p})`, opacity: 1 }], { duration: 300 });
    await x.wait(560);
  },
  async burst(x) {
    const { A, s, hh, px, cards } = x;
    x.sfx('zip', { dur: 0.32, level: 0.9 });
    const run = 340;
    A(s.seam, [{ transform: `scaleY(${s.p})` }, { transform: 'scaleY(1)' }], { duration: run, easing: EASE.in });
    A(s.seamGlow, [{ transform: `scaleY(${s.p})` }, { transform: 'scaleY(1)' }], { duration: run, easing: EASE.in });
    for (let i = 1; i <= 3; i++) setTimeout(() => x.sparks(0, -hh + (s.p + (1 - s.p) * i / 3) * hh * 2, 3, { dist: [2, 6], size: [0.4, 0.8] }), run * i / 3);
    await A(s.pull, [{ transform: `translateY(${px(s.p * hh * 2)})` }, { transform: `translateY(${px(hh * 2 - 2)})` }], { duration: run, easing: EASE.in });
    x.sfx('burst', { level: 0.4 });
    const inner = x.glow({ size: hh * 2.2, sx: 0.5, z: 4 });
    A(inner, [{ opacity: 0, transform: 'scaleX(.1)' }, { opacity: 1, transform: 'scaleX(1)', offset: 0.35 }, { opacity: 0, transform: 'scaleX(1.4)' }], { duration: 1100 }).then(() => inner.remove());
    const L = x.clonePack('inset(0 50% 0 0)', 12);
    const R = x.clonePack('inset(0 0 0 50%)', 12);
    x.hidePack();
    A(s.pull, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    s.seam.remove();
    A(s.seamGlow, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    L.style.transformOrigin = '0 50%';
    R.style.transformOrigin = '100% 50%';
    A(L, [{ transform: 'perspective(800px) rotateY(0)' }, { transform: `perspective(800px) rotateY(-118deg) translateX(${px(-3)})`, opacity: 0.9, offset: 0.7 }, { transform: `perspective(800px) rotateY(-130deg) translateX(${px(-6)})`, opacity: 0 }], { duration: 900, easing: EASE.out });
    A(R, [{ transform: 'perspective(800px) rotateY(0)' }, { transform: `perspective(800px) rotateY(118deg) translateX(${px(3)})`, opacity: 0.9, offset: 0.7 }, { transform: `perspective(800px) rotateY(130deg) translateX(${px(6)})`, opacity: 0 }], { duration: 900, easing: EASE.out });
    await x.erupt({ lift: 8, spread: 7, duration: 820, stagger: 55, s0: 0.55, z: 20 });
  }
};

FX.blade = {
  beats: 1,
  async charge(x) {
    const { A, add, px, hh } = x;
    x.s.dim = x.dim(0.55, 420);
    A(x.wrap, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }], { duration: 900, easing: EASE.soft });
    const star = add(`width:${px(7)};height:${px(7)};margin:${px(-3.5)} 0 0 ${px(-3.5)};background:radial-gradient(closest-side,#fff,#dff3ff 30%,transparent);clip-path:polygon(50% 0,56% 44%,100% 50%,56% 56%,50% 100%,44% 56%,0 50%,44% 44%);z-index:20;opacity:0`);
    const sx = -10.5;
    const sy = hh * 0.36;
    x.sfx('shimmer', { level: 0.6 });
    await A(star, [{ transform: `translate(${px(sx)},${px(sy)}) scale(0) rotate(0deg)`, opacity: 0 }, { transform: `translate(${px(sx)},${px(sy)}) scale(1.3) rotate(90deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(${px(sx)},${px(sy)}) scale(.8) rotate(135deg)`, opacity: 0.9 }], { duration: 560, easing: EASE.out });
    Object.assign(x.s, { star, sx, sy });
  },
  async hold(x) {
    const { A, s, add, px, k } = x;
    x.sfx('pulse', { level: k });
    const lines = x.lite ? 5 : 9;
    for (let i = 0; i < lines; i++) {
      const a = (i / lines) * 360 + rand(-12, 12);
      const len = rand(7, 12);
      const l = add(`width:${px(len)};height:${px(0.22)};margin:${px(-0.11)} 0 0 0;transform-origin:0 50%;background:linear-gradient(90deg,transparent,rgba(220,240,255,.85));z-index:3;opacity:0`);
      const r0 = 38;
      const r1 = 18;
      A(l, [{ transform: `rotate(${a + 180}deg) translateX(${px(-r0 - len)})`, opacity: 0 }, { transform: `rotate(${a + 180}deg) translateX(${px(-(r0 + r1) / 2 - len)})`, opacity: 0.4 + 0.5 * k, offset: 0.5 }, { transform: `rotate(${a + 180}deg) translateX(${px(-r1 - len)})`, opacity: 0 }], { duration: 420, delay: rand(0, 160), easing: EASE.in }).then(() => l.remove());
    }
    A(s.star, [{ transform: `translate(${px(s.sx)},${px(s.sy)}) scale(.8) rotate(135deg)` }, { transform: `translate(${px(s.sx)},${px(s.sy)}) scale(${1.3 + 0.4 * k}) rotate(180deg)`, offset: 0.4 }, { transform: `translate(${px(s.sx)},${px(s.sy)}) scale(.8) rotate(225deg)` }], { duration: 560, easing: EASE.inOut });
    x.shake(x.body, 0.15 + 0.2 * k, 260, 6);
    await x.wait(580);
  },
  async burst(x) {
    const { A, s, add, px, hh, cards } = x;
    const ang = -26;
    const m = Math.tan(ang * Math.PI / 180);
    const yl = -12 * m;
    const yr = 12 * m;
    const leftPct = ((-yl + hh) / (hh * 2)) * 100;
    const rightPct = ((-yr + hh) / (hh * 2)) * 100;
    A(s.star, [{ opacity: 1 }, { opacity: 0, transform: `translate(${px(s.sx)},${px(s.sy)}) scale(2.2)` }], { duration: 200 });
    const slash = add(`width:${px(80)};height:${px(0.8)};margin:${px(-0.4)} 0 0 ${px(-40)};border-radius:${px(0.5)};background:linear-gradient(90deg,transparent,#fff 18%,#fff 82%,transparent);box-shadow:0 0 ${px(1.2)} #cfeaff,0 0 ${px(3)} rgba(160,210,255,.8);z-index:30;transform:rotate(${ang}deg) scaleX(0)`);
    x.sfx('crack', { level: 0.9 });
    x.sfx('whoosh', { level: 0.9 });
    await A(slash, [{ transform: `rotate(${ang}deg) scaleX(0)`, opacity: 1, transformOrigin: '0 50%' }, { transform: `rotate(${ang}deg) scaleX(1)`, opacity: 1, transformOrigin: '0 50%' }], { duration: 130, easing: EASE.in });
    A(slash, [{ opacity: 1, transform: `rotate(${ang}deg) scaleX(1) scaleY(1)` }, { opacity: 0, transform: `rotate(${ang}deg) scaleX(1) scaleY(.2)` }], { duration: 520, easing: EASE.out }).then(() => slash.remove());
    x.flash('#eaf6ff', 380, 0.4);
    const T = x.clonePack(`polygon(0 0,100% 0,100% ${rightPct}%,0 ${leftPct}%)`, 12);
    const B = x.clonePack(`polygon(0 ${leftPct}%,100% ${rightPct}%,100% 100%,0 100%)`, 12);
    x.hidePack();
    const nx = Math.sin(ang * Math.PI / 180);
    const ny = -Math.cos(ang * Math.PI / 180);
    A(T, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${px(nx * 1.6)},${px(ny * 1.6)}) rotate(-1deg)`, offset: 0.2 }, { transform: `translate(${px(nx * 6 + 16)},${px(ny * 6 - 8)}) rotate(-9deg)`, opacity: 0 }], { duration: 900, easing: EASE.out });
    A(B, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${px(-nx * 1.6)},${px(-ny * 1.6)}) rotate(1deg)`, offset: 0.2 }, { transform: `translate(${px(-nx * 6 - 16)},${px(-ny * 6 + 8)}) rotate(9deg)`, opacity: 0 }], { duration: 900, easing: EASE.out });
    for (let i = 0; i < 6; i++) {
      const t = rand(-10, 10);
      x.sparks(t, t * m, 2, { shape: 'streak', color: '#cfeaff', dist: [6, 14], angle: [ang + 90 - 20 + (i % 2) * 180, ang + 90 + 20 + (i % 2) * 180] });
    }
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + i); });
    await x.wait(140);
    s.dim.lift(700);
    await Promise.all(cards.map((c, i) => {
      const end = x.slot(i);
      x.set(c, { x: 0, y: 0, s: 0.25, r: rand(-12, 12) }, 0);
      return x.move(c, { ...end, o: 1 }, { duration: 640, delay: i * 70, easing: EASE.snap, via: [{ x: end.x * 0.6 + x.fan(i) * 4, y: end.y * 0.6 - 4, s: 0.9, o: 1, offset: 0.45 }] }).then(() => x.glint(c));
    }));
  }
};

function crackPath(from, angle, length, segs) {
  const pts = [from];
  let [cx, cy] = from;
  let a = angle;
  for (let i = 0; i < segs; i++) {
    a += rand(-38, 38) * Math.PI / 180;
    const step = length / segs * rand(0.7, 1.3);
    cx += Math.cos(a) * step;
    cy += Math.sin(a) * step;
    pts.push([cx, cy]);
  }
  return pts;
}

FX.shatter = {
  async charge(x) {
    const { hh, u, A } = x;
    const P = [rand(-3, 3), -hh * 0.12];
    const svg = x.svg(`left:0;top:0;width:${24 * u}px;height:${hh * 2 * u}px;z-index:14`, `-12 ${-hh} 24 ${hh * 2}`, x.wrap);
    const cracks = [];
    const n = x.lite ? 7 : 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25);
      const pts = crackPath(P, a, rand(12, 22), 6);
      const glow = x.line(svg, pts, { stroke: x.hot, width: 1.2, opacity: 0.5 });
      const core = x.line(svg, pts, { stroke: '#fff', width: 0.26 });
      core.setAttribute('stroke-linejoin', 'miter');
      core.setAttribute('stroke-linecap', 'butt');
      let len = 0;
      for (let j = 1; j < pts.length; j++) len += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
      for (const l of [glow, core]) { l.style.strokeDasharray = `${len}`; l.style.strokeDashoffset = `${len}`; }
      cracks.push({ glow, core, len });
    }
    const seep = x.glow({ x: 12 + P[0], y: hh + P[1], size: 22, z: 13, where: x.wrap });
    Object.assign(x.s, { P, svg, cracks, seep, next: 0 });
    x.sfx('crack', { level: 0.35 });
    x.shake(x.body, 0.5, 260, 6);
    FX.shatter.grow(x, 3, 260);
    A(seep, [{ opacity: 0 }, { opacity: 0.35 }], { duration: 400 });
    await x.wait(520);
  },
  grow(x, count, duration) {
    const { s } = x;
    for (let i = 0; i < count && s.next < s.cracks.length; i++, s.next++) {
      const c = s.cracks[s.next];
      for (const l of [c.glow, c.core]) x.A(l, [{ strokeDashoffset: c.len }, { strokeDashoffset: 0 }], { duration, delay: i * 40, easing: EASE.out });
    }
  },
  async hold(x) {
    const { A, s, k } = x;
    x.sfx('crack', { level: 0.15 + 0.25 * k });
    FX.shatter.grow(x, 2, 220);
    A(s.seep, [{ opacity: 0.3 + 0.2 * k }, { opacity: 0.7 + 0.3 * k, offset: 0.3 }, { opacity: 0.35 + 0.25 * k }], { duration: 560 });
    x.shake(x.body, 0.3 + 0.4 * k, 300, 7);
    await x.wait(580);
  },
  async burst(x) {
    const { A, s, hh, px, cards } = x;
    FX.shatter.grow(x, 20, 120);
    x.sfx('crack', { level: 1 });
    x.sfx('burst', { level: 0.7 });
    x.flash('#fff', 520, 0.8);
    const [Px, Py] = s.P;
    const W = 24;
    const H = hh * 2;
    const per = [];
    const along = (a, b, steps) => { for (let i = 0; i < steps; i++) per.push([a[0] + (b[0] - a[0]) * (i / steps) + (i ? rand(-1, 1) : 0), a[1] + (b[1] - a[1]) * (i / steps) + (i ? rand(-1.5, 1.5) : 0)]); };
    const tl = [-12, -hh];
    const tr = [12, -hh];
    const br = [12, hh];
    const bl = [-12, hh];
    const k = x.lite ? 2 : 3;
    along(tl, tr, k); along(tr, br, k + 1); along(br, bl, k); along(bl, tl, k + 1);
    const pct = (p) => `${(((p[0] + 12) / W) * 100).toFixed(2)}% ${(((p[1] + hh) / H) * 100).toFixed(2)}%`;
    const shards = [];
    for (let i = 0; i < per.length; i++) {
      const a = per[i];
      const b = per[(i + 1) % per.length];
      const sh = x.clonePack(`polygon(${pct(s.P)},${pct(a)},${pct(b)})`, 12);
      const cx = (Px + a[0] + b[0]) / 3;
      const cy = (Py + a[1] + b[1]) / 3;
      shards.push([sh, cx - Px, cy - Py]);
    }
    x.hidePack();
    shards.forEach(([sh, dx, dy]) => {
      const len = Math.hypot(dx, dy) || 1;
      const d = rand(22, 40);
      const ex = (dx / len) * d;
      const ey = (dy / len) * d + rand(4, 12);
      const spin = rand(-140, 140);
      sh.style.transformOrigin = `${(((Px + dx + 12) / W) * 100).toFixed(1)}% ${(((Py + dy + hh) / H) * 100).toFixed(1)}%`;
      A(sh, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${px(ex * 0.25)},${px(ey * 0.2 - 2)}) rotate(${spin * 0.2}deg) scale(.98)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${px(ex)},${px(ey)}) rotate(${spin}deg) scale(.7)`, opacity: 0 }
      ], { duration: rand(800, 1150), easing: 'cubic-bezier(.12,.7,.3,1)' }).then(() => sh.remove());
    });
    x.sparks(Px, Py, x.lite ? 8 : 16, { shape: 'star', colors: ['#fff', x.hot], dist: [8, 26], size: [0.5, 1] });
    x.shock(Px, Py, { to: 6 });
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + i); });
    await x.erupt({ from: { x: Px, y: Py }, lift: 6, spread: 6, duration: 760, stagger: 50, s0: 0.3, easing: EASE.soft });
  }
};

FX.burstfan = {
  async charge(x) {
    const { A } = x;
    const glow = x.glow({ size: 44, z: 3 });
    const rays = x.rays({ size: 80, z: 2 });
    const spin = x.loop(rays, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 9000 });
    x.sfx('swell', { dur: 0.9, level: 0.5 });
    x.inward(x.lite ? 8 : 16, { radius: [18, 30], life: [600, 900] });
    A(glow, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 0.75, transform: 'scale(1)' }], { duration: 900, easing: EASE.soft });
    A(rays, [{ opacity: 0 }, { opacity: 0.22 }], { duration: 900 });
    await A(x.body, [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }], { duration: 900, easing: EASE.inOut });
    Object.assign(x.s, { glow, rays, spin });
  },
  async hold(x) {
    const { A, s, k } = x;
    x.sfx('pulse', { level: k });
    x.inward(x.lite ? 3 : 6, { radius: [16, 24], life: [420, 560] });
    const ring = x.add(`${x.box(0, 0, 20, 20)};border-radius:50%;border:${x.px(0.5)} solid ${x.hot};opacity:0;z-index:12`);
    A(ring, [{ transform: 'scale(3)', opacity: 0 }, { transform: 'scale(1.6)', opacity: 0.6 + 0.4 * k, offset: 0.6 }, { transform: 'scale(1)', opacity: 0 }], { duration: 520, easing: EASE.in }).then(() => ring.remove());
    A(x.body, [{ transform: 'scale(1.05)' }, { transform: `scale(${1.08 + 0.03 * k})`, offset: 0.82 }, { transform: 'scale(1.05)' }], { duration: 560, easing: EASE.inOut });
    A(s.glow, [{ opacity: 0.75 }, { opacity: 1, transform: `scale(${1.1 + 0.2 * k})`, offset: 0.82 }, { opacity: 0.8, transform: 'scale(1)' }], { duration: 560 });
    if (s.spin) s.spin.playbackRate = 1 + x.beat * 0.5;
    await x.wait(580);
  },
  async burst(x) {
    const { A, s, cards } = x;
    x.sfx('burst', { level: 0.9 });
    x.flash('#fff3cf', 560, 0.85);
    x.shock(0, 0, { to: 7, duration: 760 });
    x.shock(0, 0, { to: 5, duration: 640, delay: 90, width: 0.4 });
    A(s.rays, [{ opacity: 0.22, transform: 'scale(1)' }, { opacity: 0.6, transform: 'scale(1.3) rotate(20deg)', offset: 0.2 }, { opacity: 0, transform: 'scale(1.6) rotate(40deg)' }], { duration: 1100 });
    A(s.glow, [{ opacity: 1 }, { opacity: 0, transform: 'scale(2)' }], { duration: 800 });
    A(x.wrap, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 240, easing: EASE.out });
    x.sparks(0, 0, x.lite ? 8 : 18, { shape: 'streak', dist: [16, 32], life: [500, 800] });
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + i); });
    await Promise.all(cards.map((c, i) => {
      const end = x.slot(i);
      const f = x.fan(i);
      x.set(c, { x: 0, y: 2, s: 0.3, r: 0 }, 0);
      return x.move(c, { ...end, o: 1 }, { duration: 980, delay: i * 55, easing: EASE.soft, via: [{ x: f * 3, y: -2, s: 0.5, o: 1, offset: 0.1 }, { x: f * 16 + end.x * 0.3, y: Math.min(0, end.y) - 18 - (1 - Math.abs(f)) * 4, r: f * 18, s: 0.82, offset: 0.45, easing: EASE.out }] }).then(() => x.glint(c));
    }));
  }
};

FX.unfold = {
  async charge(x) {
    const { A, add, px, hh, wrap } = x;
    x.sfx('stretch', { level: 0.3 });
    const creases = [
      add(`left:0;top:${px(hh - 0.08)};width:${px(24)};height:${px(0.16)};background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);transform:scaleX(0);z-index:3`, wrap),
      add(`left:${px(11.92)};top:0;width:${px(0.16)};height:${px(hh * 2)};background:linear-gradient(0deg,transparent,rgba(255,255,255,.45),transparent);transform:scaleY(0);z-index:3`, wrap)
    ];
    A(creases[0], [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 520, easing: EASE.inOut });
    A(creases[1], [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 520, delay: 160, easing: EASE.inOut });
    await A(wrap, [{ transform: 'perspective(900px) rotateX(0deg)' }, { transform: 'perspective(900px) rotateX(12deg) translateY(-2%)' }], { duration: 720, easing: EASE.inOut });
    const inner = add(`${x.box(0, 0, 24, hh * 2)};border-radius:${px(0.6)};background:radial-gradient(ellipse 70% 50% at 50% 50%,${x.hot},color-mix(in srgb, ${x.accent2} 70%, #000) 70%);z-index:6;opacity:0`);
    const T = x.clonePack('inset(0 0 50% 0)', 12);
    const B = x.clonePack('inset(50% 0 0 0)', 12);
    for (const h of [T, B]) { h.style.transformOrigin = '50% 50%'; h.style.transform = 'perspective(900px) rotateX(12deg) translateY(-2%)'; }
    x.hidePack();
    const sliver = add(`left:${px(-12)};top:${px(-0.4)};width:${px(24)};height:${px(0.8)};background:linear-gradient(90deg,transparent,${x.hot},transparent);opacity:0;z-index:13`);
    Object.assign(x.s, { T, B, inner, sliver });
  },
  async hold(x) {
    const { A, s, k } = x;
    x.sfx('stretch', { level: 0.3 + 0.4 * k });
    const open = 8 + 14 * k;
    A(s.T, [{ transform: 'perspective(900px) rotateX(12deg) translateY(-2%)' }, { transform: `perspective(900px) rotateX(${12 - open}deg) translateY(-2%)`, offset: 0.45 }, { transform: 'perspective(900px) rotateX(12deg) translateY(-2%)' }], { duration: 640, easing: EASE.inOut });
    A(s.B, [{ transform: 'perspective(900px) rotateX(12deg) translateY(-2%)' }, { transform: `perspective(900px) rotateX(${12 + open}deg) translateY(-2%)`, offset: 0.45 }, { transform: 'perspective(900px) rotateX(12deg) translateY(-2%)' }], { duration: 640, easing: EASE.inOut });
    A(s.sliver, [{ opacity: 0 }, { opacity: 0.5 + 0.5 * k, offset: 0.45 }, { opacity: 0 }], { duration: 640 });
    await x.wait(660);
  },
  async burst(x) {
    const { A, s, cards } = x;
    x.sfx('whoosh', { level: 0.6 });
    x.sfx('chime', { level: 0.3 });
    A(s.inner, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 1200 });
    A(s.sliver, [{ opacity: 1, transform: 'scaleY(1)' }, { opacity: 0, transform: 'scaleY(6)' }], { duration: 700 });
    A(s.T, [{ transform: 'perspective(900px) rotateX(12deg) translateY(-2%)', opacity: 1 }, { transform: 'perspective(900px) rotateX(-120deg) translateY(-6%)', opacity: 1, offset: 0.6 }, { transform: 'perspective(900px) rotateX(-168deg) translateY(-8%)', opacity: 0 }], { duration: 1000, easing: EASE.inOut });
    A(s.B, [{ transform: 'perspective(900px) rotateX(12deg) translateY(-2%)', opacity: 1 }, { transform: 'perspective(900px) rotateX(130deg) translateY(4%)', opacity: 1, offset: 0.6 }, { transform: 'perspective(900px) rotateX(172deg) translateY(6%)', opacity: 0 }], { duration: 1000, easing: EASE.inOut });
    x.sparks(0, 0, x.lite ? 6 : 12, { dist: [6, 20], size: [0.4, 0.9], angle: [-180, 0] });
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + n2(x, i)); x.set(c, { x: 0, y: 0, s: 0.55, r: (i - x.mid) * 2 }, 0); });
    await x.wait(260);
    await x.land({ stagger: 80, duration: 680, order: (i) => Math.abs(i - x.mid) * 1.2, easing: EASE.snap });
  }
};

function n2(x, i) { return x.n - Math.round(Math.abs(i - x.mid)); }

FX.vortex = {
  async charge(x) {
    const { A, add } = x;
    const swirl = add(`${x.box(0, 0, 54, 54)};border-radius:50%;background:conic-gradient(from 0deg,transparent,${x.hot} 12%,transparent 25%,color-mix(in srgb, ${x.accent} 60%, #7c3aed) 37%,transparent 50%,${x.hot} 62%,transparent 75%,color-mix(in srgb, ${x.accent} 60%, #7c3aed) 87%,transparent);-webkit-mask:radial-gradient(closest-side,transparent 14%,#000 34%,rgba(0,0,0,.4) 60%,transparent);mask:radial-gradient(closest-side,transparent 14%,#000 34%,rgba(0,0,0,.4) 60%,transparent);z-index:2;opacity:0`);
    const spin = x.loop(swirl, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-360deg)' }], { duration: 2600 });
    const core = x.glow({ size: 18, z: 3, color: '#fff' });
    x.sfx('swell', { dur: 0.9, level: 0.4 });
    A(swirl, [{ opacity: 0 }, { opacity: 0.85 }], { duration: 800 });
    A(core, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 800 });
    x.inward(x.lite ? 6 : 12, { radius: [20, 30], swirl: -2.2, life: [700, 1000] });
    await A(x.wrap, [{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(-10deg) scale(.95)' }], { duration: 800, easing: EASE.inOut });
    Object.assign(x.s, { swirl, spin, core, angle: -10 });
  },
  async hold(x) {
    const { A, s, k } = x;
    x.sfx('swell', { dur: 0.5, level: 0.3 + 0.4 * k });
    if (s.spin) s.spin.playbackRate = Math.min(3.2, 1 + x.beat * 0.45);
    x.inward(x.lite ? 3 : 6, { radius: [16, 26], swirl: -2.6, life: [480, 640] });
    const a = s.angle;
    const b = -10 - (12 + 12 * k) * (x.beat % 2 ? -1 : 1) * 0.5;
    s.angle = b;
    A(x.wrap, [{ transform: `rotate(${a}deg) scale(.95)` }, { transform: `rotate(${b}deg) scale(${0.94 - 0.04 * k})` }], { duration: 560, easing: EASE.inOut });
    A(s.core, [{ opacity: 0.5 }, { opacity: 0.7 + 0.3 * k, offset: 0.5 }, { opacity: 0.5 }], { duration: 560 });
    await x.wait(580);
  },
  async burst(x) {
    const { A, s, cards } = x;
    x.sfx('whoosh', { level: 0.8 });
    if (s.spin) s.spin.playbackRate = 4;
    await A(x.wrap, [{ transform: `rotate(${s.angle}deg) scale(.95)`, opacity: 1 }, { transform: 'rotate(-760deg) scale(0)', opacity: 0.4 }], { duration: 640, easing: EASE.in });
    x.hidePack();
    x.sfx('burst', { level: 0.6 });
    x.flash('#f5e8ff', 460, 0.7);
    x.shock(0, 0, { to: 6 });
    A(s.swirl, [{ opacity: 0.85, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 900 });
    A(s.core, [{ opacity: 0.8 }, { opacity: 0, transform: 'scale(2)' }], { duration: 700 });
    x.sparks(0, 0, x.lite ? 6 : 12, { dist: [10, 24], angle: [0, 360] });
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + i); });
    await Promise.all(cards.map((c, i) => {
      const end = x.slot(i);
      x.set(c, { x: 0, y: 0, s: 0.1, r: -200 }, 1);
      const via = [];
      const base = (i / Math.max(1, x.n)) * 360;
      for (let k2 = 1; k2 <= 3; k2++) {
        const a = (base - k2 * 80) * Math.PI / 180;
        const rr = k2 * 5;
        via.push({ x: end.x * (k2 / 4) + Math.cos(a) * rr, y: end.y * (k2 / 4) + Math.sin(a) * rr * 0.8, r: -200 + k2 * 60, s: 0.2 + k2 * 0.22, offset: k2 / 4.4 });
      }
      return x.move(c, { ...end, s: 1, o: 1 }, { duration: 1050, delay: i * 70, easing: 'cubic-bezier(.25,.4,.3,1)', via }).then(() => x.glint(c));
    }));
  }
};

FX.deal = {
  async charge(x) {
    const { A, cards } = x;
    x.sfx('whoosh', { level: 0.3 });
    await A(x.wrap, [{ transform: 'perspective(900px) rotateY(0) scale(1)' }, { transform: 'perspective(900px) rotateY(90deg) scale(.92)' }], { duration: 300, easing: EASE.in });
    x.hidePack();
    cards.forEach((c, i) => { c.el.style.zIndex = String(10 + i); x.set(c, { x: -i * 0.14, y: -i * 0.14, s: 0.92, ry: -90 }, 1); });
    await Promise.all(cards.map((c) => x.move(c, { ry: 0 }, { duration: 300, easing: EASE.out })));
    x.sfx('tick', { level: 0.5 });
    await x.wait(120);
  },
  async hold(x) {
    const { cards, k } = x;
    const spread = 6 + 3 * k;
    await Promise.all(cards.map((c, i) => x.move(c, { x: (i % 2 ? spread : -spread) - i * 0.05, y: -i * 0.14 - 1, r: i % 2 ? 7 : -7 }, { duration: 220, easing: EASE.out })));
    for (let i = 0; i < x.n; i++) setTimeout(() => x.sfx('tick', { level: 0.2 + 0.2 * k }), i * 34);
    await Promise.all(cards.map((c, i) => x.move(c, { x: -i * 0.14, y: -i * 0.14, r: 0 }, { duration: 260, delay: (i % 2 ? 0 : 20) + i * 22, easing: EASE.inOut })));
    await x.wait(120);
  },
  async burst(x) {
    const { cards } = x;
    const order = cards.map((_, i) => i).reverse();
    const all = [];
    for (const i of order) {
      const c = cards[i];
      const end = x.slot(i);
      c.el.style.zIndex = String(30 + (x.n - i));
      x.sfx('whoosh', { level: 0.35 });
      all.push(x.move(c, { ...end, o: 1 }, { duration: 460, easing: EASE.out, via: [{ x: end.x * 0.55, y: end.y * 0.55 - 2, r: end.r + (end.x >= 0 ? 200 : -200), s: 0.96, offset: 0.5 }] }).then(() => x.glint(c)));
      await x.wait(130);
    }
    await Promise.all(all);
  }
};

FX.pour = {
  async charge(x) {
    const { A, px } = x;
    x.sfx('whoosh', { level: 0.3 });
    await A(x.wrap, [{ transform: 'translate(0,0) rotate(0) scale(1)' }, { transform: `translate(${px(-1)},${px(1)}) rotate(6deg) scale(1)`, offset: 0.25 }, { transform: `translate(${px(5)},${px(-9)}) rotate(-58deg) scale(.78)` }], { duration: 800, easing: EASE.inOut });
    x.s.base = `translate(${px(5)},${px(-9)}) rotate(-58deg) scale(.78)`;
  },
  mouth(x, deg, tx, ty, s) {
    const a = deg * Math.PI / 180;
    return { x: tx + x.hh * s * Math.sin(a), y: ty - x.hh * s * Math.cos(a) };
  },
  async hold(x) {
    const { A, s, k, px } = x;
    const tip = -58 - 10 - 8 * k;
    A(x.wrap, [{ transform: s.base }, { transform: `translate(${px(5)},${px(-9)}) rotate(${tip}deg) scale(.78)`, offset: 0.4 }, { transform: s.base }], { duration: 560, easing: EASE.inOut });
    const m = FX.pour.mouth(x, tip, 5, -9, 0.78);
    setTimeout(() => x.sparks(m.x, m.y, 3, { shape: 'star', dist: [1, 3], gravity: 20, life: [700, 900], size: [0.5, 0.8], angle: [150, 210] }), 200);
    x.sfx('tick', { level: 0.3 + 0.3 * k });
    await x.wait(580);
  },
  async burst(x) {
    const { A, cards, px } = x;
    const deg = -122;
    const tx = 6;
    const ty = -11;
    x.sfx('whoosh', { level: 0.6 });
    await A(x.wrap, [{ transform: x.s.base }, { transform: `translate(${px(tx)},${px(ty)}) rotate(${deg}deg) scale(.7)` }], { duration: 340, easing: EASE.in });
    const m = FX.pour.mouth(x, deg, tx, ty, 0.7);
    const all = [];
    for (let i = 0; i < x.n; i++) {
      const c = cards[i];
      const end = x.slot(i);
      c.el.style.zIndex = '9';
      setTimeout(() => { c.el.style.zIndex = String(20 + i); }, 220);
      x.set(c, { x: m.x, y: m.y, r: -100, s: 0.5 }, 1);
      all.push(x.move(c, { ...end, o: 1 }, { duration: 900, easing: 'linear', via: [
        { x: m.x - 3, y: m.y + 3, r: -60, s: 0.75, offset: 0.18, easing: EASE.out },
        { x: end.x, y: end.y + 1.8, r: end.r + rand(-5, 5), s: 1, offset: 0.7, easing: EASE.drop },
        { x: end.x, y: end.y - 0.9, r: end.r, offset: 0.85, easing: EASE.out }
      ] }).then(() => { x.sfx('tick', { level: 0.4 }); x.glint(c); }));
      if (i % 2 === 0) x.sfx('whoosh', { level: 0.25 });
      await x.wait(150);
    }
    A(x.wrap, [{ opacity: 1, transform: `translate(${px(tx)},${px(ty)}) rotate(${deg}deg) scale(.7)` }, { opacity: 0, transform: `translate(${px(tx + 6)},${px(ty - 6)}) rotate(${deg - 20}deg) scale(.6)` }], { duration: 500, easing: EASE.in });
    await Promise.all(all);
  }
};

FX.riseglint = {
  async charge(x) {
    const { A, add, px, hh, cards } = x;
    const column = add(`left:${px(-8)};top:${px(hh - 80)};width:${px(16)};height:${px(80)};background:linear-gradient(0deg,transparent,color-mix(in srgb, ${x.hot} 70%, transparent) 30%,color-mix(in srgb, ${x.hot} 25%, transparent) 75%,transparent);-webkit-mask:linear-gradient(90deg,transparent,#000 35% 65%,transparent);mask:linear-gradient(90deg,transparent,#000 35% 65%,transparent);transform-origin:50% 100%;transform:scaleY(0);z-index:3`);
    x.sfx('swell', { dur: 0.8, level: 0.4 });
    A(column, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1 }], { duration: 760, easing: EASE.out });
    for (let i = 0; i < (x.lite ? 3 : 6); i++) FX.riseglint.mote(x, i * 120);
    cards.forEach((c, i) => { c.el.style.zIndex = String(5 + i); x.set(c, { x: (i - x.mid) * 0.5, y: -hh + c.h * 0.4 + 2, s: 0.8 }, 1); });
    x.s.column = column;
    await x.wait(700);
  },
  mote(x, delay) {
    const { A, add, px, hh } = x;
    const mx = rand(-5, 5);
    const e = add(`width:${px(1.1)};height:${px(1.1)};margin:${px(-0.55)} 0 0 ${px(-0.55)};border-radius:50%;background:radial-gradient(closest-side,#fff,${x.hot} 50%,transparent);z-index:4;opacity:0`);
    A(e, [{ transform: `translate(${px(mx)},${px(hh * 0.4)})`, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: `translate(${px(mx + rand(-2, 2))},${px(-hh - 20)})`, opacity: 0 }], { duration: rand(1200, 1700), delay, easing: 'linear' }).then(() => e.remove());
  },
  async hold(x) {
    const { cards, hh, k } = x;
    x.sfx('shimmer', { level: 0.2 + 0.3 * k });
    FX.riseglint.mote(x, 0);
    FX.riseglint.mote(x, 200);
    await Promise.all(cards.map((c, i) => {
      const up = -hh + c.h * 0.4 - 1.5 - k * 1.5 - (x.n - i) * 0.25;
      const rest = -hh + c.h * 0.4 + 1;
      return x.move(c, { y: rest }, { duration: 620, delay: i * 30, easing: EASE.inOut, via: [{ y: up, offset: 0.45 }] });
    }));
  },
  async burst(x) {
    const { A, cards, hh, s, px } = x;
    x.sfx('whoosh', { level: 0.6 });
    await Promise.all(cards.map((c, i) => x.move(c, { y: -hh - c.h * 0.42 - 2 - i * 0.6, x: (i - x.mid) * 0.7, s: 0.9 }, { duration: 520, delay: i * 40, easing: EASE.out })));
    A(x.wrap, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: `translateY(${px(26)})` }], { duration: 500, easing: EASE.in });
    A(s.column, [{ opacity: 1 }, { opacity: 0 }], { duration: 900 });
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + (x.n - i)); });
    const all = [];
    for (let i = 0; i < x.n; i++) {
      const c = cards[i];
      all.push(x.move(c, { ...x.slot(i), o: 1 }, { duration: 420, easing: EASE.snap }).then(() => { x.glint(c, { duration: 520 }); x.sfx('shimmer', { level: 0.2 }); }));
      await x.wait(130);
    }
    await Promise.all(all);
  }
};

FX.reels = {
  beats: 2,
  async charge(x) {
    const { A, add, px, cards } = x;
    x.sfx('tick', { level: 0.6 });
    A(x.wrap, [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(-4%) scale(1.06)', offset: 0.3 }, { transform: 'translateY(10%) scale(0)', opacity: 0 }], { duration: 460, easing: EASE.in });
    await x.wait(260);
    x.sfx('tick', { level: 0.8 });
    const windows = cards.map((c, i) => {
      const sl = x.slot(i);
      const w = c.w;
      const h = c.h;
      const win = add(`${x.box(sl.x, sl.y, w, h)};border-radius:${px(w * 0.07)};overflow:hidden;background:#07080f;box-shadow:inset 0 0 0 ${px(w * 0.035)} #c99a3a,inset 0 0 0 ${px(w * 0.06)} #2a1d08,inset 0 ${px(h * 0.22)} ${px(h * 0.16)} -${px(h * 0.06)} rgba(0,0,0,.85),inset 0 -${px(h * 0.22)} ${px(h * 0.16)} -${px(h * 0.06)} rgba(0,0,0,.85);z-index:${6 + (x.n - i)};opacity:0`);
      const b = h / 3;
      const strip = document.createElement('div');
      strip.style.cssText = `position:absolute;left:8%;right:8%;top:0;height:${px(b * 10)};background:repeating-linear-gradient(180deg,#9aa3b5 0 ${px(b * 0.8)},transparent ${px(b * 0.8)} ${px(b)},#34d399 ${px(b)} ${px(b * 1.8)},transparent ${px(b * 1.8)} ${px(b * 2)},#3b82f6 ${px(b * 2)} ${px(b * 2.8)},transparent ${px(b * 2.8)} ${px(b * 3)},#a855f7 ${px(b * 3)} ${px(b * 3.8)},transparent ${px(b * 3.8)} ${px(b * 4)},#f0b43c ${px(b * 4)} ${px(b * 4.8)},transparent ${px(b * 4.8)} ${px(b * 5)});opacity:.8;border-radius:${px(w * 0.04)}`;
      win.appendChild(strip);
      const spin = x.loop(strip, [{ transform: 'translateY(0)' }, { transform: `translateY(${px(-b * 5)})` }], { duration: 200 });
      A(win, [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 320, delay: i * 50, easing: EASE.back });
      return { win, strip, spin, b };
    });
    const xs = cards.map((c, i) => x.slot(i).x);
    const ys = cards.map((c, i) => x.slot(i).y);
    const left = Math.min(...xs) - cards[0].w / 2 - 2;
    const right = Math.max(...xs) + cards[0].w / 2 + 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = cards[0].h / 2 + 2;
    const lights = [];
    const count = x.lite ? 8 : 14;
    for (let i = 0; i < count; i++) {
      const lx = left + ((right - left) * i) / (count - 1);
      for (const ly of [cy - half, cy + half]) {
        const d = add(`${x.box(lx, ly, 1, 1)};border-radius:50%;background:radial-gradient(closest-side,#fff,#ffcf5a 50%,transparent);z-index:5;opacity:.25`);
        lights.push(d);
        x.loop(d, [{ opacity: 0.2 }, { opacity: 1, offset: 0.15 }, { opacity: 0.2, offset: 0.4 }, { opacity: 0.2 }], { duration: 900, delay: -((i * 900) / count) });
      }
    }
    Object.assign(x.s, { windows, lights });
    await x.wait(300);
  },
  async hold(x) {
    const { s, k } = x;
    for (const w of s.windows) if (w.spin) w.spin.playbackRate = 1 + 0.3 * k;
    for (let i = 0; i < 5; i++) setTimeout(() => x.sfx('tick', { level: 0.2 + 0.2 * k }), i * 100);
    await x.wait(520);
  },
  async burst(x) {
    const { A, s, cards, px } = x;
    for (let i = 0; i < x.n; i++) {
      const w = s.windows[i];
      const c = cards[i];
      w.spin?.cancel();
      x.sfx('tick', { level: 1 });
      A(w.strip, [{ transform: `translateY(${px(-w.b * 2.6)})` }, { transform: `translateY(${px(-w.b * 4)})` }], { duration: 300, easing: EASE.back });
      x.set(c, { ...x.slot(i), s: 0.92 }, 0);
      c.el.style.zIndex = String(20 + (x.n - i));
      A(w.win, [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, transform: 'scale(1.06)' }], { duration: 420 }).then(() => w.win.remove());
      x.move(c, { s: 1, o: 1 }, { duration: 420, delay: 140, easing: EASE.back, via: [{ y: x.slot(i).y - 1.4, s: 1.02, offset: 0.5 }] }).then(() => x.glint(c));
      await x.wait(i === x.n - 2 ? 420 : 230);
    }
    x.sfx('chime', { level: 0.6 });
    for (const d of s.lights) A(d, [{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0 }], { duration: 700 });
    const last = x.slot(x.n - 1);
    x.sparks(last.x, last.y, x.lite ? 6 : 12, { shape: 'star', colors: ['#fff', '#ffd76a'], dist: [6, 18] });
    await x.wait(600);
  }
};

FX.portal = {
  async charge(x) {
    const { A, add, px, hh } = x;
    const make = (y, a, b, z) => {
      const g = add(`${x.box(0, y, 40, 11)};border-radius:50%;z-index:${z};opacity:0;transform:scaleX(0)`);
      g.innerHTML = `<i style="position:absolute;inset:-60% -10%;border-radius:50%;background:radial-gradient(closest-side,${b},transparent)"></i>
        <i style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(closest-side,#04050b 55%,${b} 80%,${a} 92%,transparent);box-shadow:0 0 ${px(1.5)} ${b}"></i>
        <i style="position:absolute;inset:12% 18%;border-radius:50%;background:conic-gradient(from 0deg,transparent,${a} 20%,transparent 40%,${b} 60%,transparent 80%);opacity:.5"></i>`;
      const swirl = g.lastElementChild;
      const spin = x.loop(swirl, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 1600 });
      return { g, spin };
    };
    const low = hh + 3;
    const blue = make(low, '#e0fbff', '#22d3ee', 4);
    x.sfx('hum', { dur: 1, level: 0.4 });
    await A(blue.g, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 560, easing: EASE.out });
    A(x.wrap, [{ transform: 'translateY(0)' }, { transform: `translateY(${px(-3)})` }], { duration: 500, easing: EASE.inOut });
    Object.assign(x.s, { blue, make, low, y: -3 });
    await x.wait(300);
  },
  async hold(x) {
    const { A, s, k, px } = x;
    x.sfx('hum', { dur: 0.55, level: 0.3 + 0.3 * k });
    if (s.blue.spin) s.blue.spin.playbackRate = 1 + x.beat * 0.4;
    const dip = 1 + 2 * k;
    A(x.wrap, [{ transform: `translateY(${px(s.y)})` }, { transform: `translateY(${px(s.y + dip)})`, offset: 0.5 }, { transform: `translateY(${px(s.y)})` }], { duration: 600, easing: EASE.inOut });
    x.inward(x.lite ? 2 : 4, { cx: 0, cy: s.low, radius: [10, 18], color: '#67e8f9', life: [400, 560], z: 5 });
    await x.wait(620);
  },
  async burst(x) {
    const { A, s, px, hh, cards } = x;
    x.wrap.style.zIndex = '3';
    x.sfx('whoosh', { level: 0.7 });
    const fall = (hh * 2 + 6);
    await A(x.wrap, [{ transform: `translateY(${px(s.y)})`, clipPath: 'inset(-20% -20% -20% -20%)' }, { transform: `translateY(${px(s.y - 3)})`, clipPath: 'inset(-20% -20% -20% -20%)', offset: 0.22 }, { transform: `translateY(${px(fall)})`, clipPath: `inset(-20% -20% 100% -20%)` }], { duration: 640, easing: EASE.in });
    x.hidePack();
    x.sfx('burst', { level: 0.4 });
    x.sparks(0, s.low, x.lite ? 4 : 8, { color: '#67e8f9', dist: [4, 14], angle: [180, 360] });
    A(s.blue.g, [{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(.1)', opacity: 0 }], { duration: 420, easing: EASE.in });
    const high = x.top - 3;
    const orange = s.make(high, '#fff1d6', '#fb923c', 30);
    await A(orange.g, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 440, easing: EASE.out });
    x.sfx('hum', { dur: 0.6, level: 0.5 });
    const all = [];
    for (let i = 0; i < x.n; i++) {
      const c = cards[i];
      const end = x.slot(i);
      c.el.style.zIndex = String(20 + (x.n - i));
      x.set(c, { x: 0, y: high, s: 0.2, r: rand(-20, 20) }, 0);
      all.push(x.move(c, { ...end, o: 1 }, { duration: 760, easing: EASE.snap, via: [{ x: end.x * 0.2, y: high + 4, s: 0.6, o: 1, r: rand(-10, 10), offset: 0.24 }] }).then(() => x.glint(c)));
      x.sfx('whoosh', { level: 0.25 });
      await x.wait(140);
    }
    await Promise.all(all);
    x.sfx('hum', { dur: 0.3, level: 0.2 });
    await A(orange.g, [{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(.1)', opacity: 0 }], { duration: 380, easing: EASE.in });
  }
};

FX.peel = {
  vis(q) {
    if (q <= 1) { const v = (1 - q) * 100; return `polygon(0 0,100% 0,100% ${v}%,${v}% 100%,0 100%)`; }
    const v = (2 - q) * 100;
    return `polygon(0 0,${v}% 0,${v}% 0,0 ${v}%,0 ${v}%)`;
  },
  flap(q) {
    const v = (1 - Math.min(q, 1)) * 100;
    return `polygon(100% ${v}%,${v}% 100%,${v}% ${v}%)`;
  },
  async charge(x) {
    const { A, add, px, cards, hh, wrap } = x;
    const inner = add(`${x.box(0, 0, 24, hh * 2)};border-radius:${px(0.6)};background:radial-gradient(ellipse 80% 60% at 60% 60%,color-mix(in srgb, ${x.accent} 40%, #111),#06070c 80%);z-index:4`);
    cards.forEach((c, i) => x.set(c, { x: -i * 0.18, y: -i * 0.18, s: Math.min(0.95, 22 / c.w) }, 1));
    const shade = add(`${x.box(0.8, 0.8, 24, hh * 2)};background:rgba(0,0,0,.42);clip-path:${FX.peel.flap(0)};z-index:11`);
    const flap = add(`${x.box(0, 0, 24, hh * 2)};background:linear-gradient(to bottom right,#7d776c,#d9d3c7 55%,#fbf8f1 92%,#fff);clip-path:${FX.peel.flap(0)};z-index:12`);
    wrap.style.clipPath = FX.peel.vis(0);
    x.sfx('stretch', { level: 0.3 });
    const to = 0.14;
    A(wrap, [{ clipPath: FX.peel.vis(0) }, { clipPath: FX.peel.vis(to) }], { duration: 620, easing: EASE.out });
    A(flap, [{ clipPath: FX.peel.flap(0) }, { clipPath: FX.peel.flap(to) }], { duration: 620, easing: EASE.out });
    A(shade, [{ clipPath: FX.peel.flap(0) }, { clipPath: FX.peel.flap(to) }], { duration: 620, easing: EASE.out });
    await x.wait(640);
    x.sweep(flap, { duration: 600, width: 30 });
    Object.assign(x.s, { inner, flap, shade, q: to });
  },
  async hold(x) {
    const { A, s, k } = x;
    const peak = 0.22 + 0.1 * k;
    const rest = 0.15 + 0.03 * k;
    x.sfx('stretch', { level: 0.3 + 0.4 * k });
    const kf = (f) => [{ clipPath: f(s.q) }, { clipPath: f(peak), offset: 0.45 }, { clipPath: f(rest) }];
    A(x.wrap, kf(FX.peel.vis), { duration: 640, easing: EASE.inOut });
    A(s.flap, kf(FX.peel.flap), { duration: 640, easing: EASE.inOut });
    A(s.shade, kf(FX.peel.flap), { duration: 640, easing: EASE.inOut });
    s.q = rest;
    await x.wait(660);
  },
  async burst(x) {
    const { A, s, px } = x;
    x.sfx('whoosh', { level: 0.7 });
    const end = 1;
    const run = 620;
    A(x.wrap, [{ clipPath: FX.peel.vis(s.q) }, { clipPath: FX.peel.vis(end) }], { duration: run, easing: EASE.inOut });
    A(s.flap, [{ clipPath: FX.peel.flap(s.q) }, { clipPath: FX.peel.flap(end) }], { duration: run, easing: EASE.inOut });
    A(s.shade, [{ clipPath: FX.peel.flap(s.q) }, { clipPath: FX.peel.flap(end) }], { duration: run, easing: EASE.inOut });
    await x.wait(run);
    const off = [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${px(-22)},${px(-12)}) rotate(-26deg)`, opacity: 0 }];
    for (const e of [x.wrap, s.flap, s.shade]) A(e, off, { duration: 520, easing: EASE.in });
    A(s.inner, [{ opacity: 1 }, { opacity: 0 }], { duration: 600 });
    x.sfx('shimmer', { level: 0.5 });
    x.cards.forEach((c, i) => { c.el.style.zIndex = String(20 + (x.n - i)); });
    await x.land({ stagger: 70, duration: 640, delay: 120 });
  }
};

FX.pop = {
  async charge(x) {
    const { A, add } = x;
    const shine = add(`left:14%;top:8%;width:38%;height:22%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.75),transparent);z-index:30;opacity:0`, x.body);
    x.sfx('stretch', { level: 0.2 });
    setTimeout(() => x.sfx('stretch', { level: 0.4 }), 300);
    A(shine, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 700 });
    await A(x.body, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.06,.94)', offset: 0.3 }, { transform: 'scale(.97,1.05)', offset: 0.6 }, { transform: 'scale(1.08,1.06)' }], { duration: 700, easing: EASE.inOut });
    Object.assign(x.s, { shine });
  },
  async hold(x) {
    const { A, s, k } = x;
    const a = 1.08 + 0.05 * k;
    x.sfx('stretch', { level: 0.4 + 0.5 * k });
    A(s.shine, [{ opacity: 0.5 }, { opacity: 0.6 + 0.3 * k, offset: 0.5 }, { opacity: 0.5 }], { duration: 560 });
    await A(x.body, [
      { transform: 'scale(1.08,1.06)' }, { transform: `scale(${a + 0.04},${a - 0.06}) rotate(-1.5deg)`, offset: 0.25 },
      { transform: `scale(${a - 0.05},${a + 0.05}) rotate(1.5deg)`, offset: 0.55 }, { transform: `scale(${a + 0.02},${a}) rotate(-.5deg)`, offset: 0.8 }, { transform: 'scale(1.08,1.06)' }
    ], { duration: 560, easing: EASE.inOut });
  },
  async burst(x) {
    const { A, cards } = x;
    await A(x.body, [{ transform: 'scale(1.08,1.06)' }, { transform: 'scale(1.26,1.24)' }], { duration: 130, easing: EASE.in });
    x.hidePack();
    x.sfx('pop', { level: 1 });
    x.flash('#fff', 360, 0.75);
    x.shock(0, 0, { to: 6, duration: 520, width: 0.9 });
    const colors = [x.accent, '#f0b43c', '#a855f7', '#3b82f6', '#34d399', '#ff4fa3', '#fff'];
    x.sparks(0, 0, x.lite ? 12 : 30, { shape: 'square', colors, dist: [16, 34], gravity: 26, life: [1100, 1600], size: [0.6, 1.1], angle: [-170, -10] });
    x.sparks(0, 0, x.lite ? 4 : 8, { shape: 'square', colors, dist: [10, 22], gravity: 22, life: [900, 1300], size: [0.5, 0.9], angle: [10, 170] });
    const all = [];
    for (let i = 0; i < x.n; i++) {
      const c = cards[i];
      const end = x.slot(i);
      c.el.style.zIndex = String(20 + (x.n - i));
      x.set(c, { x: end.x * 0.3, y: Math.min(0, end.y) - 30, r: rand(-14, 14), s: 0.85 }, 1);
      all.push(x.move(c, { ...end, o: 1 }, { duration: 780, easing: 'linear', via: [
        { x: end.x, y: end.y + 2, r: end.r, s: 1, offset: 0.6, easing: EASE.drop },
        { x: end.x, y: end.y - 1.6, offset: 0.78, easing: EASE.out },
        { x: end.x, y: end.y + 0.4, offset: 0.92 }
      ] }).then(() => { x.sfx('tick', { level: 0.3 }); x.glint(c); }));
      await x.wait(95);
    }
    await Promise.all(all);
  }
};

FX.beam = {
  async charge(x) {
    const { A, add, px, hh, center } = x;
    const beam = add(`left:${center.x - 14 * x.u}px;top:0;width:${28 * x.u}px;height:${center.y + (hh + 3) * x.u}px;background:linear-gradient(90deg,transparent,rgba(190,240,255,.18) 22%,rgba(255,255,255,.55) 50%,rgba(190,240,255,.18) 78%,transparent);-webkit-mask:linear-gradient(180deg,transparent,#000 30%);mask:linear-gradient(180deg,transparent,#000 30%);transform-origin:50% 0;transform:scaleY(0);z-index:2`, x.root);
    const spot = x.glow({ y: hh + 3, size: 30, sx: 1, color: 'rgba(200,245,255,.9)', z: 3 });
    spot.style.transform = 'scaleY(.25)';
    x.sfx('hum', { dur: 1.2, level: 0.4 });
    A(beam, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1 }], { duration: 640, easing: EASE.out });
    A(spot, [{ opacity: 0, transform: 'scale(.4,.1)' }, { opacity: 0.8, transform: 'scale(1,.25)' }], { duration: 700 });
    for (let i = 0; i < (x.lite ? 3 : 7); i++) FX.beam.mote(x, i * 110);
    await A(x.wrap, [{ transform: 'translateY(0)' }, { transform: `translateY(${px(-2.5)})` }], { duration: 700, easing: EASE.inOut });
    Object.assign(x.s, { beam, spot, y: -2.5 });
  },
  mote(x, delay) {
    const { A, add, px, hh } = x;
    const mx = rand(-9, 9);
    const e = add(`width:${px(0.9)};height:${px(0.9)};margin:${px(-0.45)} 0 0 ${px(-0.45)};border-radius:50%;background:radial-gradient(closest-side,#fff,#bff3ff 50%,transparent);z-index:12;opacity:0`);
    A(e, [{ transform: `translate(${px(mx)},${px(hh + 2)})`, opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: `translate(${px(mx * 0.7)},${px(-hh - 10)})`, opacity: 0 }], { duration: rand(1300, 1900), delay, easing: 'linear' }).then(() => e.remove());
  },
  async hold(x) {
    const { A, s, k, px } = x;
    x.sfx('hum', { dur: 0.6, level: 0.3 + 0.3 * k });
    FX.beam.mote(x, 0);
    FX.beam.mote(x, 250);
    const up = s.y - 1.2 - 1.2 * k;
    A(x.wrap, [{ transform: `translateY(${px(s.y)}) rotate(0deg)` }, { transform: `translateY(${px(up)}) rotate(${x.beat % 2 ? 2.5 : -2.5}deg)`, offset: 0.5 }, { transform: `translateY(${px(s.y)}) rotate(0deg)` }], { duration: 640, easing: EASE.inOut });
    A(s.spot, [{ opacity: 0.8 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0.8 }], { duration: 640 });
    await x.wait(660);
  },
  async burst(x) {
    const { A, s, px, cards } = x;
    x.sfx('whoosh', { level: 0.8 });
    A(s.beam, [{ opacity: 1 }, { opacity: 1.4, offset: 0.3 }, { opacity: 1 }], { duration: 500 });
    await A(x.wrap, [{ transform: `translateY(${px(s.y)}) scale(1,1)`, opacity: 1 }, { transform: `translateY(${px(s.y + 2)}) scale(1.04,.94)`, offset: 0.25 }, { transform: `translateY(${px(-70)}) scale(.6,1.6)`, opacity: 0 }], { duration: 520, easing: EASE.in });
    x.hidePack();
    const all = [];
    for (let i = 0; i < x.n; i++) {
      const c = cards[i];
      const end = x.slot(i);
      c.el.style.zIndex = String(20 + (x.n - i));
      x.set(c, { x: 0, y: -60, s: 0.7 }, 0);
      all.push(x.move(c, { ...end, o: 1 }, { duration: 820, easing: EASE.out, via: [{ x: 0, y: end.y - 5, s: 0.95, o: 1, offset: 0.55, easing: EASE.out }] }).then(() => { x.glint(c); x.sfx('shimmer', { level: 0.2 }); }));
      await x.wait(150);
    }
    await Promise.all(all);
    A(s.beam, [{ opacity: 1 }, { opacity: 0 }], { duration: 600 }).then(() => s.beam.remove());
    A(s.spot, [{ opacity: 0.8 }, { opacity: 0 }], { duration: 500 });
  }
};

FX.dissolve = {
  async charge(x) {
    const { A, add, px } = x;
    const rim = add(`inset:0;border-radius:${px(0.6)};box-shadow:inset 0 0 ${px(2)} ${px(0.6)} ${x.hot},0 0 ${px(2)} ${x.hot};opacity:0;z-index:30`, x.body);
    x.sfx('swell', { dur: 0.9, level: 0.35 });
    A(rim, [{ opacity: 0 }, { opacity: 0.85 }], { duration: 800 });
    FX.dissolve.flakes(x, x.lite ? 5 : 10);
    Object.assign(x.s, { rim });
    await x.wait(780);
  },
  flakes(x, count) {
    const { hh } = x;
    for (let i = 0; i < count; i++) {
      const side = Math.floor(rand(0, 4));
      const fx = side === 0 ? -12 : side === 1 ? 12 : rand(-12, 12);
      const fy = side === 2 ? -hh : side === 3 ? hh : rand(-hh, hh);
      x.sparks(fx, fy, 1, { shape: 'square', colors: [x.accent, x.hot, '#fff'], dist: [4, 12], angle: [-120, -40], gravity: -6, size: [0.4, 0.8], life: [800, 1200], delay: rand(0, 400) });
    }
  },
  async hold(x) {
    const { A, s, k } = x;
    x.sfx('shimmer', { level: 0.15 + 0.25 * k });
    FX.dissolve.flakes(x, x.lite ? 3 : 7);
    A(s.rim, [{ opacity: 0.85 }, { opacity: 1, offset: 0.4 }, { opacity: 0.85 }], { duration: 560 });
    A(x.body, [{ opacity: 1 }, { opacity: 0.92 - 0.1 * k, offset: 0.4 }, { opacity: 1 }], { duration: 560 });
    await x.wait(580);
  },
  async burst(x) {
    const { A, add, px, hh, cards, wrap } = x;
    const run = 900;
    x.sfx('shimmer', { level: 0.8 });
    x.sfx('whoosh', { level: 0.5 });
    for (const pre of ['-webkit-', '']) {
      wrap.style.setProperty(`${pre}mask-image`, 'linear-gradient(0deg,transparent 0 40%,#000 46%)');
      wrap.style.setProperty(`${pre}mask-size`, '100% 300%');
      wrap.style.setProperty(`${pre}mask-repeat`, 'no-repeat');
    }
    A(wrap, [{ webkitMaskPosition: '0 0%', maskPosition: '0 0%' }, { webkitMaskPosition: '0 100%', maskPosition: '0 100%' }], { duration: run, easing: 'linear' });
    const edge = add(`left:${px(-13)};top:${px(-0.8)};width:${px(26)};height:${px(1.6)};border-radius:50%;background:radial-gradient(closest-side,#fff,${x.hot} 45%,transparent);z-index:12`);
    A(edge, [{ transform: `translateY(${px(hh)})`, opacity: 0, offset: 0 }, { transform: `translateY(${px(hh)})`, opacity: 0, offset: 0.3 }, { transform: `translateY(${px(hh * 0.8)})`, opacity: 1, offset: 0.36 }, { transform: `translateY(${px(-hh * 0.8)})`, opacity: 1, offset: 0.8 }, { transform: `translateY(${px(-hh)})`, opacity: 0, offset: 0.86 }, { transform: `translateY(${px(-hh)})`, opacity: 0, offset: 1 }], { duration: run, easing: 'linear' }).then(() => edge.remove());
    const bursts = x.lite ? 4 : 7;
    for (let i = 0; i < bursts; i++) {
      const y = hh - (hh * 2 * (i + 0.5)) / bursts;
      setTimeout(() => x.sparks(rand(-9, 9), y, x.lite ? 2 : 4, { shape: 'square', colors: [x.accent, x.hot, '#fff'], dist: [5, 14], angle: [-150, -30], gravity: -8, size: [0.4, 0.9], life: [700, 1100] }), run * (0.32 + (0.5 * i) / bursts));
    }
    await x.wait(run * 0.75);
    for (let i = 0; i < x.n; i++) {
      const c = cards[i];
      const end = x.slot(i);
      c.el.style.zIndex = String(20 + (x.n - i));
      x.inward(x.lite ? 2 : 4, { cx: end.x, cy: end.y, radius: [6, 12], life: [380, 520], z: 40 });
      x.set(c, { ...end, s: 1.05 }, 0);
      const veil = document.createElement('span');
      veil.style.cssText = `position:absolute;inset:0;border-radius:inherit;background:radial-gradient(120% 90% at 50% 40%,#fff,color-mix(in srgb, ${x.hot} 70%, #fff) 55%,${x.hot});z-index:45;pointer-events:none`;
      c.el.appendChild(veil);
      A(veil, [{ opacity: 0.95 }, { opacity: 0.8, offset: 0.25 }, { opacity: 0 }], { duration: 480, easing: EASE.out }).then(() => veil.remove());
      x.move(c, { s: 1, o: 1 }, { duration: 560, easing: EASE.out });
      x.sfx('shimmer', { level: 0.2 });
      await x.wait(110);
    }
    x.hidePack();
    await x.wait(600);
  }
};

FX.thunder = {
  bolt(x, from, to, { width = 0.9, glow = 3, branches = 2, z = 40 } = {}) {
    const { u } = x;
    const minX = Math.min(from[0], to[0]) - 12;
    const maxX = Math.max(from[0], to[0]) + 12;
    const svg = x.svg(`left:${minX * u}px;top:${from[1] * u}px;width:${(maxX - minX) * u}px;height:${(to[1] - from[1]) * u}px;z-index:${z}`, `${minX} ${from[1]} ${maxX - minX} ${to[1] - from[1]}`);
    const steps = 9;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([from[0] + (to[0] - from[0]) * t + (i && i < steps ? rand(-3.5, 3.5) : 0), from[1] + (to[1] - from[1]) * t]);
    }
    const lines = [x.line(svg, pts, { stroke: '#8fc4ff', width: glow, opacity: 0.35 }), x.line(svg, pts, { stroke: '#fff', width })];
    for (let b = 0; b < branches; b++) {
      const at = Math.floor(rand(2, steps - 2));
      const bp = [pts[at]];
      let [bx, by] = pts[at];
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < 3; j++) { bx += dir * rand(2, 4); by += rand(2, 4); bp.push([bx, by]); }
      lines.push(x.line(svg, bp, { stroke: '#dbeafe', width: width * 0.5 }));
    }
    return svg;
  },
  async charge(x) {
    const dim = x.dim(0.84, 480);
    x.wrap.style.zIndex = '10';
    x.sfx('rumble', { dur: 1, level: 0.3 });
    await x.wait(460);
    await FX.thunder.flicker(x, dim, 0.4);
    Object.assign(x.s, { dim });
  },
  async flicker(x, dim, k) {
    const { A } = x;
    const peak = 0.55 - 0.2 * k;
    A(dim, [{ opacity: 1 }, { opacity: peak, offset: 0.12 }, { opacity: 0.95, offset: 0.24 }, { opacity: peak + 0.15, offset: 0.34 }, { opacity: 1 }], { duration: 520, easing: 'linear' });
    await x.wait(200);
  },
  async hold(x) {
    const { A, s, k } = x;
    x.sfx('rumble', { dur: 0.7, level: 0.25 + 0.4 * k });
    await FX.thunder.flicker(x, s.dim, k);
    const sky = -x.center.y / x.u;
    const bx = rand(-16, 16);
    const svg = FX.thunder.bolt(x, [bx, sky], [bx + rand(-6, 6), sky + rand(10, 16) + 6 * k], { width: 0.4, glow: 1.6, branches: 1, z: 2 });
    await A(svg, [{ opacity: 0 }, { opacity: 0.8, offset: 0.2 }, { opacity: 0.1, offset: 0.45 }, { opacity: 0.6, offset: 0.6 }, { opacity: 0 }], { duration: 300, easing: 'linear' });
    svg.remove();
    x.shake(x.origin, 0.15 + 0.3 * k, 240, 6);
    await x.wait(120);
  },
  async burst(x) {
    const { A, s, hh, px, cards } = x;
    const sky = -x.center.y / x.u - 2;
    const svg = FX.thunder.bolt(x, [rand(-3, 3), sky], [0, -hh * 0.2], { branches: 3 });
    x.sfx('crack', { level: 1 });
    x.sfx('rumble', { dur: 1.4, level: 1 });
    x.sfx('burst', { level: 0.6 });
    A(svg, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.2, offset: 0.3 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: 480, easing: 'linear' }).then(() => svg.remove());
    A(s.dim, [{ opacity: 1 }, { opacity: 0.2, offset: 0.12 }, { opacity: 0.9, offset: 0.3 }, { opacity: 0.4, offset: 0.45 }, { opacity: 1 }], { duration: 600, easing: 'linear' });
    await x.wait(150);
    x.flash('#dbeafe', 560, 0.95);
    x.shake(x.origin, 1.2, 460, 10);
    A(s.dim, [{ opacity: 1 }, { opacity: 0.4 }], { duration: 500, easing: EASE.soft });
    const crack = 'polygon(0 0,52% 0,46% 18%,56% 34%,44% 52%,55% 70%,47% 86%,52% 100%,0 100%)';
    const crackR = 'polygon(52% 0,100% 0,100% 100%,52% 100%,47% 86%,55% 70%,44% 52%,56% 34%,46% 18%)';
    const L = x.clonePack(crack, 12);
    const R = x.clonePack(crackR, 12);
    x.hidePack();
    x.sparks(0, -hh * 0.4, x.lite ? 6 : 12, { shape: 'streak', color: '#bfe3ff', dist: [10, 24] });
    x.sparks(0, hh * 0.3, x.lite ? 4 : 8, { color: '#fff', dist: [8, 18] });
    A(L, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${px(-28)},${px(8)}) rotate(-28deg)`, opacity: 0 }], { duration: 820, easing: EASE.out });
    A(R, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${px(28)},${px(8)}) rotate(28deg)`, opacity: 0 }], { duration: 820, easing: EASE.out });
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + (x.n - i)); });
    const landing = Promise.all(cards.map((c, i) => {
      const end = x.slot(i);
      x.set(c, { x: 0, y: 0, s: 0.3, r: rand(-20, 20) }, 1);
      return x.move(c, { ...end, s: 1 }, { duration: 640, delay: i * 45, easing: EASE.snap, via: [{ x: end.x * 1.1 + x.fan(i) * 5, y: end.y * 1.1 - 2, r: end.r + rand(-8, 8), s: 1.04, offset: 0.68 }] }).then(() => x.glint(c, { color: 'rgba(200,230,255,.8)' }));
    }));
    await landing;
    await s.dim.lift(420);
  }
};

FX.flap = {
  async charge(x) {
    const { A, add, px, hh } = x;
    const hinge = -hh + hh * 2 * 0.3;
    const glow = x.glow({ y: hinge, size: 14, z: 13, color: x.hot });
    const seal = add(`${x.box(0, hinge, 7, 7)};z-index:14;opacity:0`);
    seal.innerHTML = `<i style="position:absolute;inset:0;clip-path:var(--wax,circle(50%));border-radius:50%;background:radial-gradient(circle at 36% 30%,color-mix(in srgb, ${x.accent} 40%, #ff9a8a),color-mix(in srgb, ${x.accent} 30%, #b91c1c) 55%,color-mix(in srgb, ${x.accent} 20%, #5a0d0d));box-shadow:inset 0 ${px(-0.4)} ${px(0.8)} rgba(0,0,0,.45),inset 0 ${px(0.3)} ${px(0.5)} rgba(255,255,255,.35)"></i>
      <i style="position:absolute;inset:22%;border-radius:50%;box-shadow:inset 0 0 0 ${px(0.25)} rgba(0,0,0,.28),0 0 0 ${px(0.12)} rgba(255,255,255,.25)"></i>
      <i style="position:absolute;inset:36%;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);background:rgba(0,0,0,.28)"></i>`;
    seal.style.setProperty('--wax', 'polygon(50% 0,62% 4%,73% 2%,80% 12%,92% 16%,94% 28%,100% 40%,96% 52%,100% 64%,92% 74%,90% 86%,78% 90%,68% 99%,56% 95%,44% 100%,34% 93%,22% 94%,16% 82%,6% 76%,6% 63%,0 52%,5% 40%,2% 28%,12% 20%,16% 8%,28% 7%,38% 1%)');
    await A(seal, [{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: EASE.in });
    x.sfx('seal', { level: 0.8 });
    x.shake(x.origin, 0.35, 200, 4);
    A(seal, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.12,.9)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 300, easing: EASE.out });
    A(glow, [{ opacity: 0 }, { opacity: 0.6 }], { duration: 400 });
    Object.assign(x.s, { hinge, seal, glow });
    await x.wait(420);
  },
  async hold(x) {
    const { A, s, k } = x;
    x.sfx('pulse', { level: 0.2 + 0.4 * k });
    A(s.glow, [{ opacity: 0.5, transform: 'scale(1)' }, { opacity: 0.8 + 0.2 * k, transform: `scale(${1.1 + 0.2 * k})`, offset: 0.4 }, { opacity: 0.5, transform: 'scale(1)' }], { duration: 620 });
    A(s.seal, [{ transform: 'scale(1)' }, { transform: `scale(${1.05 + 0.04 * k}) rotate(${x.beat % 2 ? 3 : -3}deg)`, offset: 0.4 }, { transform: 'scale(1)' }], { duration: 620, easing: EASE.inOut });
    await x.wait(640);
  },
  async burst(x) {
    const { A, s, add, px, hh, cards, wrap } = x;
    x.sfx('crack', { level: 0.5 });
    for (const [clip, dir] of [['inset(0 50% 0 0)', -1], ['inset(0 0 0 50%)', 1]]) {
      const h = s.seal.cloneNode(true);
      h.style.clipPath = clip;
      x.origin.appendChild(h);
      A(h, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${px(dir * 6)},${px(-3)}) rotate(${dir * 25}deg)`, opacity: 1, offset: 0.3 }, { transform: `translate(${px(dir * 10)},${px(18)}) rotate(${dir * 80}deg)`, opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.2,.6,.5,1)' }).then(() => h.remove());
    }
    s.seal.remove();
    A(s.glow, [{ opacity: 0.8 }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 500 });
    x.sparks(0, s.hinge, x.lite ? 4 : 8, { dist: [3, 10], size: [0.4, 0.8] });
    const flap = x.clonePack('inset(0 0 70% 0)', 13);
    flap.style.transformOrigin = '50% 30%';
    const shade = add('inset:0;width:auto;height:auto;background:linear-gradient(0deg,rgba(0,0,0,.6),rgba(0,0,0,.25));opacity:0;z-index:50', flap);
    wrap.style.clipPath = 'inset(30% 0 0 0)';
    const lip = add(`left:${px(-12)};top:${px(s.hinge - 0.2)};width:${px(24)};height:${px(1.6)};background:linear-gradient(180deg,rgba(0,0,0,.6),transparent);z-index:11`);
    x.sfx('whoosh', { level: 0.5 });
    A(shade, [{ opacity: 0 }, { opacity: 1 }], { duration: 650 });
    await A(flap, [{ transform: 'perspective(700px) rotateX(0)' }, { transform: 'perspective(700px) rotateX(178deg)' }], { duration: 650, easing: EASE.inOut });
    const inner = x.glow({ y: s.hinge + 2, size: 22, sx: 1.2, z: 4 });
    A(inner, [{ opacity: 0 }, { opacity: 0.8, offset: 0.4 }, { opacity: 0 }], { duration: 1100 });
    cards.forEach((c, i) => { c.el.style.zIndex = String(5 + i); x.set(c, { x: (i - x.mid) * 0.8, y: s.hinge + c.h * 0.5 + 1, s: Math.min(0.9, 22 / c.w) }, 1); });
    x.sfx('whoosh', { level: 0.4 });
    await Promise.all(cards.map((c, i) => x.move(c, { y: s.hinge - c.h * 0.3 - i * 0.5 }, { duration: 560, delay: i * 60, easing: EASE.out })));
    for (const e of [wrap, flap, lip]) A(e, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `0 ${px(hh)}` }], { duration: 480, easing: EASE.in });
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + (x.n - i)); });
    await x.land({ stagger: 60, duration: 620 });
  }
};

FX.stackspread = {
  async charge(x) {
    const { A, px, cards } = x;
    x.sfx('whoosh', { level: 0.4 });
    A(x.wrap, [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${px(12)}) scale(.92)`, opacity: 0 }], { duration: 560, easing: EASE.in });
    cards.forEach((c, i) => { c.el.style.zIndex = String(20 + i); x.set(c, { x: 0, y: 6, s: 0.8 }, 0); });
    await Promise.all(cards.map((c, i) => x.move(c, { y: -4 - i * 0.45, x: -i * 0.1, s: 1, o: 1 }, { duration: 560, delay: i * 25, easing: EASE.back })));
    x.s.base = cards.map((c, i) => -4 - i * 0.45);
  },
  async hold(x) {
    const { cards, s, k } = x;
    x.sfx('shimmer', { level: 0.15 + 0.2 * k });
    await Promise.all(cards.map((c, i) => {
      setTimeout(() => x.sfx('tick', { level: 0.15 + 0.15 * k }), i * 50);
      return x.move(c, { y: s.base[i] }, { duration: 420, delay: i * 50, easing: EASE.inOut, via: [{ y: s.base[i] - 1.6 - 1.2 * k, r: (i - x.mid) * 0.8, offset: 0.4 }] });
    }));
    await x.wait(120);
  },
  async burst(x) {
    const { cards, s } = x;
    x.sfx('whoosh', { level: 0.6 });
    const R = 30;
    const py = s.base[0] - 6;
    await Promise.all(cards.map((c, i) => x.move(c, { y: py - i * 0.3 }, { duration: 260, easing: EASE.out })));
    x.sfx('shimmer', { level: 0.6 });
    await Promise.all(cards.map((c, i) => {
      const a = (i - x.mid) * Math.min(14, 60 / Math.max(1, x.n - 1));
      const rad = a * Math.PI / 180;
      return x.move(c, { x: R * Math.sin(rad), y: py + R - R * Math.cos(rad), r: a }, { duration: 420, easing: EASE.back });
    }));
    cards.forEach((c) => x.glint(c, { duration: 480 }));
    await x.wait(220);
    await x.land({ stagger: 55, duration: 560, glint: false });
  }
};

FX.suspense = {
  beats: 2,
  async charge(x) {
    const { A } = x;
    const dim = x.dim(0.78, 520);
    const vig = x.add(`inset:0;width:auto;height:auto;background:radial-gradient(circle at ${x.center.x}px ${x.center.y}px, transparent 18%, rgba(0,0,0,.85) 55%);opacity:0;z-index:2`, x.root);
    const glow = x.glow({ size: 40, z: 3 });
    const rays = x.rays({ size: 90, z: 2 });
    x.loop(rays, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 14000 });
    x.wrap.style.zIndex = '20';
    Object.assign(x.s, { dim, vig, glow, rays });
    await x.wait(360);
    await FX.suspense.thump(x, 0.2, 700);
  },
  async thump(x, k, period) {
    const { A, s } = x;
    x.sfx('pulse', { level: k });
    A(x.body, [{ transform: 'scale(1)' }, { transform: `scale(${1.025 + 0.03 * k})`, offset: 0.14 }, { transform: 'scale(1)', offset: 0.32 }, { transform: `scale(${1.015 + 0.02 * k})`, offset: 0.44 }, { transform: 'scale(1)' }], { duration: Math.min(period, 620), easing: EASE.out });
    A(s.glow, [{ opacity: 0.25 + 0.3 * k }, { opacity: 0.6 + 0.4 * k, offset: 0.14 }, { opacity: 0.3 + 0.3 * k, offset: 0.32 }, { opacity: 0.5 + 0.4 * k, offset: 0.44 }, { opacity: 0.3 + 0.3 * k }], { duration: Math.min(period, 620) });
    setTimeout(() => x.sfx('pulse', { level: k * 0.6 }), Math.min(period, 620) * 0.44);
    await x.wait(period);
  },
  async hold(x) {
    const { A, s, k } = x;
    A(s.vig, [{ opacity: Math.max(0, k - 0.2) }, { opacity: k }], { duration: 500 });
    A(s.rays, [{ opacity: 0.08 * k }, { opacity: 0.2 * k }], { duration: 500 });
    await FX.suspense.thump(x, 0.3 + 0.7 * k, Math.max(420, 760 - x.beat * 70));
  },
  async burst(x) {
    const { A, s, add, cards } = x;
    x.sfx('swell', { dur: 0.4, level: 1 });
    A(s.glow, [{ opacity: 0.8 }, { opacity: 1, transform: 'scale(1.4)' }], { duration: 420 });
    await x.shake(x.body, 0.9, 420, 12);
    const f = add('inset:0;width:auto;height:auto;background:#fff;z-index:60;opacity:0', x.root);
    await A(f, [{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: EASE.in });
    x.sfx('burst', { level: 1 });
    x.hidePack();
    s.dim.remove();
    s.vig.remove();
    s.glow.remove();
    cards.forEach((c, i) => x.set(c, { ...x.slot(i), s: 1.04 }, 1));
    A(s.rays, [{ opacity: 0.6, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.8) rotate(30deg)' }], { duration: 1200 });
    x.sparks(0, 0, x.lite ? 8 : 16, { shape: 'star', colors: ['#fff', x.hot], dist: [12, 30] });
    cards.forEach((c, i) => x.move(c, { s: 1 }, { duration: 700, delay: i * 40, easing: EASE.out }).then(() => x.glint(c)));
    await A(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: EASE.out });
    f.remove();
  }
};

async function calm(x) {
  const { A, cards } = x;
  A(x.wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
  cards.forEach((c, i) => x.set(c, x.slot(i), 0));
  await Promise.all(cards.map((c, i) => x.move(c, { o: 1 }, { duration: 260, delay: i * 30, easing: EASE.soft })));
}

async function suspense(x, def, hold) {
  let ready = !hold;
  if (hold) {
    Promise.resolve().then(() => (typeof hold === 'function' ? hold() : hold)).then(() => { ready = true; }, () => { ready = true; });
  }
  const min = def.beats ?? 1;
  for (let beat = 0; (beat < min || !ready) && !x.fast; beat++) {
    x.beat = beat;
    x.level = Math.min(1, beat / 6);
    x.k = 0.25 + 0.75 * x.level;
    const t0 = performance.now();
    await def.hold(x, beat);
    if (performance.now() - t0 < 60) await x.wait(300);
    if (beat > 2000) break;
  }
}

export const OPENING_RUNNERS = FX;

export const OPENING_PHASES = ['charge', 'hold', 'burst', 'done'];

export async function playOpening(id, opts) {
  const def = FX[id];
  if (!def) return false;
  const x = stage(opts);
  const phase = (name) => { try { opts.onPhase?.(name, x); } catch {} };
  const abort = () => x.skip();
  opts.signal?.addEventListener?.('abort', abort);
  if (opts.signal?.aborted) x.skip();
  try {
    if (reducedMotion() || document.hidden) await calm(x);
    else {
      phase('charge');
      await def.charge(x);
      phase('hold');
      await suspense(x, def, opts.hold);
      phase('burst');
      await def.burst(x);
    }
  } catch (error) {
    console.error('opening effect failed', error);
  }
  opts.signal?.removeEventListener?.('abort', abort);
  x.finish();
  phase('done');
  return x;
}
