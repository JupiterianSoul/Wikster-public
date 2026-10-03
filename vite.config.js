import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

const THEME_CSS = readFileSync(fileURLToPath(new URL('./src/styles/themes.css', import.meta.url)), 'utf8');

function themeVars(id) {
  const at = THEME_CSS.indexOf(`[data-theme='${id}'] {`);
  if (at < 0) return {};
  const block = THEME_CSS.slice(at, THEME_CSS.indexOf('\n}', at));
  const vars = {};
  for (const m of block.matchAll(/^\s*(--(?:accent|accent-2|font|font-display)):\s*([^;]+);/gm)) vars[m[1]] = m[2].trim();
  if (vars['--font-display'] === 'var(--font)') vars['--font-display'] = vars['--font'];
  return vars;
}

const INTRO_LOOKS = Object.fromEntries(THEMES.map((theme) => {
  const v = themeVars(theme.id);
  return [theme.id, [theme.swatch[0].slice(0, 7), theme.motion.scale, theme.motion.ease, theme.motion.pop, v['--accent'] ?? null, v['--accent-2'] ?? null, v['--font'] ?? null, v['--font-display'] ?? v['--font'] ?? null]];
}));

const logoInHtml = () => ({
  name: 'wikster-logo-html',
  transformIndexHtml: { order: 'pre', handler: (html) => html
    .replace('href="wikster:logo"', `href="${logoFavicon()}"`)
    .replace('__WIKSTER_LOOKS__', JSON.stringify(INTRO_LOOKS))
    .replace(/<wikster-logo class="([\w -]+)"><\/wikster-logo>/g, (_, className) => logoIntro({ className, id: 'il' })) }
});

const lateStyles = () => ({
  name: 'wikster-late-styles',
  apply: 'build',
  transformIndexHtml: { order: 'post', handler: (html) => {
    let found = false;
    const out = html.replace(/<link rel="stylesheet" crossorigin href="(\.\/assets\/index-[\w-]+\.css)">/, (_, href) => {
      found = true;
      return `<style>html:not(.is-styled) body > :not(#intro) { visibility: hidden; } html:not(.is-styled) body { margin: 0; background: var(--intro-bg, #06070d); }</style>
    <script>
      function wiksterStyled(link, failed) {
        var root = document.documentElement, at = performance.now();
        function done() { if (root.classList.contains('is-styled')) return; root.classList.add('is-styled'); dispatchEvent(new Event('wikster:styled')); }
        link.onload = link.onerror = null;
        if (failed) return done();
        link.rel = 'stylesheet';
        (function wait() { if (link.sheet || performance.now() - at > 4000) done(); else setTimeout(wait, 16); })();
      }
    </script>
    <link rel="preload" as="style" crossorigin href="${href}" id="wikster-css" onload="wiksterStyled(this)" onerror="wiksterStyled(this, true)">`;
    });
    if (!found) throw new Error('wikster-late-styles: the main stylesheet link was not found');
    return out;
  } }
});

const languagePreload = () => ({
  name: 'wikster-language-preload',
  apply: 'build',
  transformIndexHtml: { order: 'post', handler: (html, ctx) => {
    const chunk = Object.values(ctx.bundle ?? {}).find((c) => c.type === 'chunk' && /[\\/]src[\\/]i18n-fr\.js$/.test(c.facadeModuleId ?? ''));
    if (!chunk) throw new Error('wikster-language-preload: the French strings chunk was not found');
    const script = `<script>
      (function () {
        var lang = null;
        try { lang = localStorage.getItem('wikster.language'); } catch (e) {}
        if (lang !== 'en' && lang !== 'fr') {
          var tags = navigator.languages || [navigator.language || ''];
          lang = 'en';
          for (var i = 0; i < tags.length; i++) { var code = String(tags[i]).slice(0, 2).toLowerCase(); if (code === 'en' || code === 'fr') { lang = code; break; } }
        }
        if (lang !== 'fr') return;
        var link = document.createElement('link');
        link.rel = 'modulepreload';
        link.crossOrigin = '';
        link.href = './${chunk.fileName}';
        document.head.appendChild(link);
      })();
    </script>`;
    return html.replace('</head>', `${script}\n  </head>`);
  } }
});

const onDemand = (file) => file.endsWith('.mp3') || file.endsWith('.woff2')
  || /^assets\/(scifi|rubber|mechanical|cinematic)-[\w-]+\.js$/.test(file);

const bootFiles = (bundle) => {
  const files = new Set();
  const walk = (name) => {
    const chunk = bundle[name];
    if (!chunk || files.has(name)) return;
    files.add(name);
    if (chunk.type !== 'chunk') return;
    for (const css of chunk.viteMetadata?.importedCss ?? []) files.add(css);
    for (const asset of chunk.viteMetadata?.importedAssets ?? []) if (!onDemand(asset)) files.add(asset);
    chunk.imports.forEach(walk);
  };
  for (const [name, chunk] of Object.entries(bundle)) if (chunk.type === 'chunk' && chunk.isEntry) walk(name);
  return files;
};

const serviceWorker = () => ({
  name: 'wikster-service-worker',
  generateBundle(_options, bundle) {
    const boot = bootFiles(bundle);
    const files = Object.keys(bundle).filter((f) => f !== 'sw.js' && f !== 'index.html' && f !== 'version.json');
    const precache = ['./index.html', './version.json', './manifest.webmanifest',
      './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
      ...files.filter((f) => boot.has(f)).map((f) => `./${f}`)];
    const size = (f) => (bundle[f].type === 'chunk' ? bundle[f].code : bundle[f].source)?.length ?? 0;
    const langOf = (f) => {
      const id = bundle[f].type === 'chunk' ? bundle[f].facadeModuleId ?? '' : '';
      if (/-fr\.js$/.test(id)) return 'fr';
      if (/wikdle-words\.js$/.test(id)) return 'en';
      return null;
    };
    const later = files.filter((f) => !boot.has(f) && !onDemand(f) && /\.(js|css)$/.test(f)).sort((a, b) => size(a) - size(b));
    const langs = {};
    for (const f of later) { const lang = langOf(f); if (lang) (langs[lang] ??= []).push(`./${f}`); }
    const source = readFileSync('src/sw.js', 'utf8')
      .replace("'__STAMP__'", JSON.stringify(`${STAMP.sha}-${STAMP.at}`))
      .replace('__PRECACHE__', JSON.stringify([...new Set(precache)], null, 2))
      .replace('__LATER__', JSON.stringify(later.map((f) => `./${f}`), null, 2))
      .replace('__LANGS__', JSON.stringify(langs));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  }
});

export default defineConfig({
  base: './',
  define: { __WIKSTER_BUILD__: JSON.stringify(STAMP), __WIKSTER_LATEST_RELEASE__: JSON.stringify(RELEASES.at(-1).id) },
  plugins: [logoInHtml(), lateStyles(), languagePreload(), versionFile(), serviceWorker()],
  resolve: { alias: { '@supabase/storage-js': fileURLToPath(new URL('./src/account/nostorage.js', import.meta.url)) } },
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
