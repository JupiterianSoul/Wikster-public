import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createConnection } from 'node:net';
import { createServer, request } from 'node:http';
import { chromium, devices } from 'playwright';
import { launchOptions } from '../tests/lib/browser.mjs';
import { RELEASES } from '../src/data/releases.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const PROFILES = {
  mid: { cpu: 4, latency: 150, kbps: 1600, name: 'mid phone, slow 4G' },
  low: { cpu: 6, latency: 300, kbps: 750, name: 'low end phone, 3G' }
};
const PROFILE = PROFILES[option('profile', 'mid')] ?? PROFILES.mid;
const RUNS = Number(option('runs', 3));
const PORT = Number(option('port', process.env.PORT || 4790));
const CPU = Number(option('cpu', PROFILE.cpu));
const LATENCY = Number(option('latency', PROFILE.latency));
const KBPS = Number(option('kbps', PROFILE.kbps));
const FIRST = flag('first');
const OUT = option('out', 'tests/out/dist-perfboot');
const REF = option('ref', null);
const AGAINST = option('against', REF ? 'tests/out/dist-perfboot-ref' : null);
const PC = flag('pc');
const CARDS = Number(option('cards', 400));
const NET = { latency: LATENCY, downloadThroughput: Math.round(KBPS * 1024 / 8 * 0.9) };

const portOpen = (port) => new Promise((done) => {
  const sock = createConnection({ port, host: '127.0.0.1' });
  sock.once('connect', () => { sock.end(); done(true); });
  sock.once('error', () => done(false));
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync('tests/out', { recursive: true });
if (!flag('no-build')) execSync(`node tests/build.mjs offline ${OUT}`, { stdio: 'inherit' });
if (REF && !flag('no-build')) {
  const tree = mkdtempSync(join(tmpdir(), 'perfboot-'));
  execSync(`git archive ${REF} | tar -x -C ${tree}`, { stdio: 'inherit' });
  symlinkSync(resolve('node_modules'), join(tree, 'node_modules'));
  execSync(`node tests/build.mjs offline ${resolve(AGAINST)}`, { cwd: tree, stdio: 'inherit' });
  rmSync(tree, { recursive: true, force: true });
}

let slow = true;
let pipeFree = 0;
const paced = (bytes) => {
  const start = Math.max(Date.now(), pipeFree);
  pipeFree = start + (bytes / NET.downloadThroughput) * 1000;
  return Math.max(0, pipeFree - Date.now());
};

async function serve(dir, port) {
  if (await portOpen(port) || await portOpen(port + 1)) { console.error(`port ${port} or ${port + 1} is busy (use --port=)`); process.exit(2); }
  const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dir, '--host', '127.0.0.1', '--port', String(port + 1), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await portOpen(port + 1)); i++) await wait(250);
  const proxy = createServer((req, res) => {
    const upstream = request({ host: '127.0.0.1', port: port + 1, path: req.url, method: req.method, headers: req.headers }, (up) => {
      setTimeout(async () => {
        res.writeHead(up.statusCode, up.headers);
        for await (const chunk of up) {
          if (res.destroyed) { up.destroy(); return; }
          const delay = slow ? paced(chunk.length) : 0;
          if (delay) await wait(delay);
          res.write(chunk);
        }
        res.end();
      }, slow ? NET.latency : 0);
    });
    upstream.on('error', () => { res.statusCode = 502; res.end(); });
    req.pipe(upstream);
  });
  await new Promise((done) => proxy.listen(port, '127.0.0.1', done));
  return { base: `http://127.0.0.1:${port}/`, stop: () => { proxy.close(); preview.kill(); } };
}

const targets = [{ name: 'now', dir: OUT }];
if (AGAINST) targets.unshift({ name: REF ? `before (${REF})` : 'before', dir: AGAINST });
for (const [i, target] of targets.entries()) Object.assign(target, await serve(target.dir, PORT + i * 2), { runs: [] });

const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const PACKS = ['animals', 'space', 'history', 'art', 'food', 'music'];
const entries = {};
for (let i = 0; i < CARDS; i++) {
  const key = `en:Boot_${i}`;
  entries[key] = {
    key, title: `Boot card ${i}`, rarityId: TIERS[i % TIERS.length], price: 100 + (i % 400) * 13, views: 1000 + i,
    popularity: 0.6, count: 1, packId: `theme|${PACKS[i % PACKS.length]}`, packName: PACKS[i % PACKS.length], lang: 'en',
    thumbnail: `https://upload.wikimedia.org/boot/${i}.png`, firstPulledAt: i, lastPulledAt: 1e12 + i,
    description: 'A thing', extract: 'Some words about it, long enough to be read.'
  };
}

const seed = ({ entries, seen, pc }) => {
  if (localStorage.getItem('perfboot.seeded')) return;
  localStorage.setItem('perfboot.seeded', '1');
  localStorage.setItem('wikster.language', 'en');
  localStorage.setItem('wikster.introSeen', '1');
  localStorage.setItem('wikster.seenRelease.v1', seen);
  if (pc) localStorage.setItem('wikster.layout.v1', 'pc');
  const now = Date.now();
  const day = Math.floor(now / 86400000);
  localStorage.setItem('wikster.profile.v1', JSON.stringify({
    started: true, createdAt: now - 86400000 * 40, playMs: 7200000, boostersOpened: 120,
    rarityCounts: { common: 400 }, progress: { level: 12, xp: 20 }, pendingLevels: [],
    daily: { v: 2, day: 3, weeks: 2, lastDay: day, shownDay: day },
    timed: { count: 0, stamp: now, last: now, opened: 4 }, freeTaken: { window: 0, ids: [] },
    settings: { hints: false }
  }));
  localStorage.setItem('wikster.wallet.v1', '1000');
  localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
};

const probe = () => {
  const perf = { marks: {}, long: [], events: [] };
  window.__perf = perf;
  const now = () => performance.now();
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) perf.long.push([Math.round(e.startTime), Math.round(e.duration)]); })
      .observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) perf.events.push([e.name, Math.round(e.startTime), Math.round(e.duration)]); })
      .observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch {}
  addEventListener('wikster:ready', () => { perf.marks.ready ??= now(); });
  addEventListener('DOMContentLoaded', () => { perf.marks.dcl ??= now(); });
  addEventListener('pointerdown', () => { perf.marks.tap ??= now(); }, true);
  const watch = new MutationObserver(() => {
    if (perf.marks.title == null && document.querySelector('.intro-press.is-ready')) perf.marks.title = now();
  });
  watch.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
};

const tabActive = (page, tab) => page.waitForFunction((tab) => document.querySelector(`#screen-${tab}`)?.classList.contains('is-active') && !document.getElementById('intro'), tab, { timeout: 60000, polling: 'raf' });

async function launchOnce(page, label, base) {
  const started = Date.now();
  await page.goto(`${base}?intro=1`, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.__perf?.marks.title != null, null, { timeout: 120000, polling: 50 });
  const box = page.viewportSize();
  if (PC) await page.keyboard.press('Space');
  else await page.mouse.click(box.width / 2, box.height / 2);
  const fresh = await page.waitForFunction(() => !document.getElementById('intro')
    && (document.querySelector('#welcome:not([hidden]) .lang-choice') || document.querySelector('#screen-packs.is-active')), null, { timeout: 60000, polling: 'raf' })
    .then(() => page.evaluate(() => Boolean(document.querySelector('#welcome:not([hidden])')))).catch(() => false);
  let welcome = null;
  if (fresh) {
    welcome = await page.evaluate(() => performance.now());
    await page.click('#welcome .lang-choice[data-lang="en"]');
    await page.waitForSelector('#starter:not([hidden]) #starter-go', { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('#starter-loot.is-loading'), null, { timeout: 60000 });
    await page.click('#starter-go');
  }
  await tabActive(page, 'packs').catch(() => {});
  const home = await page.evaluate(() => performance.now());
  let tabSwitch = null;
  if (!PC) {
    tabSwitch = await page.evaluate(() => new Promise((done) => {
      const start = performance.now();
      document.querySelector('#navbar [data-tab="shop"]')?.click();
      const tick = () => {
        if (document.querySelector('#screen-shop.is-active')) requestAnimationFrame(() => done(performance.now() - start));
        else if (performance.now() - start > 15000) done(null);
        else requestAnimationFrame(tick);
      };
      tick();
    }));
  }
  await page.waitForTimeout(6000);
  const data = await page.evaluate(() => {
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]));
    const res = performance.getEntriesByType('resource');
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = paint['first-contentful-paint'] ?? null;
    const isJs = (r) => /\.m?js(\?|$)/.test(r.name) && r.name.startsWith(location.origin);
    const isCss = (r) => /\.css(\?|$)/.test(r.name);
    const sum = (list, key) => list.reduce((n, r) => n + (r[key] || 0), 0);
    const ready = window.__perf.marks.ready ?? null;
    const jsBeforeFcp = res.filter((r) => isJs(r) && r.responseEnd <= (fcp ?? 0));
    const jsBeforeReady = res.filter((r) => isJs(r) && r.startTime <= (ready ?? 0));
    return {
      marks: window.__perf.marks, fcp, long: window.__perf.long, events: window.__perf.events,
      htmlEnd: nav?.responseEnd ?? null,
      jsFcpBytes: sum(jsBeforeFcp, 'decodedBodySize'), jsFcpCount: jsBeforeFcp.length,
      jsReadyBytes: sum(jsBeforeReady, 'decodedBodySize'), jsReadyWire: sum(jsBeforeReady, 'transferSize'), jsReadyCount: jsBeforeReady.length,
      cssBytes: sum(res.filter(isCss), 'decodedBodySize'),
      requestsBeforeReady: res.filter((r) => r.startTime <= (ready ?? 0)).length,
      requestsAfter: res.filter((r) => r.startTime > (ready ?? 0)).length,
      files: res.filter((r) => r.name.startsWith(location.origin)).map((r) => [r.name.replace(location.origin, '').replace(/^\/(assets\/)?/, ''), Math.round(r.startTime), Math.round(r.responseEnd), r.transferSize, r.decodedBodySize]),
      nodes: document.getElementsByTagName('*').length,
      heap: performance.memory?.usedJSHeapSize ?? null
    };
  });
  const { marks } = data;
  const before = (t) => data.long.filter(([s]) => s < t);
  const after = (t) => data.long.filter(([s]) => s >= t);
  const tbt = (list) => list.reduce((n, [, d]) => n + Math.max(0, d - 50), 0);
  const worstEvent = data.events.filter(([, s]) => s >= (marks.tap ?? 0)).reduce((m, [, , d]) => Math.max(m, d), 0);
  return {
    label, wall: Date.now() - started,
    fcp: data.fcp, html: data.htmlEnd, dcl: marks.dcl, ready: marks.ready, title: marks.title,
    tapToHome: home - marks.tap, playable: home, welcome, tabSwitch,
    longBeforeReady: before(marks.ready ?? 0).length, tbtBeforeReady: tbt(before(marks.ready ?? 0)), longestBeforeReady: Math.max(0, ...before(marks.ready ?? 0).map(([, d]) => d)),
    longAfterTap: after(marks.tap ?? 0).length, tbtAfterTap: tbt(after(marks.tap ?? 0)), longestAfterTap: Math.max(0, ...after(marks.tap ?? 0).map(([, d]) => d)),
    worstEvent, files: data.files,
    jsFcpKB: data.jsFcpBytes / 1024, jsFcpCount: data.jsFcpCount,
    jsReadyKB: data.jsReadyBytes / 1024, jsReadyWireKB: data.jsReadyWire / 1024, jsReadyCount: data.jsReadyCount,
    cssKB: data.cssBytes / 1024, requests: data.requestsBeforeReady, requestsAfter: data.requestsAfter, nodes: data.nodes,
    heapMB: data.heap ? data.heap / 1048576 : null
  };
}

async function shellCached(page) {
  for (let i = 0; i < 240; i++) {
    const ok = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (!reg?.active) return false;
      const keys = await caches.keys();
      return keys.some((k) => k.startsWith('wikster-shell-'));
    }).catch(() => false);
    if (ok) return true;
    await wait(500);
  }
  return false;
}

const browser = await chromium.launch({
  ...launchOptions(),
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']
});

async function session(base) {
  const context = await browser.newContext(PC
    ? { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 }
    : { ...devices['Pixel 7'] });
  if (!FIRST) await context.addInitScript(seed, { entries, seen: RELEASES.at(-1).id, pc: PC });
  else if (PC) await context.addInitScript(() => { try { localStorage.setItem('wikster.layout.v1', 'pc'); } catch {} });
  await context.addInitScript(probe);
  await context.addInitScript(({ effectiveType, rtt, downlink }) => {
    const connection = Object.assign(new EventTarget(), { effectiveType, rtt, downlink, saveData: false });
    try { Object.defineProperty(Navigator.prototype, 'connection', { get: () => connection, configurable: true }); } catch {}
  }, { effectiveType: LATENCY >= 270 || KBPS < 700 ? '3g' : '4g', rtt: LATENCY, downlink: KBPS / 1000 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  slow = true;
  pipeFree = 0;
  const cold = await launchOnce(page, 'cold', base);
  if (flag('trace')) for (const [name, start, end, wire, size] of cold.files) console.log(`  ${String(start).padStart(6)} ${String(end).padStart(6)} ${String(Math.round(wire / 1024)).padStart(5)} KB ${String(Math.round(size / 1024)).padStart(5)} KB  ${name}`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  slow = false;
  const cached = await shellCached(page);
  await wait(1500);
  slow = true;
  pipeFree = 0;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const warm = await launchOnce(page, 'warm', base);
  await context.close();
  return { cold, warm, cached, errors };
}

try {
  for (let i = 0; i < RUNS; i++) {
    for (const target of targets) {
      const r = await session(target.base);
      target.runs.push(r);
      console.log(`${target.name} run ${i + 1}/${RUNS}: cold ready ${Math.round(r.cold.ready)} ms, warm ready ${Math.round(r.warm.ready)} ms${r.cached ? '' : ' (service worker not ready)'}${r.errors.length ? `, errors: ${r.errors.join(' | ')}` : ''}`);
    }
  }
} finally {
  await browser.close();
  for (const target of targets) target.stop();
}

const median = (list) => {
  const xs = list.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
};
const ROWS = [
  ['fcp', 'first contentful paint', 'ms'],
  ['html', 'html received', 'ms'],
  ['dcl', 'DOMContentLoaded', 'ms'],
  ['ready', 'game ready (wikster:ready)', 'ms'],
  ['title', 'title screen interactive', 'ms'],
  ['tapToHome', 'tap to home screen', 'ms'],
  ['welcome', 'welcome screen shown', 'ms'],
  ['playable', 'home playable (from page start)', 'ms'],
  ['tabSwitch', 'first tab switch (shop)', 'ms'],
  ['longBeforeReady', 'long tasks before ready', ''],
  ['tbtBeforeReady', 'blocking time before ready', 'ms'],
  ['longestBeforeReady', 'longest task before ready', 'ms'],
  ['longAfterTap', 'long tasks 6 s after tap', ''],
  ['tbtAfterTap', 'blocking time 6 s after tap', 'ms'],
  ['longestAfterTap', 'longest task after tap', 'ms'],
  ['worstEvent', 'slowest input after tap', 'ms'],
  ['jsFcpKB', 'JS loaded before first paint', 'KB'],
  ['jsReadyKB', 'JS loaded before ready', 'KB'],
  ['jsReadyWireKB', 'JS over the wire before ready', 'KB'],
  ['jsReadyCount', 'JS files before ready', ''],
  ['cssKB', 'CSS loaded', 'KB'],
  ['requests', 'requests before ready', ''],
  ['requestsAfter', 'requests after ready', ''],
  ['nodes', 'DOM nodes', ''],
  ['heapMB', 'JS heap', 'MB']
];
for (const target of targets) {
  target.summary = {};
  for (const kind of ['cold', 'warm']) {
    target.summary[kind] = Object.fromEntries(ROWS.map(([key]) => [key, median(target.runs.map((r) => r[kind][key]))]));
  }
}
const fmt = (v, unit) => v == null ? '-' : `${unit === 'MB' ? v.toFixed(1) : Math.round(v)}${unit ? ` ${unit}` : ''}`;
console.log(`\n${PC ? 'PC' : 'Phone (Pixel 7)'}, ${PROFILE.name}: CPU ${CPU}x slower, ${LATENCY} ms, ${KBPS} kbps, ${FIRST ? 'new player' : `${CARDS} cards`}, median of ${RUNS}`);
for (const kind of ['cold', 'warm']) {
  console.log(`\n${kind === 'cold' ? (FIRST ? 'First visit (empty cache, new player)' : 'Cold start (empty cache)') : (FIRST ? 'Second visit (service worker and cache)' : 'Warm start (service worker and cache)')}`);
  console.log(`${'metric'.padEnd(34)}${targets.map((t) => t.name.padStart(18)).join('')}`);
  for (const [key, name, unit] of ROWS) console.log(`${name.padEnd(34)}${targets.map((t) => fmt(t.summary[kind][key], unit).padStart(18)).join('')}`);
}
const file = option('json', 'tests/out/perf-boot.json');
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), cpu: CPU, latency: LATENCY, kbps: KBPS, first: FIRST, pc: PC, targets: targets.map(({ name, dir, runs, summary }) => ({ name, dir, runs, summary })) }, null, 2));
console.log(`\nraw numbers in ${file}`);
