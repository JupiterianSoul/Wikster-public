import { spawn, execSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';

const MODES = {
  app: 'offline', browsersguest: 'offline', centering: 'offline', games: 'offline', offline: 'offline', product: 'offline', arcade2: 'offline', desk: 'offline', atelier: 'offline', pc: 'offline', fit: 'offline', dangerlocal: 'offline', customtheme: 'offline', opening: 'offline', perf: 'offline', tabs: 'offline', collection: 'offline', intro: 'offline', stats: 'offline',
  browsers: 'stub', fixes6: 'stub', economy: 'stub', worldclock: 'stub', facetoface: 'stub', g4: 'stub', sync: 'stub', live: 'stub', clubs: 'stub', seasons: 'stub', versus: 'stub', notices: 'stub', gifts: 'stub', safety: 'stub', slow: 'stub', control: 'stub', liveops: 'stub', instant: 'stub', claims: 'stub', inbox: 'stub', market: 'stub', danger: 'stub', appearance: 'stub', days: 'stub', recovery: 'stub', friends: 'stub', hellfire: 'stub', wankel: 'stub', erdtree: 'stub', solocode: 'stub', regalia: 'stub', maxlevel: 'stub', settle: 'stub'
};
const PORT = Number(process.env.PORT) || 4173;
const JOBS = Math.max(1, Number(process.env.TEST_JOBS) || Math.min(8, Math.floor(availableParallelism() / 2)));
const OUT = 'tests/out';
const CLOCKED = Boolean(process.env.WIKSTER_TZ || process.env.WIKSTER_NOW);
if (CLOCKED) console.log(`clock: ${process.env.WIKSTER_TZ || 'machine zone'}, ${process.env.WIKSTER_NOW || 'real time'}`);
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const asked = args.length === 0 ? Object.keys(MODES)
  : args.every((a) => a === 'stub' || a === 'offline') ? Object.keys(MODES).filter((n) => args.includes(MODES[n]))
    : args;
const SLOW = ['fit', 'centering', 'atelier', 'app', 'facetoface', 'instant', 'inbox', 'pc', 'notices', 'safety'];
const shard = /^(\d+)\/(\d+)$/.exec(process.env.SHARD ?? '');
const wanted = shard
  ? [...asked.filter((n) => SLOW.includes(n)), ...asked.filter((n) => !SLOW.includes(n))].filter((_, i) => i % Number(shard[2]) === Number(shard[1]) - 1)
  : asked;
if (shard) console.log(`shard ${shard[1]} of ${shard[2]}: ${wanted.join(', ')}`);
for (const name of wanted) if (!MODES[name]) { console.error(`no suite called ${name}`); process.exit(2); }

const portOpen = (port) => new Promise((resolve) => {
  const sock = createConnection({ port, host: '127.0.0.1' });
  sock.once('connect', () => { sock.end(); resolve(true); });
  sock.once('error', () => resolve(false));
});
const until = async (test, what, tries = 60) => {
  for (let n = 0; n < tries; n++) { if (await test()) return; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(what);
};

const modes = [...new Set(wanted.map((n) => MODES[n]))];
const ports = Object.fromEntries(modes.map((mode, i) => [mode, PORT + i]));
for (const port of Object.values(ports)) {
  if (await portOpen(port)) { console.error(`port ${port} is already in use; stop that server first (or set PORT)`); process.exit(2); }
}

execSync('node tools/build-economy.mjs', { stdio: 'inherit' });
for (const mode of modes) execSync(`node tests/build.mjs ${mode} ${OUT}/dist-${mode}`, { stdio: 'inherit' });

const previews = modes.map((mode) => {
  const previewLog = openSync(`${OUT}/preview-${mode}.log`, 'w');
  return {
    mode,
    port: ports[mode],
    child: spawn(process.execPath,
      ['node_modules/vite/bin/vite.js', 'preview', '--outDir', `${OUT}/dist-${mode}`, '--host', '127.0.0.1', '--port', String(ports[mode]), '--strictPort'],
      { stdio: ['ignore', previewLog, previewLog] })
  };
});

function runSuite(name) {
  const mode = MODES[name];
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('node', [...(CLOCKED ? ['--import', '../lib/clock.mjs'] : []), `../suites/${name}.mjs`], { cwd: OUT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BASE_URL: `http://127.0.0.1:${ports[mode]}/` } });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 8 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(`${OUT}/${name}.log`, log);
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`${code === 0 ? 'ok  ' : 'FAIL'}  ${name} (${mode}, ${seconds}s)`);
      if (code !== 0) {
        const lines = log.split('\n')
          .filter((l) => /^(FAIL|ERRORS|== |[A-Z] PAGE:)|Error|Timeout|exceeded/.test(l) && !/^\s+at /.test(l));
        for (const l of lines.slice(0, 40)) console.log(`      ${l}`);
      }
      resolve({ name, mode, ok: code === 0, seconds });
    });
  });
}

const results = [];
try {
  for (const { mode, port } of previews) {
    await until(() => portOpen(port), 'preview never came up').catch((error) => {
      console.error(readFileSync(`${OUT}/preview-${mode}.log`, 'utf8').trim() || '(the preview server said nothing)');
      throw error;
    });
  }
  const queue = [...wanted].sort((a, b) => (SLOW.includes(b) ? 1 : 0) - (SLOW.includes(a) ? 1 : 0));
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    while (queue.length) results.push(await runSuite(queue.shift()));
  }));
} finally {
  for (const { child, port } of previews) {
    child.kill('SIGTERM');
    await until(async () => !(await portOpen(port)), 'preview would not stop', 20).catch(() => child.kill('SIGKILL'));
  }
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} suite(s) failed: ${failed.map((r) => r.name).join(', ')} (see tests/out/*.log)` : `\nall ${results.length} suites passed`);
process.exit(failed.length ? 1 : 0);
