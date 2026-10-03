import { mkdirSync, writeFileSync } from 'node:fs';
import { crest } from '../src/data/logos/crest.js';
import { folio } from '../src/data/logos/folio.js';
import { wikilink } from '../src/data/logos/wikilink.js';
import { fan } from '../src/data/logos/fan.js';
import { facet } from '../src/data/logos/facet.js';
import { WORDMARK_HEIGHT, WORDMARK_WIDTH, wordmarkMarkup } from '../src/data/logos/wordmark.js';
import { LOGO } from '../src/data/logo.js';

const CONCEPTS = [folio, wikilink, fan, facet];
const DARK = '#0b0c14';
const LIGHT = '#f6f4ee';
const INK = '#14151f';

let n = 0;
const uid = (p) => `${p}${++n}`;

function mark(logo, { size, mono = false, color = null, detail = null }) {
  const text = detail ?? size >= 48;
  const colors = mono ? {} : logo.ground;
  const style = mono && color ? ` style="color:${color}"` : '';
  return `<svg viewBox="${logo.viewBox}" width="${size}" height="${size}" role="img" aria-label="${logo.name}"${style}>${logo.markup({ id: uid(logo.id), text, mono, ...colors })}</svg>`;
}

function file(logo, mono) {
  const body = logo.markup({ id: logo.id, text: true, mono, ...(mono ? {} : logo.ground) });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo.viewBox}" width="256" height="256"${mono ? ' color="#14151f"' : ''}>${body}</svg>\n`;
}

function wordmark(height, color) {
  const width = (WORDMARK_WIDTH / WORDMARK_HEIGHT) * height;
  return `<svg viewBox="-4 0 ${WORDMARK_WIDTH + 8} ${WORDMARK_HEIGHT}" width="${width.toFixed(1)}" height="${height}" aria-label="Wikster">${wordmarkMarkup({ id: uid('wm'), color })}</svg>`;
}

function lockups(logo, ground, ink, mono) {
  const color = mono ? ink : null;
  return `<div class="lock" style="background:${ground};color:${ink}">
      <div class="h">${mark(logo, { size: 72, mono, color })}${wordmark(30, ink)}</div>
      <div class="v">${mark(logo, { size: 96, mono, color })}${wordmark(22, ink)}</div>
    </div>`;
}

function sizes(logo, ground, ink, mono) {
  return `<div class="sizes" style="background:${ground}">${[16, 32, 64, 256].map((s) => `<figure>${mark(logo, { size: s, mono, color: ink })}<figcaption style="color:${ink}">${s}</figcaption></figure>`).join('')}</div>`;
}

function icons(logo) {
  const tile = (shape, size) => `<div class="tile ${shape}" style="width:${size}px;height:${size}px;background:${logo.ground.outer}">${mark(logo, { size: Math.round(size * (shape === 'circle' ? 0.6 : 0.66)), detail: size >= 96 })}</div>`;
  return `<div class="icons">${tile('squircle', 180)}${tile('circle', 180)}${tile('squircle', 64)}${tile('circle', 48)}
      <div class="tab"><span class="fav">${mark(logo, { size: 16 })}</span><span>Wikster</span><i></i></div>
      <div class="tab light"><span class="fav">${mark(logo, { size: 16 })}</span><span>Wikster</span><i></i></div>
    </div>`;
}

function section(logo, current = false) {
  return `<section class="concept" id="${logo.id}">
    <header><h2>${current ? 'Before: ' : ''}${logo.name}${logo.id === LOGO.id ? ' (chosen, in the game now)' : ''}</h2><p>${logo.idea ?? 'The crest the game shipped with before the Hand, kept here to compare against.'}</p>
      ${current ? '' : `<p class="file">design/logos/${logo.id}.svg, design/logos/${logo.id}-mono.svg, src/data/logos/${logo.id}.js</p>`}</header>
    <h3>Sizes, colour</h3>
    <div class="pair">${sizes(logo, DARK, '#eef0f6', false)}${sizes(logo, LIGHT, INK, false)}</div>
    <h3>One colour</h3>
    <div class="pair">${sizes(logo, DARK, '#eef0f6', true)}${sizes(logo, LIGHT, INK, true)}</div>
    <h3>App icon and tab</h3>
    ${icons(logo)}
    ${current ? '' : `<h3>Wordmark lockups</h3>
    <div class="pair">${lockups(logo, DARK, '#eef0f6', false)}${lockups(logo, LIGHT, INK, false)}</div>
    <div class="pair">${lockups(logo, DARK, '#eef0f6', true)}${lockups(logo, LIGHT, INK, true)}</div>`}
  </section>`;
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wikster logo concepts</title>
<style>
  :root { --bg: #f2f1ec; --panel: #ffffff; --ink: #1a1b24; --dim: #5d6170; --line: #dddbd2; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #101119; --panel: #171824; --ink: #eceef5; --dim: #9aa0b2; --line: #2a2c3c; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #101119; --panel: #171824; --ink: #eceef5; --dim: #9aa0b2; --line: #2a2c3c; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 1180px; margin: 0 auto; padding: 32px 16px 80px; }
  h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .lead { color: var(--dim); max-width: 70ch; margin: 0 0 18px; }
  nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
  nav a { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink); text-decoration: none; background: var(--panel); }
  .concept { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 22px; margin-bottom: 28px; }
  .concept header h2 { margin: 0; font-size: 22px; }
  .concept header p { margin: 4px 0 0; color: var(--dim); max-width: 75ch; }
  .concept .file { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--dim); margin: 22px 0 10px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  @media (max-width: 760px) { .pair { grid-template-columns: 1fr; } }
  .sizes { display: flex; align-items: flex-end; gap: 22px; padding: 18px; border-radius: 12px; overflow-x: auto; }
  .sizes figure { margin: 0; display: grid; justify-items: center; gap: 6px; }
  .sizes figure svg[width="256"] { width: min(256px, 34vw); height: auto; }
  .sizes figcaption { font-size: 11px; opacity: 0.6; }
  .icons { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; }
  .tile { display: grid; place-items: center; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); }
  .tile.squircle { border-radius: 23%; }
  .tile.circle { border-radius: 50%; }
  .tab { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 10px 10px 0 0; background: #24263a; color: #e6e8f2; font-size: 13px; min-width: 170px; }
  .tab.light { background: #e8e6df; color: #23242f; }
  .tab i { margin-left: auto; width: 8px; height: 8px; border-radius: 2px; background: currentColor; opacity: 0.3; }
  .fav { display: grid; }
  .lock { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-around; gap: 24px; padding: 24px 18px; border-radius: 12px; }
  .lock .h { display: flex; align-items: center; gap: 16px; }
  .lock .v { display: grid; justify-items: center; gap: 12px; }
  .lock svg { max-width: 100%; height: auto; }
  .swap { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 18px 22px; }
  code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; background: color-mix(in srgb, var(--ink) 8%, transparent); padding: 1px 5px; border-radius: 5px; }
</style>
</head>
<body>
<main>
  <h1>Wikster logo concepts</h1>
  <p class="lead">Four new marks drawn by hand on a 64 unit grid, flat colour, no effects. Each one has a detailed cut for 48 px and up and a simpler cut for small sizes, a one colour version, an app icon and a geometric wordmark built from the same stroke. Every colour version takes the theme tint through <code>--logo-inner</code> and <code>--logo-outer</code>, like the crest does today.</p>
  <nav>${CONCEPTS.map((c) => `<a href="#${c.id}">${c.name}</a>`).join('')}<a href="#crest">Before: ${crest.name}</a></nav>
  ${CONCEPTS.map((c) => section(c)).join('\n')}
  ${section(crest, true)}
  <div class="swap"><h3>Swapping it</h3><p>The game uses <b>${LOGO.name}</b>. One line in <code>src/data/logo.js</code> picks the mark: <code>import { ${LOGO.id} as LOGO } from './logos/${LOGO.id}.js';</code>. The menu, sign in, splash, PC shell, intro, favicon and store art follow it. Then <code>node tools/icons.mjs</code> (web icons and the favicons of the static pages) and <code>node tools/desktop-icons.mjs</code> (Tauri). The Android launcher, themed and notification icons come from <code>node tools/android-icons.mjs</code>, which draws the Hand from its geometry in <code>src/data/logos/fan.js</code>.</p></div>
</main>
</body>
</html>
`;

mkdirSync('design/logos', { recursive: true });
for (const logo of CONCEPTS) {
  writeFileSync(`design/logos/${logo.id}.svg`, file(logo, false));
  writeFileSync(`design/logos/${logo.id}-mono.svg`, file(logo, true));
}
writeFileSync('design/logos/wordmark.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 0 ${WORDMARK_WIDTH + 8} ${WORDMARK_HEIGHT}" width="${(WORDMARK_WIDTH + 8) * 2}" height="${WORDMARK_HEIGHT * 2}">${wordmarkMarkup({ id: 'wm', color: INK })}</svg>\n`);
writeFileSync('design/logo-concepts.html', page);
console.log(`design/logo-concepts.html and ${CONCEPTS.length * 2 + 1} svg files`);
