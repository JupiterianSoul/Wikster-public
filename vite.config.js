import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { RELEASES } from './src/data/releases.js';
import { logoFavicon, logoIntro } from './src/data/logo.js';
import { THEMES } from './src/ui/themes.js';

function buildStamp() {
  let sha = 'dev';
  try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; }
  catch {}
  return { sha, at: Date.now() };
}
const STAMP = buildStamp();

const NOTES = RELEASES.slice(-4).map(({ id, icon, accent, title, points }) => ({ id, icon, accent, title, points }));

const versionFile = () => ({
  name: 'wikster-version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ ...STAMP, notes: NOTES }) });
  }
});

const INTRO_LOOKS = Object.fromEntries(THEMES.map((theme) => [theme.id, [theme.swatch[0].slice(0, 7), theme.motion.scale, theme.motion.ease, theme.motion.pop]]));

const logoInHtml = () => ({
  name: 'wikster-logo-html',
  transformIndexHtml: { order: 'pre', handler: (html) => html
    .replace('href="wikster:logo"', `href="${logoFavicon()}"`)
    .replace('__WIKSTER_LOOKS__', JSON.stringify(INTRO_LOOKS))
    .replace(/<wikster-logo class="([\w -]+)"><\/wikster-logo>/g, (_, className) => logoIntro({ className, id: 'il' })) }
});

const onDemand = (file) => file.endsWith('.mp3') || file.endsWith('.woff2')
  || /^assets\/(scifi|rubber|mechanical|cinematic)-[\w-]+\.js$/.test(file);

const serviceWorker = () => ({
  name: 'wikster-service-worker',
  generateBundle(_options, bundle) {
    const files = Object.keys(bundle).filter((f) => !onDemand(f) && f !== 'sw.js');
    const precache = ['./index.html', './version.json', './manifest.webmanifest',
      './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
      ...files.filter((f) => f !== 'index.html' && f !== 'version.json').map((f) => `./${f}`)];
    const source = readFileSync('src/sw.js', 'utf8')
      .replace("'__STAMP__'", JSON.stringify(`${STAMP.sha}-${STAMP.at}`))
      .replace('__PRECACHE__', JSON.stringify([...new Set(precache)], null, 2));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  }
});

export default defineConfig({
  base: './',
  define: { __WIKSTER_BUILD__: JSON.stringify(STAMP) },
  plugins: [logoInHtml(), versionFile(), serviceWorker()],
  worker: { format: 'es' },
  build: {
    assetsInlineLimit: (file, content) => !file.endsWith('.woff2') && content.length < 32768,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined)
      }
    }
  },
  server: {
    port: 5173,
    open: false
  }
});
