export function centerAudit(rootSelector) {
  const TOL = 2;
  const issues = [];
  const SKIP = '[aria-hidden="true"], .sr-only, .visually-hidden, .seg-indicator, .toast, .toasts, .navbar, .pc-foot, .booster, .card, .pck-card, .rarity-fx, .fx-preview, .frame-overlay, .crop-stage, .pch-flow, .pch-hand, .album-book, .backdrop, canvas, .chart, [data-center-skip]';
  const styles = new Map();
  const css = (el) => { let s = styles.get(el); if (!s) { s = getComputedStyle(el); styles.set(el, s); } return s; };
  const seen = new Map();
  const shown = (el) => { let v = seen.get(el); if (v === undefined) { v = el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); seen.set(el, v); } return v; };
  const alpha = (c) => { if (!c || c === 'transparent') return 0; const m = c.match(/rgba?\(([^)]*)\)/); if (!m) return 1; const p = m[1].split(/[\s,/]+/).filter(Boolean); return p.length > 3 ? Number(p[3].replace('%', '')) / (p[3].includes('%') ? 100 : 1) : 1; };
  const painted = (el) => {
    if (el.matches('svg, img, video, input, select, textarea, progress, hr, iframe')) return true;
    const s = css(el);
    if (alpha(s.backgroundColor) > 0.02 || s.backgroundImage !== 'none') return true;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none' && alpha(s[`border${side}Color`]) > 0.02) return true;
    }
    return false;
  };
  const kidsOf = new Map();
  const flowKids = (el) => {
    if (kidsOf.has(el)) return kidsOf.get(el);
    const out = [];
    for (const kid of el.children) {
      if (kid.matches('script, style, template, br')) continue;
      const s = css(kid);
      if (s.display === 'contents') { out.push(...flowKids(kid)); continue; }
      if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
      if (!shown(kid)) continue;
      out.push(kid);
    }
    kidsOf.set(el, out);
    return out;
  };
  const range = document.createRange();
  const inks = new Map();
  const union = (a, b) => a ? (b ? { l: Math.min(a.l, b.l), r: Math.max(a.r, b.r), t: Math.min(a.t, b.t), b: Math.max(a.b, b.b) } : a) : b;
  const box = (r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom });
  const ink = (el) => {
    if (inks.has(el)) return inks.get(el);
    let out = null;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      if (painted(el)) out = box(r);
      else if (/grid$/.test(css(el).display) && css(el).gridTemplateColumns.trim().split(/\s+/).length > 1) {
        for (const k of flowKids(el)) out = union(out, box(k.getBoundingClientRect()));
      } else {
        for (const node of el.childNodes) {
          if (node.nodeType === 3) {
            if (!node.textContent.trim()) continue;
            range.selectNodeContents(node);
            for (const rr of range.getClientRects()) if (rr.width > 0.5) out = union(out, box(rr));
          } else if (node.nodeType === 1) {
            const s = css(node);
            if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed' || !shown(node)) continue;
            out = union(out, ink(node));
          }
        }
        if (out && css(el).overflowX !== 'visible') out = { l: Math.max(out.l, r.left), r: Math.min(out.r, r.right), t: out.t, b: out.b };
      }
    }
    inks.set(el, out);
    return out;
  };
  const content = (el) => {
    const r = el.getBoundingClientRect();
    const s = css(el);
    const l = r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
    const rr = r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight) - (el.offsetWidth - el.clientWidth - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth) > 1 ? el.offsetWidth - el.clientWidth - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth) : 0);
    return { l, r: rr, w: rr - l, c: (l + rr) / 2 };
  };
  const name = (el) => {
    const cls = [...el.classList].filter((c) => !/^is-/.test(c)).slice(0, 2).join('.');
    let txt = '';
    for (const node of el.childNodes) if (node.nodeType === 3) txt += node.textContent;
    txt = (txt.trim() || el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
  };
  const where = (el) => {
    const path = [];
    for (let n = el; n && path.length < 3; n = n.parentElement) {
      if (n.id) { path.unshift(`#${n.id}`); break; }
      if (n.classList.length) path.unshift(`.${[...n.classList].filter((c) => !/^is-/.test(c))[0] ?? n.classList[0]}`);
    }
    return path.join(' ');
  };
  const add = (el, what) => issues.push(`${where(el)}: ${what}`);
  const fmt = (n) => Math.round(n * 10) / 10;
  const scrollsX = (el) => el.scrollWidth > el.clientWidth + 1 && /auto|scroll|hidden/.test(css(el).overflowX);
  const vertical = (el) => {
    const s = css(el);
    if (/^(block|flow-root|list-item)$/.test(s.display)) return true;
    if (/flex$/.test(s.display)) return s.flexDirection.startsWith('column');
    if (/grid$/.test(s.display)) return s.gridTemplateColumns.trim().split(/\s+/).length === 1 && s.gridAutoFlow.startsWith('row');
    return false;
  };
  const stacked = (kids) => {
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1].getBoundingClientRect();
      const b = kids[i].getBoundingClientRect();
      if (b.top < a.bottom - 1 && a.top < b.bottom - 1) return false;
    }
    return true;
  };
  const icons = new Set();
  const roots = [...document.querySelectorAll(rootSelector)].filter((r) => shown(r));
  for (const root of roots) {
    const all = [];
    const gather = (el) => {
      if (el instanceof SVGElement || el.matches(SKIP) || !shown(el)) return;
      all.push(el);
      for (const kid of el.children) gather(kid);
    };
    if (!root.closest(SKIP)) gather(root);
    for (const p of all) {
      const pr = p.getBoundingClientRect();
      if (pr.width < 24 || pr.height < 4) continue;
      if (pr.right < 0 || pr.left > innerWidth || pr.bottom < 0 || pr.top > innerHeight) continue;
      const s = css(p);
      const kids = flowKids(p);
      if (!kids.length) continue;
      const c = content(p);
      if (c.w < 24 || scrollsX(p)) continue;
      if (s.overflowX === 'visible' && !/inline/.test(s.display)) {
        let u = null;
        for (const k of kids) { if (!k.matches('svg, img') && k.getBoundingClientRect().width > 0) u = union(u, box(k.getBoundingClientRect())); }
        if (u) {
          const overL = c.l - u.l;
          const overR = u.r - c.r;
          if ((overR > TOL && overL < 1) || (overL > TOL && overR < 1)) add(p, `${name(p)} spills ${fmt(Math.max(overL, overR))} px past its ${overR > overL ? 'right' : 'left'} edge only`);
        }
      }
      const isFlex = /flex$/.test(s.display);
      const isGrid = /grid$/.test(s.display);
      const row = isFlex && !s.flexDirection.startsWith('column');
      if (row && /center|space-around|space-evenly/.test(s.justifyContent)) {
        const lines = new Map();
        const texts = [...p.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => { range.selectNodeContents(n); return range.getBoundingClientRect(); });
        for (const r of [...kids.map((k) => k.getBoundingClientRect()), ...texts]) {
          const key = [...lines.keys()].find((t) => Math.abs(t - r.top) < r.height / 2) ?? r.top;
          lines.set(key, union(lines.get(key), box(r)));
        }
        for (const u of lines.values()) {
          const w = u.r - u.l;
          if (w > c.w - 1) continue;
          const d = (u.l + u.r) / 2 - c.c;
          if (Math.abs(d) > TOL) add(p, `${name(p)} centers its row but the row sits ${fmt(d)} px off (${fmt(u.l - c.l)} left, ${fmt(c.r - u.r)} right)`);
        }
      }
      const oneRow = (row && s.flexWrap === 'nowrap') || (isGrid && !stacked(kids) && kids.every((k, i) => { const a = k.getBoundingClientRect(); const b = kids[0].getBoundingClientRect(); return a.top < b.bottom && b.top < a.bottom; }));
      if (oneRow && /center/.test(s.alignItems) && kids.length >= 2 && kids.every((k) => /auto|center/.test(css(k).alignSelf))) {
        const mids = kids.map((k) => { const i = ink(k); return i ? { k, m: (i.t + i.b) / 2, h: i.b - i.t } : null; }).filter((x) => x && x.h > 4);
        const tall = mids.filter((x) => !x.k.matches('svg, img') && x.k.querySelector('button, .btn, .segmented, input, select') || x.k.matches('button, .btn, .segmented, input, select'));
        if (tall.length >= 2) {
          const ms = tall.map((x) => x.m);
          const spread = Math.max(...ms) - Math.min(...ms);
          if (spread > 3) add(p, `${name(p)} lines its controls up on the center but they sit ${fmt(spread)} px apart vertically`);
        }
      }
      if (isFlex && !row) {
        for (const k of kids) {
          const ks = css(k);
          const self = ks.alignSelf === 'auto' ? s.alignItems : ks.alignSelf;
          if (!/^(center|safe center)$/.test(self)) continue;
          const r = k.getBoundingClientRect();
          if (r.width > c.w - 1) continue;
          const d = (r.left + r.right) / 2 - c.c;
          if (Math.abs(d) > TOL) add(k, `${name(k)} should be centered in its column but is ${fmt(d)} px off`);
        }
      }
      if (isGrid) {
        const tracks = s.gridTemplateColumns.trim().split(/\s+/);
        const single = tracks.length === 1 && Math.abs(parseFloat(tracks[0]) - c.w) < 2;
        for (const k of kids) {
          const ks = css(k);
          const self = ks.justifySelf === 'auto' || ks.justifySelf === 'normal' ? s.justifyItems : ks.justifySelf;
          if (!single || !/center/.test(self)) continue;
          const r = k.getBoundingClientRect();
          if (r.width > c.w - 1) continue;
          const d = (r.left + r.right) / 2 - c.c;
          if (Math.abs(d) > TOL) add(k, `${name(k)} should be centered in its grid but is ${fmt(d)} px off`);
        }
      }
      if (!isFlex && !isGrid && /center/.test(s.textAlign)) {
        const inline = kids.filter((k) => /^inline-(block|flex|grid|table)$|^inline$/.test(css(k).display) && painted(k));
        for (const k of inline) {
          const r = k.getBoundingClientRect();
          const mates = [...p.childNodes].filter((n) => n !== k && (n.nodeType === 1 ? shown(n) && css(n).position !== 'absolute' : n.textContent.trim()));
          const alone = mates.every((n) => {
            let rr;
            if (n.nodeType === 3) { range.selectNodeContents(n); rr = range.getBoundingClientRect(); } else rr = n.getBoundingClientRect();
            return !(rr.width > 0 && rr.top < r.bottom - 1 && r.top < rr.bottom - 1);
          });
          if (!alone || r.width > c.w - 1) continue;
          const d = (r.left + r.right) / 2 - c.c;
          if (Math.abs(d) > TOL) add(k, `${name(k)} sits on a centered line but is ${fmt(d)} px off`);
        }
      }
      if (vertical(p) && kids.length >= 2 && stacked(kids)) {
        const info = kids.map((k) => {
          const i = ink(k);
          if (!i) return null;
          const w = i.r - i.l;
          return { k, i, w, d: (i.l + i.r) / 2 - c.c, narrow: w < c.w - 8, left: Math.abs(i.l - c.l) <= TOL, right: Math.abs(i.r - c.r) <= TOL };
        }).filter(Boolean);
        const selfLeft = (x) => { const cc = content(x.k); return Math.abs(x.i.l - cc.l) <= TOL || Math.abs(x.i.l - c.l) <= TOL; };
        const meant = (x) => {
          const ks = css(x.k);
          const kr = x.k.getBoundingClientRect();
          if (kr.width < c.w - 2 * TOL) return true;
          if (/center/.test(ks.textAlign)) return true;
          if (/flex$/.test(ks.display)) return ks.flexDirection.startsWith('column') ? /center/.test(ks.alignItems) : /center/.test(ks.justifyContent);
          if (/grid$/.test(ks.display)) return /center/.test(ks.justifyItems) || /center/.test(ks.justifyContent);
          return false;
        };
        const centered = info.filter((x) => x.narrow && Math.abs(x.d) <= TOL && meant(x));
        const lefts = info.filter((x) => x.narrow && Math.abs(x.d) > TOL && selfLeft(x));
        if (centered.length >= 2 && centered.length >= 2 * lefts.length) {
          for (const x of info) {
            if (Math.abs(x.d) <= TOL || x.w > c.w - 2 * TOL) continue;
            if (x.k.matches('label, .field, .field-label, .field-hint, .section-label, .sheet-label') && x.left) continue;
            const kr = x.k.getBoundingClientRect();
            if (kr.width > c.w - 2 * TOL && !x.k.matches('button, .btn') && (flowKids(x.k).length !== 1 || !x.k.querySelector('button, .btn, .segmented') || css(x.k).gridTemplateColumns.trim().split(/\s+/).length > 1)) continue;
            add(x.k, `${name(x.k)} is ${fmt(x.d)} px off center while its siblings are centered`);
          }
        }
        const isAction = (k) => k.matches('.btn, .pcx-btn, .segmented, .buy, .seg-wrap') || (flowKids(k).length > 0 && flowKids(k).length <= 3 && flowKids(k).every((b) => b.matches('.btn, .pcx-btn, .buy, .segmented')));
        const refs = info.filter((x) => !isAction(x.k) && x.w >= c.w * 0.9 && (x.k.matches('input, select, textarea, .field-box, .field, .find, p, h1, h2, h3, h4') || x.k.querySelector('input:not([type="checkbox"], [type="radio"], [type="range"]), select, textarea, .field-box') || !x.k.querySelector('button')));
        const fl = refs.length ? Math.min(...refs.map((x) => painted(x.k) ? x.i.l : x.k.getBoundingClientRect().left)) : 0;
        const fr = refs.length ? Math.max(...refs.map((x) => painted(x.k) ? x.i.r : x.k.getBoundingClientRect().right)) : 0;
        if (refs.length && Math.abs((fl + fr) / 2 - c.c) <= TOL) {
          for (const x of info) {
            if (refs.includes(x) || !isAction(x.k)) continue;
            if (x.w >= fr - fl - TOL || x.w < (fr - fl) * 0.55) continue;
            const btns = x.k.matches('.btn, .pcx-btn, .buy, .segmented') ? [x.k] : flowKids(x.k);
            const stretched = btns.some((b) => {
              if (b.matches('.segmented')) return x.k !== b;
              let u = null;
              for (const n of b.childNodes) {
                if (n.nodeType === 3 && n.textContent.trim()) { range.selectNodeContents(n); u = union(u, box(range.getBoundingClientRect())); }
                else if (n.nodeType === 1 && shown(n) && css(n).position !== 'absolute') u = union(u, box(n.getBoundingClientRect()));
              }
              return u && content(b).w - (u.r - u.l) > 16;
            });
            if (!stretched) continue;
            const d = (x.i.l + x.i.r) / 2 - (fl + fr) / 2;
            if (Math.abs(d) > TOL) add(x.k, `${name(x.k)} is ${fmt(fr - fl - x.w)} px narrower than the content above it and ${fmt(d)} px off its center`);
          }
        }
        for (const x of info) {
          if (!painted(x.k) || x.k.matches('svg, img, input, select, textarea, hr')) continue;
          const r = x.k.getBoundingClientRect();
          const a = r.left - c.l;
          const b = c.r - r.right;
          if (r.width < c.w * 0.5 || a < -TOL || b < -TOL) continue;
          if (a > TOL && b > TOL && Math.abs(a - b) > TOL) add(x.k, `${name(x.k)} has uneven side margins (${fmt(a)} left, ${fmt(b)} right)`);
          if (a <= TOL && b > TOL && b < c.w * 0.12 && info.filter((y) => y !== x && painted(y.k) && y.k.getBoundingClientRect().width > c.w - TOL).length) add(x.k, `${name(x.k)} stops ${fmt(b)} px short of the right edge its siblings reach`);
        }
      }
      if ((isGrid && s.gridTemplateColumns.trim().split(/\s+/).length > 1) || (row && s.flexWrap === 'wrap')) {
        const rows = new Map();
        for (const k of kids) {
          const r = k.getBoundingClientRect();
          const key = [...rows.keys()].find((t) => Math.abs(t - r.top) < 2) ?? r.top;
          const list = rows.get(key) ?? [];
          list.push(r);
          rows.set(key, list);
        }
        const moving = kids.some((k) => k.getAnimations().some((a) => a.playState === 'running') || css(k).transform !== 'none');
        const widths = kids.map((k) => k.getBoundingClientRect().width);
        const even = Math.max(...widths) <= Math.min(...widths) * 1.08 + 1;
        if (!moving && rows.size >= 2 && even && [...rows.values()].some((r) => r.length >= 2)) {
          const first = [...rows.entries()].sort((a, b) => a[0] - b[0])[0][1];
          const l = Math.min(...first.map((r) => r.left));
          const rr = Math.max(...first.map((r) => r.right));
          const left = l - c.l;
          const right = c.r - rr;
          const gap = parseFloat(s.columnGap) || 0;
          if (Math.abs(left - right) > Math.max(12, gap + TOL) && Math.max(left, right) > 12) add(p, `${name(p)} leaves its spare room on one side (${fmt(left)} left, ${fmt(right)} right)`);
        }
      }
    }
    for (const b of all.filter((n) => n.matches('button, .icon-btn, a.btn, [role="button"]'))) {
      if (icons.has(b) || b.closest(SKIP) || !shown(b)) continue;
      icons.add(b);
      let text = false;
      for (const node of b.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim()) text = true;
        if (node.nodeType === 1 && shown(node) && css(node).position !== 'absolute' && node.textContent.trim() && !node.matches('svg')) text = true;
      }
      if (text) continue;
      const svgs = [...b.querySelectorAll('svg')].filter((v) => shown(v) && css(v).position !== 'absolute' && !v.parentElement.closest('svg') && !v.closest('.chip, .badge, .nb, .count'));
      if (svgs.length !== 1) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 12 || r.width > 96) continue;
      const v = svgs[0].getBoundingClientRect();
      const bs = css(b);
      const cx = r.left + parseFloat(bs.borderLeftWidth) + parseFloat(bs.paddingLeft) + (r.width - parseFloat(bs.borderLeftWidth) - parseFloat(bs.borderRightWidth) - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight)) / 2;
      const cy = r.top + parseFloat(bs.borderTopWidth) + parseFloat(bs.paddingTop) + (r.height - parseFloat(bs.borderTopWidth) - parseFloat(bs.borderBottomWidth) - parseFloat(bs.paddingTop) - parseFloat(bs.paddingBottom)) / 2;
      const dx = (v.left + v.right) / 2 - cx;
      const dy = (v.top + v.bottom) / 2 - cy;
      if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) add(b, `the icon in ${name(b)} is off center (${fmt(dx)}, ${fmt(dy)})`);
    }
  }
  return [...new Set(issues)];
}
