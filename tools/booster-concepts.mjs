import { mkdirSync, writeFileSync } from 'node:fs';
import { THEME_PACKS } from '../src/data/packs.js';
import { RARITIES } from '../src/data/rarities.js';
import * as next from '../src/data/emblems-next.js';
import * as now from '../src/data/emblems-classic.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CODES = [
  ['laugh', 'Friend 1', '#3b82f6', '#0b2a6b'],
  ['lamassu', 'Friend 2', '#f472b6', '#6b1f4a'],
  ['pixelheart', 'Friend 3', '#1e90ff', '#0b2f66'],
  ['dice', 'Friend 4', '#a855f7', '#3b0f6b'],
  ['wheel', 'Friend 5', '#d8c39a', '#5c4426'],
  ['openbook', 'Friend 6', '#2dd4bf', '#0f4c47'],
  ['pot', 'Friend 7', '#a78bfa', '#3b1f6b'],
  ['rotor', 'Friend 8', '#0000ff', '#00003d'],
  ['erdtree', 'Friend 9', '#c8102e', '#3a0710'],
  ['algorithm', 'Friend 10', '#00e5a8', '#002b22'],
  ['hellfire', 'The Creator', '#fa8072', '#5b1717'],
  ['seal', 'The Creator', '#fbbf24', '#7c2d12']
];

const PACKS = [
  ...THEME_PACKS.map((p) => ({ group: 'Themes', emblem: p.emblem ?? p.id, name: p.name.en, accent: p.accent, accent2: p.accent2 })),
  { group: 'Generic, tier and timed', emblem: 'open', name: 'Booster', accent: '#94a3b8', accent2: '#334155' },
  { group: 'Generic, tier and timed', emblem: 'timed', name: 'Timed', accent: '#38bdf8', accent2: '#0c4a6e' },
  ...['rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic'].map((id) => {
    const r = RARITIES.find((x) => x.id === id);
    return { group: 'Generic, tier and timed', emblem: 'gem', name: r.name.en, accent: r.color, accent2: '#1e2233', tier: true };
  }),
  ...[['Minecraft', '#4ade80', '#14532d', 3], ['Star Wars', '#facc15', '#422006', 9], ['Zelda', '#22d3ee', '#083344', 12], ['Pokémon', '#f87171', '#450a0a', 5]]
    .map(([name, accent, accent2, spin]) => ({ group: 'Custom', monogram: name.charAt(0), spin, name, accent, accent2 })),
  ...CODES.map(([emblem, who, accent, accent2]) => ({ group: 'Code boosters', emblem, name: `${who}`, accent, accent2 }))
];

const art = (lib, p, size) => (p.monogram ? lib.monogramSvg(p.monogram, p.spin, { size }) : lib.emblemSvg(p.emblem, { size }));
const vars = (p) => `--accent:${p.accent};--accent2:${p.accent2}`;

function pack(p) {
  return `<div class="pack${p.tier ? ' is-tier' : ''}" style="${vars(p)}">
      <div class="pack-body"><div class="pack-sheen"></div>
        <div class="pack-ring"></div>
        <div class="pack-art">${art(next, p, 96)}</div>
        <b>${esc(p.name)}</b><small>5 cards</small>
      </div>
    </div>`;
}

const groups = [...new Set(PACKS.map((p) => p.group))];
const shelf = groups.map((g) => `<h3>${g}</h3><div class="shelf">${PACKS.filter((p) => p.group === g).map(pack).join('')}</div>`).join('');

const small = PACKS.map((p) => `<div class="mini" style="${vars(p)}">${[20, 28, 40].map((s) => art(next, p, s)).join('')}<span>${esc(p.name)}</span></div>`).join('');

const compare = PACKS.filter((p, i, all) => all.findIndex((q) => (q.emblem ?? 'custom') === (p.emblem ?? 'custom')) === i)
  .map((p) => `<div class="pair" style="${vars(p)}"><div>${art(now, p, 72)}<i>now</i></div><div>${art(next, p, 72)}<i>new</i></div><span>${esc(p.emblem ?? 'custom')}</span></div>`).join('');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wikster booster emblems</title>
<style>
  :root { --bg: #f2f1ec; --panel: #ffffff; --ink: #1a1b24; --dim: #5d6170; --line: #dddbd2; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #101119; --panel: #171824; --ink: #eceef5; --dim: #9aa0b2; --line: #2a2c3c; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #101119; --panel: #171824; --ink: #eceef5; --dim: #9aa0b2; --line: #2a2c3c; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 1240px; margin: 0 auto; padding: 32px 16px 80px; }
  h1 { font-size: 28px; margin: 0 0 6px; }
  h2 { font-size: 20px; margin: 0 0 4px; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: inherit; opacity: 0.65; margin: 22px 0 10px; }
  .lead { color: var(--dim); max-width: 75ch; margin: 0 0 18px; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 22px; margin-bottom: 26px; }
  .panel > p { color: var(--dim); margin: 0 0 8px; max-width: 75ch; }
  .stage { border-radius: 12px; padding: 4px 18px 22px; }
  .stage.dark { background: radial-gradient(120% 80% at 50% 0%, #1b1d33, #090a12); color: #e8eaf4; }
  .stage.light { background: radial-gradient(120% 80% at 50% 0%, #ffffff, #e9e5da); color: #1d1e29; }
  .toggle { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); margin-bottom: 14px; }
  .toggle button { border: 0; border-radius: 999px; padding: 6px 14px; background: transparent; color: var(--ink); font: inherit; cursor: pointer; }
  .toggle button[aria-pressed="true"] { background: var(--ink); color: var(--bg); }
  .shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 18px 14px; }
  .pack { --e2: var(--accent); --e3: var(--accent2); --e1: color-mix(in srgb, var(--accent) 42%, #ffffff); aspect-ratio: 0.68; filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.35)); }
  .pack-body { position: relative; height: 100%; display: grid; grid-template-rows: 1fr auto auto; justify-items: center; padding: 16% 8% 14%; overflow: hidden; color: #fff;
    background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 78%, #ffffff 8%), color-mix(in srgb, var(--accent) 40%, var(--accent2)) 45%, var(--accent2));
    clip-path: polygon(0 3%, 4% 0, 8% 3%, 12% 0, 16% 3%, 20% 0, 24% 3%, 28% 0, 32% 3%, 36% 0, 40% 3%, 44% 0, 48% 3%, 52% 0, 56% 3%, 60% 0, 64% 3%, 68% 0, 72% 3%, 76% 0, 80% 3%, 84% 0, 88% 3%, 92% 0, 96% 3%, 100% 0, 100% 100%, 96% 97%, 92% 100%, 88% 97%, 84% 100%, 80% 97%, 76% 100%, 72% 97%, 68% 100%, 64% 97%, 60% 100%, 56% 97%, 52% 100%, 48% 97%, 44% 100%, 40% 97%, 36% 100%, 32% 97%, 28% 100%, 24% 97%, 20% 100%, 16% 97%, 12% 100%, 8% 97%, 4% 100%, 0 97%);
    border-radius: 4px; }
  .pack-sheen { position: absolute; inset: 0; background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.28) 44%, transparent 56%), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0 2px, transparent 2px 7px); pointer-events: none; }
  .pack-ring { position: absolute; left: 50%; top: 40%; width: 80%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%;
    background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 72%);
    border: 2px solid color-mix(in srgb, var(--e1) 70%, transparent); box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.45), 0 0 0 2px color-mix(in srgb, var(--accent2) 80%, transparent); }
  .pack.is-tier .pack-ring { border-color: var(--accent); box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 70%, transparent), inset 0 0 18px rgba(0, 0, 0, 0.45); }
  .pack-art { position: relative; align-self: center; width: 70%; margin-top: -14%; filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.5)); }
  .pack-art svg { width: 100%; height: auto; display: block; }
  .pack b { position: relative; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; text-align: center; line-height: 1.15; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
  .pack small { position: relative; font-size: 10px; opacity: 0.8; letter-spacing: 0.08em; text-transform: uppercase; }
  .minis { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
  .mini { --e2: var(--accent); --e3: var(--accent2); --e1: color-mix(in srgb, var(--accent) 42%, #ffffff); display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; background: color-mix(in srgb, var(--accent2) 30%, transparent); font-size: 12px; }
  .stage.light .mini { background: color-mix(in srgb, var(--accent) 14%, #ffffff); }
  .mini span { margin-left: auto; opacity: 0.75; text-align: right; }
  .pairs { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
  .pair { --e2: var(--accent); --e3: var(--accent2); --e1: color-mix(in srgb, var(--accent) 42%, #ffffff); display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px; border-radius: 12px; background: color-mix(in srgb, var(--accent2) 45%, #0b0c14); color: #e8eaf4; }
  .pair > div { display: grid; justify-items: center; }
  .pair i { font-style: normal; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.6; }
  .pair span { grid-column: 1 / -1; text-align: center; font-size: 12px; opacity: 0.8; }
  code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; background: color-mix(in srgb, var(--ink) 8%, transparent); padding: 1px 5px; border-radius: 5px; }
  ul { margin: 6px 0 0; padding-left: 20px; color: var(--dim); }
</style>
</head>
<body>
<main>
  <h1>Wikster booster emblems</h1>
  <p class="lead">One family for every booster: a thick dark outline like an enamel pin, two tones that come from the pack's own colours (<code>--e1</code>, <code>--e2</code>, <code>--e3</code>, the same variables the boosters set today), a light foil band across the main shape, one white glint and a soft shadow under each object. Everything is drawn on the same 120 unit grid, so the icons sit at the same visual size and still read at 20 px.</p>
  <section class="panel">
    <h2>On the packs</h2>
    <p>The mockups use each pack's real accent colours from <code>src/data/packs.js</code>, the tier colours and the code booster colours.</p>
    <div class="toggle" role="group" aria-label="Background"><button type="button" data-bg="dark" aria-pressed="true">Dark</button><button type="button" data-bg="light" aria-pressed="false">Light</button></div>
    <div class="stage dark" id="stage">${shelf}</div>
  </section>
  <section class="panel">
    <h2>Small sizes</h2>
    <p>20, 28 and 40 px, the sizes used in lists, the binder and the albums.</p>
    <div class="stage dark"><div class="minis">${small}</div></div>
    <div class="stage light" style="margin-top:12px"><div class="minis">${small}</div></div>
  </section>
  <section class="panel">
    <h2>Now and new</h2>
    <p>Same subject per pack as today, so nothing changes meaning.</p>
    <div class="pairs">${compare}</div>
  </section>
  <section class="panel">
    <h2>Swapping them in</h2>
    <p>One line in <code>src/data/emblems.js</code>: <code>export * from './emblems-classic.js';</code> becomes <code>export * from './emblems-next.js';</code>. Packs, card backs, the binder, albums, the quiz and the index all take the new set. Both sets have the same ids and the same functions.</p>
  </section>
</main>
<script>
  document.querySelectorAll('[data-bg]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.getElementById('stage').className = 'stage ' + b.dataset.bg;
      document.querySelectorAll('[data-bg]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
    });
  });
</script>
</body>
</html>
`;

mkdirSync('design/boosters', { recursive: true });
for (const id of Object.keys(next.EMBLEMS)) {
  const body = next.emblemSvg(id, { size: 240 }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" style="--e1:#c7d2fe;--e2:#6366f1;--e3:#1e1b4b" ');
  writeFileSync(`design/boosters/${id}.svg`, `${body}\n`);
}
writeFileSync('design/booster-concepts.html', page);
console.log(`design/booster-concepts.html and ${Object.keys(next.EMBLEMS).length} svg files`);
