import { build } from 'esbuild';
import { parse } from 'acorn';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const shared = {
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  loader: { '.jpg': 'empty', '.png': 'empty', '.webp': 'empty', '.svg': 'empty', '.mp3': 'empty', '.css': 'empty' },
  logLevel: 'warning'
};

const I18N = path.resolve('src/i18n.js');
const ECONOMY_DIR = 'supabase/functions/economy';

async function stringsUsed(entry) {
  const probe = await build({ ...shared, entryPoints: [entry], write: false, metafile: true, minify: false, logLevel: 'error' });
  const keys = new Set();
  for (const file of Object.keys(probe.metafile.inputs)) {
    if (path.resolve(file) === I18N || !/\.m?js$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?<![\w.$])t\(\s*([^,)]*)/g)) {
      const arg = m[1].trim();
      if (!/^(['"])[\w.-]+\1$/.test(arg)) return null;
      keys.add(arg.slice(1, -1));
    }
  }
  return keys;
}

function englishOnly(keys) {
  return {
    name: 'english-only',
    setup(b) {
      b.onResolve({ filter: /i18n-fr\.js$/ }, () => ({ path: 'i18n-fr', namespace: 'english-only' }));
      b.onLoad({ filter: /.*/, namespace: 'english-only' }, () => ({ contents: 'export const fr = {};', loader: 'js' }));
      b.onLoad({ filter: /[\\/]src[\\/]i18n\.js$/ }, () => {
        const text = readFileSync(I18N, 'utf8');
        const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
        let en = null;
        for (const node of ast.body) {
          if (node.type !== 'VariableDeclaration') continue;
          for (const d of node.declarations) {
            if (d.id.name !== 'STRINGS' || d.init?.type !== 'ObjectExpression') continue;
            en = d.init.properties.find((p) => (p.key.name ?? p.key.value) === 'en')?.value ?? null;
          }
        }
        if (!en || en.type !== 'ObjectExpression') throw new Error('build-economy: STRINGS.en not found in src/i18n.js');
        const kept = en.properties.filter((p) => {
          const k = p.key.name ?? p.key.value;
          return keys.has(k) || keys.has(String(k).replace(/_one$/, ''));
        });
        const missing = [...keys].filter((k) => !en.properties.some((p) => (p.key.name ?? p.key.value) === k));
        if (missing.length) throw new Error(`build-economy: strings the server uses are missing from src/i18n.js: ${missing.join(', ')}`);
        const body = `{\n${kept.map((p) => text.slice(p.start, p.end)).join(',\n')}\n}`;
        return { contents: text.slice(0, en.start) + body + text.slice(en.end), loader: 'js' };
      });
    }
  };
}

function spacedImports(text) {
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  let out = '';
  let at = 0;
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const names = node.specifiers.map((s) => {
      if (s.type === 'ImportDefaultSpecifier') return { plain: s.local.name };
      if (s.type === 'ImportNamespaceSpecifier') return { plain: `* as ${s.local.name}` };
      const from = s.imported.name ?? JSON.stringify(s.imported.value);
      return { named: from === s.local.name ? from : `${from} as ${s.local.name}` };
    });
    const plain = names.filter((n) => n.plain).map((n) => n.plain);
    const named = names.filter((n) => n.named).map((n) => n.named);
    const parts = [...plain, ...(named.length ? [`{ ${named.join(', ')} }`] : [])];
    const source = JSON.stringify(node.source.value);
    out += text.slice(at, node.start) + (parts.length ? `import ${parts.join(', ')} from ${source};\n` : `import ${source};\n`);
    at = node.end;
  }
  return out + text.slice(at);
}

for (const name of readdirSync(ECONOMY_DIR)) if (/^engine(-.+)?\.js$/.test(name)) rmSync(path.join(ECONOMY_DIR, name));

const keys = await stringsUsed('src/econ/server.js');
if (!keys) console.warn('build-economy: a t() call with a computed key, keeping every string');
await build({
  ...shared,
  entryPoints: { engine: 'src/econ/server.js' },
  outdir: ECONOMY_DIR,
  splitting: true,
  chunkNames: 'engine-[name]-[hash]',
  plugins: keys ? [englishOnly(keys)] : []
});
for (const name of readdirSync(ECONOMY_DIR).filter((n) => /^engine(-.+)?\.js$/.test(n))) {
  const file = path.join(ECONOMY_DIR, name);
  writeFileSync(file, spacedImports(readFileSync(file, 'utf8')));
}
const sizes = readdirSync(ECONOMY_DIR).filter((n) => /^engine(-.+)?\.js$/.test(n))
  .map((n) => `${n} ${Math.round(readFileSync(path.join(ECONOMY_DIR, n)).length / 1024)} KB`);
console.log(`wrote ${ECONOMY_DIR}: ${sizes.join(', ')}${keys ? `, ${keys.size} strings` : ''}`);
await build({ ...shared, entryPoints: ['src/econ/billing.js'], outfile: 'supabase/functions/billing/catalog.js' });
console.log('wrote supabase/functions/billing/catalog.js');
