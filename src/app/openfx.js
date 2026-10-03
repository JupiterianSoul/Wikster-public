const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const EASE = 'cubic-bezier(.2,.75,.2,1)';

function stage({ root, center, pack, packW, packH, cards, targets }) {
  const u = packW / 24;
  const origin = document.createElement('div');
  origin.className = 'ofx-origin';
  origin.style.cssText = `position:absolute;left:${center.x}px;top:${center.y}px;width:0;height:0;transform-style:preserve-3d`;
  root.appendChild(origin);
  const A = (el, kf, o = {}) => el.animate(kf, { duration: 600, easing: EASE, fill: 'forwards', ...o }).finished.catch(() => {});
  const tf = (t) => `translate(${t.x * u}px, ${t.y * u}px) rotate(${t.r || 0}deg) scale(${t.s ?? 1})`;
  const add = (css = '', where = origin) => {
    const e = document.createElement('div');
    e.className = 'ofx-fx';
    e.style.cssText = `position:absolute;pointer-events:none;${css}`;
    where.appendChild(e);
    return e;
  };
  const wrap = document.createElement('div');
  wrap.className = 'ofx-pack';
  wrap.style.cssText = `position:absolute;left:0;top:0;width:${packW}px;height:${packH}px;margin:${-packH / 2}px 0 0 ${-packW / 2}px;z-index:10`;
  wrap.appendChild(pack);
  const hh = packH / u / 2;
  const list = cards.map((el, i) => {
    const w = el.offsetWidth || parseFloat(el.style.width) || 13 * u;
    const h = el.offsetHeight || parseFloat(el.style.height) || 18.2 * u;
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.margin = `${-h / 2}px 0 0 ${-w / 2}px`;
    el.style.zIndex = String(5 + i);
    const c = { el, t: { x: 0, y: 0, r: 0, s: 1 }, o: 0 };
    el.style.opacity = '0';
    origin.appendChild(el);
    return c;
  });
  origin.appendChild(wrap);
  const x = {
    root, origin, u, A, tf, add, wrap, hh, cards: list, n: list.length, wait,
    slot: (i) => ({ x: targets[i]?.x ?? 0, y: targets[i]?.y ?? 0, r: targets[i]?.r ?? 0, s: 1 }),
    set(c, t, o) { c.t = { ...c.t, ...t }; c.el.style.transform = tf(c.t); if (o != null) { c.o = o; c.el.style.opacity = String(o); } },
    move(c, to, o = {}) {
      const from = { transform: tf(c.t), opacity: c.o };
      c.t = { ...c.t, ...to };
      if (to.o != null) c.o = to.o;
      const kf = o.via
        ? [from, ...o.via.map((v) => ({ transform: tf({ ...c.t, ...v }), opacity: v.o ?? c.o, offset: v.offset, easing: v.easing })), { transform: tf(c.t), opacity: c.o }]
        : [from, { transform: tf(c.t), opacity: c.o }];
      const { via, ...rest } = o;
      return A(c.el, kf, rest);
    },
    land(o = {}) { return Promise.all(list.map((c, i) => x.move(c, { ...x.slot(i), s: 1, o: 1 }, { duration: 560, delay: i * (o.stagger ?? 70), ...o }))); },
    flash(color = '#fff', dur = 520, peak = 0.9) {
      const f = add(`inset:0;z-index:60;background:radial-gradient(circle at ${center.x}px ${center.y}px, ${color}, transparent 70%);opacity:0`, root);
      return A(f, [{ opacity: 0 }, { opacity: peak, offset: 0.25 }, { opacity: 0 }], { duration: dur, easing: 'ease-out' }).then(() => f.remove());
    },
    sparks(px, py, count, color) {
      for (let i = 0; i < count; i++) {
        const d = add(`left:0;top:0;width:${1.4 * u}px;height:${1.4 * u}px;margin:${-0.7 * u}px 0 0 ${-0.7 * u}px;border-radius:50%;z-index:30;background:${color};box-shadow:0 0 ${u}px ${color}`);
        const a = rand(0, Math.PI * 2);
        const r = rand(10, 26);
        A(d, [{ transform: `translate(${px * u}px,${py * u}px) scale(${rand(0.4, 1.1)})`, opacity: 1 }, { transform: `translate(${(px + Math.cos(a) * r) * u}px,${(py + Math.sin(a) * r) * u}px) scale(0)`, opacity: 0 }], { duration: rand(500, 900), easing: 'cubic-bezier(.1,.8,.3,1)' }).then(() => d.remove());
      }
    },
    clonePack(clip) {
      const p = wrap.cloneNode(true);
      p.style.clipPath = clip;
      origin.appendChild(p);
      return p;
    },
    shake(el, amp = 1, dur = 500, steps = 8) {
      const kf = [];
      for (let i = 0; i <= steps; i++) kf.push({ transform: `translate(${(i === steps ? 0 : (i % 2 ? amp : -amp) * (1 - i / steps)) * u}px, 0) rotate(${i === steps ? 0 : (i % 2 ? 1 : -1) * amp * 0.8}deg)` });
      return A(el, kf, { duration: dur, easing: 'linear', fill: 'none' });
    },
    hide(el) { el.style.visibility = 'hidden'; }
  };
  return x;
}

const RUN = {};

RUN.tearstrip = async (x) => {
  const { A, u, wrap, cards, add, hh } = x;
  const line = add(`left:0;top:0;height:${0.5 * u}px;width:0;margin:${(-hh + 3.3) * u}px 0 0 ${-12 * u}px;background:#fff;box-shadow:0 0 ${u}px #fff,0 0 ${3 * u}px #ffd28a;z-index:12`);
  await A(line, [{ width: '0px' }, { width: `${24 * u}px` }], { duration: 480, easing: 'ease-in-out' });
  const strip = x.clonePack('inset(0 0 84% 0)');
  strip.style.zIndex = '13';
  A(wrap, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(16% 0 0 0)' }], { duration: 1 });
  line.remove();
  A(strip, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${22 * u}px,${-16 * u}px) rotate(34deg)`, opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.3,.1,.3,1)' });
  cards.forEach((c, i) => x.set(c, { x: 0, y: -2 + i * 0.3 }, 1));
  await Promise.all(cards.map((c, i) => x.move(c, { y: -hh - 1 - i * 0.4 }, { duration: 620, delay: i * 50 })));
  A(wrap, [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${40 * u}px)`, opacity: 0 }], { duration: 520, easing: 'ease-in' });
  await x.land();
};

RUN.zipper = async (x) => {
  const { A, u, wrap, cards, add, hh } = x;
  const gap = add(`left:0;top:0;width:${0.8 * u}px;height:0;margin:${-hh * u}px 0 0 ${-0.4 * u}px;background:#07080d;z-index:11`);
  const pull = add(`left:0;top:0;width:${2.6 * u}px;height:${4.6 * u}px;margin:${-hh * u}px 0 0 ${-1.3 * u}px;border-radius:${0.6 * u}px;background:linear-gradient(#fff4c4,#d8a534);box-shadow:0 ${0.4 * u}px ${u}px rgba(0,0,0,.5);z-index:12`);
  await Promise.all([
    A(gap, [{ height: '0px' }, { height: `${hh * 2 * u}px` }], { duration: 900, easing: 'ease-in-out' }),
    A(pull, [{ transform: 'translateY(0)' }, { transform: `translateY(${(hh * 2 - 3) * u}px)` }], { duration: 900, easing: 'ease-in-out' })
  ]);
  const L = x.clonePack('inset(0 50% 0 0)');
  const R = x.clonePack('inset(0 0 0 50%)');
  x.hide(wrap); gap.remove(); pull.remove();
  cards.forEach((c) => x.set(c, { x: 0, y: 0, r: rand(-2, 2) }, 1));
  L.style.transformOrigin = '0 50%';
  R.style.transformOrigin = '100% 50%';
  await Promise.all([
    A(L, [{ transform: 'rotateY(0)' }, { transform: `rotateY(-110deg) translateX(${-4 * u}px)`, opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.4,0,.2,1)' }),
    A(R, [{ transform: 'rotateY(0)' }, { transform: `rotateY(110deg) translateX(${4 * u}px)`, opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.4,0,.2,1)' })
  ]);
  await x.land({ stagger: 110, duration: 460 });
};

RUN.blade = async (x) => {
  const { A, u, wrap, cards, add } = x;
  const blade = add(`left:0;top:0;width:${90 * u}px;height:${0.5 * u}px;margin:${-0.25 * u}px 0 0 ${-45 * u}px;background:linear-gradient(90deg,transparent,#fff 30%,#fff 70%,transparent);box-shadow:0 0 ${1.5 * u}px #bfe6ff;z-index:14;transform:rotate(-58deg) scaleX(0)`);
  await A(blade, [{ transform: 'rotate(-58deg) scaleX(0)', opacity: 1 }, { transform: 'rotate(-58deg) scaleX(1)', opacity: 1, offset: 0.5 }, { transform: 'rotate(-58deg) scaleX(1)', opacity: 0 }], { duration: 420, easing: 'ease-out' });
  const T = x.clonePack('polygon(0 0,100% 0,100% 28%,0 72%)');
  const B = x.clonePack('polygon(0 72%,100% 28%,100% 100%,0 100%)');
  x.hide(wrap); blade.remove();
  x.flash('#ffffff', 420, 0.6);
  A(T, [{ transform: 'translate(0,0)' }, { transform: `translate(${14 * u}px,${-10 * u}px) rotate(14deg)`, opacity: 0 }], { duration: 760, easing: 'cubic-bezier(.3,0,.3,1)' });
  await A(B, [{ transform: 'translate(0,0)' }, { transform: `translate(${-14 * u}px,${14 * u}px) rotate(-12deg)`, opacity: 0 }], { duration: 760, easing: 'cubic-bezier(.3,0,.3,1)' });
  cards.forEach((c) => x.set(c, { x: 0, y: 0, s: 0.2 }, 0));
  await x.land({ stagger: 130, duration: 620, easing: 'cubic-bezier(.3,1.5,.4,1)' });
};

RUN.shatter = async (x) => {
  const { A, u, wrap, cards } = x;
  await x.shake(wrap, 1.1, 700, 12);
  const cols = 4;
  const rows = 6;
  const shards = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const s = x.clonePack(`inset(${(r / rows) * 100}% ${100 - ((c + 1) / cols) * 100}% ${100 - ((r + 1) / rows) * 100}% ${(c / cols) * 100}%)`);
    shards.push([s, (c + 0.5) / cols - 0.5, (r + 0.5) / rows - 0.5]);
  }
  x.hide(wrap);
  x.flash('#fff', 480, 0.8);
  shards.forEach(([s, dx, dy]) => A(s, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${dx * rand(50, 90) * u}px,${(dy * rand(40, 70) + rand(-4, 8)) * u}px) rotate(${rand(-160, 160)}deg) scale(.7)`, opacity: 0 }], { duration: rand(700, 1000), easing: 'cubic-bezier(.15,.7,.3,1)' }).then(() => s.remove()));
  cards.forEach((c) => x.set(c, { x: 0, y: 0, s: 0.3 }, 1));
  await x.land({ stagger: 60, duration: 700, delay: 80, easing: 'cubic-bezier(.2,1.2,.3,1)' });
};

RUN.burstfan = async (x) => {
  const { A, u, wrap, cards, add } = x;
  await A(wrap, [{ filter: 'drop-shadow(0 0 0 #ffd766)', transform: 'scale(1)' }, { filter: `drop-shadow(0 0 ${4 * u}px #ffd766)`, transform: 'scale(1.06) rotate(-1deg)', offset: 0.6 }, { filter: `drop-shadow(0 0 ${6 * u}px #fff)`, transform: 'scale(1.1) rotate(1deg)' }], { duration: 900, easing: 'ease-in' });
  const ring = add(`left:0;top:0;width:${10 * u}px;height:${10 * u}px;margin:${-5 * u}px 0 0 ${-5 * u}px;border-radius:50%;border:${0.8 * u}px solid #ffe7a6;box-shadow:0 0 ${2 * u}px #ffd766;z-index:15`);
  A(ring, [{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(9)', opacity: 0 }], { duration: 700, easing: 'ease-out' }).then(() => ring.remove());
  A(wrap, [{ transform: 'scale(1.1)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 260, easing: 'ease-out' });
  x.flash('#fff3cf', 500, 0.8);
  x.sparks(0, 0, 18, '#ffd766');
  cards.forEach((c) => x.set(c, { x: 0, y: 4, s: 0.5 }, 1));
  await Promise.all(cards.map((c, i) => {
    const f = x.slot(i);
    return x.move(c, { ...f, o: 1 }, { duration: 900, delay: i * 70, easing: 'cubic-bezier(.3,.6,.3,1)', via: [{ x: f.x * 0.55, y: -24, r: (i - (x.n - 1) / 2) * -14, s: 0.8, offset: 0.45 }] });
  }));
};

RUN.unfold = async (x) => {
  const { A, wrap, cards } = x;
  const T = x.clonePack('inset(0 0 50% 0)');
  const B = x.clonePack('inset(50% 0 0 0)');
  x.hide(wrap);
  cards.forEach((c, i) => x.set(c, { x: 0, y: 0, r: (i - (x.n - 1) / 2) * 1.2 }, 1));
  T.style.transformOrigin = '50% 50%';
  B.style.transformOrigin = '50% 50%';
  await Promise.all([
    A(T, [{ transform: 'rotateX(0)' }, { transform: 'rotateX(-100deg)', opacity: 0.9, offset: 0.6 }, { transform: 'rotateX(-165deg)', opacity: 0 }], { duration: 1000, easing: 'cubic-bezier(.5,0,.3,1)' }),
    A(B, [{ transform: 'rotateX(0)' }, { transform: 'rotateX(100deg)', opacity: 0.9, offset: 0.6 }, { transform: 'rotateX(165deg)', opacity: 0 }], { duration: 1000, easing: 'cubic-bezier(.5,0,.3,1)' })
  ]);
  await Promise.all(cards.map((c, i) => x.move(c, x.slot(i), { duration: 620, delay: Math.abs(i - (x.n - 1) / 2) * 90 })));
};

RUN.vortex = async (x) => {
  const { A, u, wrap, cards, add } = x;
  const swirl = add(`left:0;top:0;width:${40 * u}px;height:${40 * u}px;margin:${-20 * u}px 0 0 ${-20 * u}px;border-radius:50%;background:conic-gradient(from 0deg,var(--ofx-a,#fb923c),transparent 25%,#a855f7 50%,transparent 75%,var(--ofx-a,#fb923c));-webkit-mask:radial-gradient(circle,transparent 8%,#000 30%,transparent 70%);mask:radial-gradient(circle,transparent 8%,#000 30%,transparent 70%);z-index:4;opacity:0`);
  A(swirl, [{ opacity: 0, transform: 'rotate(0) scale(.2)' }, { opacity: 1, transform: 'rotate(360deg) scale(1)', offset: 0.5 }, { opacity: 0, transform: 'rotate(900deg) scale(1.4)' }], { duration: 2000, easing: 'linear' }).then(() => swirl.remove());
  await A(wrap, [{ transform: 'rotate(0) scale(1)', opacity: 1 }, { transform: 'rotate(620deg) scale(0)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.6,0,.4,1)' });
  cards.forEach((c) => x.set(c, { x: 0, y: 0, s: 0.1 }, 1));
  await Promise.all(cards.map((c, i) => {
    const via = [];
    const base = i * (360 / x.n);
    for (let k = 1; k <= 5; k++) {
      const a = (base + k * 70) * Math.PI / 180;
      const rr = k * 4.5;
      via.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.7, r: k * 60, s: 0.2 + k * 0.14, offset: k / 6.5 });
    }
    return x.move(c, { ...x.slot(i), s: 1 }, { duration: 1200, delay: i * 80, easing: 'cubic-bezier(.3,.3,.3,1)', via });
  }));
};

RUN.deal = async (x) => {
  const { A, wrap, cards } = x;
  await A(wrap, [{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], { duration: 380, easing: 'ease-in' });
  x.hide(wrap);
  cards.forEach((c, i) => x.set(c, { x: -i * 0.15, y: -i * 0.15, s: 0.9 }, 1));
  await Promise.all(cards.map((c) => A(c.el, [{ transform: `${x.tf(c.t)} rotateY(-90deg)` }, { transform: x.tf(c.t) }], { duration: 360, easing: 'ease-out', fill: 'none' })));
  for (let i = x.n - 1; i >= 0; i--) {
    const s = x.slot(i);
    x.move(cards[i], { ...s, r: s.r + rand(-5, 5) }, { duration: 440, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    await wait(150);
  }
  await wait(350);
  await Promise.all(cards.map((c, i) => x.move(c, { r: x.slot(i).r }, { duration: 200 })));
};

RUN.pour = async (x) => {
  const { A, u, wrap, cards } = x;
  await A(wrap, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${-22 * u}px,${-8 * u}px) rotate(-118deg) scale(.8)` }], { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)' });
  for (let i = 0; i < x.n; i++) {
    const c = cards[i];
    x.set(c, { x: -12, y: -14, r: -90, s: 0.6 }, 1);
    const end = x.slot(i);
    x.move(c, { ...end, s: 1 }, { duration: 850, easing: 'linear', via: [{ x: end.x * 0.5 - 6, y: Math.min(end.y, 0) - 18, r: -40, s: 0.85, offset: 0.35, easing: 'ease-out' }, { x: end.x, y: end.y + 2.4, r: end.r + rand(-6, 6), offset: 0.78 }, { x: end.x, y: end.y - 1.2, r: end.r, offset: 0.9 }] });
    await wait(170);
  }
  A(wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
  await wait(900);
};

RUN.riseglint = async (x) => {
  const { A, u, wrap, cards, hh } = x;
  A(wrap, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(16% 0 0 0)' }], { duration: 300 });
  cards.forEach((c) => x.set(c, { x: 0, y: -2 }, 1));
  await Promise.all(cards.map((c, i) => x.move(c, { y: -hh + 12 - i * 0.8, x: (i - (x.n - 1) / 2) * 0.6 }, { duration: 700, delay: i * 50 })));
  A(wrap, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: `translateY(${30 * u}px)` }], { duration: 500, easing: 'ease-in' });
  for (let i = 0; i < x.n; i++) {
    const c = cards[i];
    await x.move(c, x.slot(i), { duration: 340 });
    const glint = document.createElement('span');
    glint.className = 'ofx-glint';
    c.el.appendChild(glint);
    A(glint, [{ opacity: 1, transform: 'translateX(-60%)' }, { opacity: 0, transform: 'translateX(60%)' }], { duration: 520 }).then(() => glint.remove());
  }
  await wait(400);
};

RUN.reels = async (x) => {
  const { A, u, wrap, cards, add } = x;
  await A(wrap, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.15)', offset: 0.4 }, { transform: 'scale(0)', opacity: 0 }], { duration: 420, easing: 'ease-in' });
  const spins = [];
  const reels = cards.map((c, i) => {
    const s = x.slot(i);
    const w = c.el.offsetWidth || 13 * u;
    const h = c.el.offsetHeight || 18.2 * u;
    const box = add(`left:0;top:0;width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;border-radius:${0.06 * w}px;overflow:hidden;background:#0a0c14;box-shadow:inset 0 0 0 ${0.03 * w}px #3a4260,inset 0 ${0.2 * h}px ${0.2 * h}px -${0.05 * h}px rgba(0,0,0,.8),inset 0 -${0.2 * h}px ${0.2 * h}px -${0.05 * h}px rgba(0,0,0,.8);z-index:6;transform:translate(${s.x * u}px,${s.y * u}px)`);
    const strip = document.createElement('div');
    const b = h / 3;
    strip.style.cssText = `position:absolute;left:0;right:0;top:0;height:${h * 6}px;background:repeating-linear-gradient(180deg,#9aa3b5 0 ${b}px,#3b82f6 ${b}px ${b * 2}px,#a855f7 ${b * 2}px ${b * 3}px,#34d399 ${b * 3}px ${b * 4}px,#f0b43c ${b * 4}px ${b * 5}px);filter:blur(${0.03 * w}px);opacity:.75`;
    box.appendChild(strip);
    spins.push(strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-b * 5}px)` }], { duration: 160, iterations: Infinity }));
    return box;
  });
  await wait(700);
  for (let i = 0; i < x.n; i++) {
    const c = cards[i];
    const s = x.slot(i);
    x.set(c, { ...s, s: 0.9 }, 0);
    A(reels[i], [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).then(() => { spins[i].cancel(); reels[i].remove(); });
    x.move(c, { s: 1, o: 1 }, { duration: 380, easing: 'cubic-bezier(.3,1.6,.4,1)', via: [{ y: s.y - 2.5, offset: 0.4 }] });
    await wait(i === x.n - 2 ? 600 : 300);
  }
  await wait(400);
};

RUN.portal = async (x) => {
  const { A, u, wrap, cards, add, hh } = x;
  const ringCss = (color, glow, y) => `left:0;top:0;width:${44 * u}px;height:${11 * u}px;margin:${(y - 5.5) * u}px 0 0 ${-22 * u}px;border-radius:50%;border:${0.9 * u}px solid ${color};box-shadow:0 0 ${2 * u}px ${glow},inset 0 0 ${2 * u}px ${glow};background:radial-gradient(ellipse,#05060c 40%,${glow}40)`;
  const low = hh - 3;
  const high = -hh - 6;
  const blue = add(`${ringCss('#a5f3fc', '#22d3ee', low)};z-index:4`);
  await A(blue, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 500 });
  wrap.style.zIndex = '3';
  await A(wrap, [{ transform: 'translateY(0)', clipPath: 'inset(-10% -10% -10% -10%)' }, { transform: `translateY(${-6 * u}px)`, offset: 0.25 }, { transform: `translateY(${(hh * 2 + 4) * u}px)`, clipPath: 'inset(-10% -10% 100% -10%)' }], { duration: 900, easing: 'ease-in' });
  A(blue, [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(.2)' }], { duration: 420 });
  const orange = add(`${ringCss('#fed7aa', '#fb923c', high)};z-index:20`);
  await A(orange, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 460 });
  for (let i = 0; i < x.n; i++) {
    const c = cards[i];
    c.el.style.zIndex = String(21 + i);
    x.set(c, { x: 0, y: high, s: 0.25 }, 0);
    x.move(c, { ...x.slot(i), s: 1, o: 1 }, { duration: 760, easing: 'cubic-bezier(.3,.9,.3,1.05)', via: [{ x: 0, y: high + 4, s: 0.6, o: 1, offset: 0.25 }] });
    await wait(170);
  }
  await wait(600);
  await A(orange, [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(.2)' }], { duration: 400 });
};

RUN.peel = async (x) => {
  const { A, u, wrap, cards } = x;
  cards.forEach((c, i) => x.set(c, { x: (i - (x.n - 1) / 2) * 0.3, y: (i - (x.n - 1) / 2) * 0.3, s: 1 }, 1));
  wrap.style.filter = `drop-shadow(${u}px ${u}px ${1.2 * u}px rgba(0,0,0,.6))`;
  await A(wrap, [
    { clipPath: 'polygon(0 0,100% 0,100% 100%,100% 100%,0 100%)' },
    { clipPath: 'polygon(0 0,100% 0,100% 58%,62% 100%,0 100%)', offset: 0.3 },
    { clipPath: 'polygon(0 0,100% 0,100% 5%,5% 100%,0 100%)', offset: 0.65 },
    { clipPath: 'polygon(0 0,40% 0,0 40%,0 40%,0 40%)', offset: 0.85 },
    { clipPath: 'polygon(0 0,0 0,0 0,0 0,0 0)' }
  ], { duration: 1300, easing: 'cubic-bezier(.5,0,.4,1)' });
  x.hide(wrap);
  await x.land({ stagger: 70, duration: 620 });
};

RUN.pop = async (x) => {
  const { A, u, wrap, cards, add } = x;
  await A(wrap, [
    { transform: 'scale(1,1)' }, { transform: 'scale(1.08,.9)', offset: 0.2 }, { transform: 'scale(.94,1.08)', offset: 0.4 },
    { transform: 'scale(1.12,.95)', offset: 0.6 }, { transform: 'scale(1.02,1.14)', offset: 0.8 }, { transform: 'scale(1.22,1.22)' }
  ], { duration: 900, easing: 'ease-in-out' });
  x.hide(wrap);
  x.flash('#fff', 360, 0.7);
  const colors = ['#fb923c', '#f0b43c', '#a855f7', '#3b82f6', '#34d399', '#ff4fa3'];
  for (let i = 0; i < 30; i++) {
    const cf = add(`left:0;top:0;width:${1.6 * u}px;height:${2.6 * u}px;margin:${-1.3 * u}px 0 0 ${-0.8 * u}px;z-index:30;background:${colors[i % colors.length]}`);
    const a = rand(-Math.PI, 0);
    const r = rand(20, 45);
    const ex = Math.cos(a) * r;
    A(cf, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${ex * u}px,${Math.sin(a) * r * 0.9 * u}px) rotate(${rand(-200, 200)}deg)`, opacity: 1, offset: 0.4 }, { transform: `translate(${ex * 1.3 * u}px,${35 * u}px) rotate(${rand(-500, 500)}deg)`, opacity: 0 }], { duration: rand(1100, 1600), easing: 'cubic-bezier(.2,.6,.5,1)' }).then(() => cf.remove());
  }
  for (let i = 0; i < x.n; i++) {
    const c = cards[i];
    const end = x.slot(i);
    x.set(c, { x: end.x, y: end.y - 48, r: rand(-10, 10) }, 1);
    x.move(c, end, { duration: 760, easing: 'linear', via: [{ y: end.y + 2.5, r: end.r, offset: 0.62, easing: 'ease-in' }, { y: end.y - 1.8, offset: 0.8 }, { y: end.y + 0.4, offset: 0.92 }] });
    await wait(110);
  }
  await wait(800);
};

RUN.beam = async (x) => {
  const { A, u, wrap, cards, add, root, origin } = x;
  const beam = add(`left:${parseFloat(origin.style.left) - 15 * u}px;top:0;bottom:0;width:${30 * u}px;background:linear-gradient(90deg,transparent,rgba(165,243,252,.35) 30%,rgba(255,255,255,.7) 50%,rgba(165,243,252,.35) 70%,transparent);transform-origin:50% 0;z-index:2;mix-blend-mode:screen`, root);
  await A(beam, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1 }], { duration: 520 });
  await A(wrap, [{ transform: 'translateY(0)', filter: 'blur(0) brightness(1)', opacity: 1 }, { transform: `translateY(${-6 * u}px)`, filter: 'blur(0) brightness(1.4)', offset: 0.4 }, { transform: `translateY(${-50 * u}px) scaleY(1.6)`, filter: `blur(${2 * u}px) brightness(2)`, opacity: 0 }], { duration: 1000, easing: 'ease-in' });
  for (let i = 0; i < x.n; i++) {
    const c = cards[i];
    x.set(c, { x: 0, y: -48, s: 0.8 }, 0);
    await x.move(c, { x: 0, y: 2, s: 1, o: 1 }, { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' });
    x.move(c, x.slot(i), { duration: 420 });
  }
  A(beam, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 }).then(() => beam.remove());
  await wait(450);
};

RUN.dissolve = async (x) => {
  const { A, u, wrap, cards, add, hh } = x;
  const cs = getComputedStyle(wrap.firstElementChild ?? wrap);
  const accent = cs.getPropertyValue('--accent').trim() || '#fb923c';
  const accent2 = cs.getPropertyValue('--accent2').trim() || '#7c2d12';
  const palette = [accent, accent2, `color-mix(in srgb, ${accent} 50%, #fff)`, `color-mix(in srgb, ${accent} 60%, ${accent2})`];
  const colsN = 10;
  const rowsN = 17;
  const w = 24 / colsN;
  const h = (hh * 2) / rowsN;
  const parts = [];
  for (let r = 0; r < rowsN; r++) for (let c = 0; c < colsN; c++) {
    parts.push([add(`left:0;top:0;width:${w * u + 0.5}px;height:${h * u + 0.5}px;margin:${(-hh + r * h) * u}px 0 0 ${(-12 + c * w) * u}px;background:${palette[(r * 7 + c * 3) % palette.length]};z-index:11`), r]);
  }
  x.hide(wrap);
  parts.forEach(([p, r]) => A(p, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${rand(-8, 8) * u}px,${rand(-34, -14) * u}px) scale(0)`, opacity: 0 }], { duration: rand(700, 1100), delay: r * 40 + rand(0, 120), easing: 'ease-out' }).then(() => p.remove()));
  await wait(500);
  for (let i = 0; i < x.n; i++) {
    const c = cards[i];
    x.set(c, { ...x.slot(i), s: 1.08 }, 0);
    A(c.el, [{ filter: `blur(${3 * u}px) brightness(2)`, opacity: 0, transform: x.tf(c.t) }, { filter: 'blur(0) brightness(1)', opacity: 1, transform: x.tf({ ...c.t, s: 1 }) }], { duration: 700, easing: 'ease-out' });
    c.t.s = 1;
    c.o = 1;
    await wait(130);
  }
  await wait(700);
};

RUN.thunder = async (x) => {
  const { A, u, wrap, cards, add, root, origin, hh } = x;
  const dim = add('inset:0;background:rgba(3,5,12,.78);z-index:1;opacity:0', root);
  await A(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 450 });
  await x.shake(wrap, 0.5, 380, 8);
  const top = parseFloat(origin.style.top) / u + 2;
  const drop = top - hh;
  const pts = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) pts.push([i === 0 || i === steps ? 0 : rand(-5, 5), (i / steps) * drop]);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `-12 0 24 ${drop}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = `position:absolute;left:${-12 * u}px;top:${-top * u}px;width:${24 * u}px;height:${drop * u}px;z-index:40;overflow:visible;pointer-events:none;filter:drop-shadow(0 0 ${u}px #bfe3ff) drop-shadow(0 0 ${3 * u}px #6aa8ff)`;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#fff');
  line.setAttribute('stroke-width', '0.9');
  line.setAttribute('stroke-linejoin', 'bevel');
  svg.appendChild(line);
  origin.appendChild(svg);
  await A(svg, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.3, offset: 0.45 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 520, easing: 'linear' });
  svg.remove();
  x.flash('#dbeafe', 520, 0.95);
  const crack = 'polygon(0 0,52% 0,46% 18%,56% 34%,44% 52%,55% 70%,47% 86%,52% 100%,0 100%)';
  const crackR = 'polygon(52% 0,100% 0,100% 100%,52% 100%,47% 86%,55% 70%,44% 52%,56% 34%,46% 18%)';
  const L = x.clonePack(crack);
  const R = x.clonePack(crackR);
  x.hide(wrap);
  x.sparks(0, -hh * 0.4, 16, '#bfe3ff');
  x.sparks(0, hh * 0.3, 10, '#ffffff');
  A(L, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${-26 * u}px,${6 * u}px) rotate(-24deg)`, opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.2,.8,.3,1)' });
  A(R, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${26 * u}px,${6 * u}px) rotate(24deg)`, opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.2,.8,.3,1)' });
  cards.forEach((c) => { c.el.style.zIndex = '20'; x.set(c, { x: 0, y: 0, s: 0.3 }, 1); });
  await Promise.all(cards.map((c, i) => {
    const s = x.slot(i);
    return x.move(c, { ...s, s: 1 }, { duration: 620, delay: i * 45, easing: 'cubic-bezier(.2,1.3,.35,1)', via: [{ x: s.x * 1.12, y: s.y * 1.12 - 2, r: s.r + rand(-8, 8), s: 1.05, offset: 0.7 }] });
  }));
  await A(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 });
  dim.remove();
};

RUN.flap = async (x) => {
  const { A, u, wrap, cards, add, hh } = x;
  const hinge = -hh + hh * 2 * 0.3;
  const seal = add(`left:0;top:0;width:${6 * u}px;height:${6 * u}px;margin:${(hinge - 3) * u}px 0 0 ${-3 * u}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ff8a7a,#b91c1c 60%,#6b0f0f);box-shadow:0 ${0.3 * u}px ${0.6 * u}px rgba(0,0,0,.5);z-index:14`);
  await A(seal, [{ transform: 'scale(0)' }, { transform: 'scale(1.15)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
  await wait(250);
  await A(seal, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 260 });
  seal.remove();
  const flap = x.clonePack('inset(0 0 70% 0)');
  flap.style.zIndex = '12';
  flap.style.transformOrigin = '50% 30%';
  wrap.style.clipPath = 'inset(30% 0 0 0)';
  const lip = add(`left:0;top:0;width:${24 * u}px;height:${1.6 * u}px;margin:${hinge * u}px 0 0 ${-12 * u}px;background:linear-gradient(180deg,rgba(0,0,0,.65),transparent);z-index:11`);
  await A(flap, [{ transform: 'perspective(600px) rotateX(0)', filter: 'brightness(1)' }, { transform: 'perspective(600px) rotateX(180deg)', filter: 'brightness(.55)' }], { duration: 700, easing: 'cubic-bezier(.4,0,.2,1)' });
  cards.forEach((c, i) => { c.el.style.zIndex = String(5 + i); x.set(c, { x: (i - (x.n - 1) / 2) * 0.8, y: hinge + 10, s: 0.9 }, 1); });
  await Promise.all(cards.map((c, i) => x.move(c, { y: hinge - 12 - i * 0.4 }, { duration: 620, delay: i * 60 })));
  [wrap, flap, lip].forEach((e) => A(e, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `0 ${16 * u}px` }], { duration: 500, easing: 'ease-in' }));
  cards.forEach((c, i) => { c.el.style.zIndex = String(20 + i); });
  await x.land({ stagger: 60, duration: 620 });
};

RUN.stackspread = async (x) => {
  const { A, u, wrap, cards } = x;
  A(wrap, [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${10 * u}px)`, opacity: 0 }], { duration: 520, easing: 'ease-in' });
  cards.forEach((c) => x.set(c, { x: 0, y: 4 }, 1));
  await Promise.all(cards.map((c, i) => x.move(c, { y: -6 - i * 0.5, s: 1.1, r: (i - (x.n - 1) / 2) * 0.6 }, { duration: 520, easing: 'cubic-bezier(.2,1.3,.4,1)' })));
  await wait(260);
  await Promise.all(cards.map((c, i) => x.move(c, x.slot(i), { duration: 560, easing: 'cubic-bezier(.3,1.2,.4,1)' })));
};

RUN.suspense = async (x) => {
  const { A, u, wrap, cards, add, root } = x;
  const cs = getComputedStyle(wrap.firstElementChild ?? wrap);
  const glow = cs.getPropertyValue('--accent').trim() || '#f0b43c';
  const dim = add('inset:0;background:rgba(0,0,0,.72);z-index:1;opacity:0', root);
  A(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
  wrap.style.zIndex = '20';
  for (let beat = 1; beat <= 3; beat++) {
    const g = 2 + beat * 2;
    await A(wrap, [{ transform: 'scale(1)', filter: `drop-shadow(0 0 ${g * 0.5 * u}px ${glow})` }, { transform: `scale(${1 + beat * 0.03})`, filter: `drop-shadow(0 0 ${g * u}px ${glow})`, offset: 0.3 }, { transform: 'scale(1)', filter: `drop-shadow(0 0 ${g * 0.6 * u}px ${glow})` }], { duration: 620 - beat * 80, easing: 'ease-out' });
    await wait(120);
  }
  await x.shake(wrap, 0.9, 420, 10);
  const f = add('inset:0;background:#fff;z-index:60;opacity:0', root);
  await A(f, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-in' });
  x.hide(wrap);
  dim.remove();
  cards.forEach((c, i) => x.set(c, x.slot(i), 1));
  await A(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
  f.remove();
};

export const OPENING_RUNNERS = RUN;

export async function playOpening(id, opts) {
  const run = RUN[id];
  if (!run) return false;
  const x = stage(opts);
  try { await run(x); } catch (error) { console.error('opening effect failed', error); }
  x.cards.forEach((c, i) => x.set(c, x.slot(i), 1));
  return x;
}
