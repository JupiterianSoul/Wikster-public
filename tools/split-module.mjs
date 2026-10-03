import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import * as acorn from 'acorn';

const [,, inputPath, outDir, planPath] = process.argv;
if (!inputPath || !outDir || !planPath) { console.error('usage: split-module.mjs <file> <outdir> <plan.json>'); process.exit(2); }
const src = readFileSync(inputPath, 'utf8');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true });

const KEYS = new Set(['type', 'start', 'end', 'loc', 'range']);
function walk(node, visit, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent, key);
  for (const k of Object.keys(node)) {
    if (KEYS.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, visit, node, k));
    else if (v && typeof v.type === 'string') walk(v, visit, node, k);
  }
}
function references(node) {
  const out = [];
  walk(node, (n, parent, key) => {
    if (n.type !== 'Identifier') return;
    if (parent) {
      if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
      if (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand) return;
      if (parent.type === 'Property' && key === 'key' && parent.shorthand) { out.push(n); return; }
      if ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label') return;
      if (parent.type === 'MethodDefinition' && key === 'key' && !parent.computed) return;
      if (parent.type === 'PropertyDefinition' && key === 'key' && !parent.computed) return;
      if (parent.type === 'ImportSpecifier' || parent.type === 'ExportSpecifier') return;
    }
    out.push(n);
  });
  return out;
}
function declared(node) {
  const names = [];
  const pattern = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') names.push(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => pattern(q.type === 'RestElement' ? q.argument : q.value));
    else if (p.type === 'ArrayPattern') p.elements.forEach(pattern);
    else if (p.type === 'AssignmentPattern') pattern(p.left);
    else if (p.type === 'RestElement') pattern(p.argument);
  };
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') names.push(node.id.name);
  else if (node.type === 'VariableDeclaration') node.declarations.forEach((d) => pattern(d.id));
  return names;
}

const top = ast.body;
const imports = top.filter((n) => n.type === 'ImportDeclaration');
const body = top.filter((n) => n.type !== 'ImportDeclaration')
  .map((n) => (n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n));
const pieces = body.map((node, i) => {
  const prevEnd = i === 0 ? (imports.length ? imports[imports.length - 1].end : 0) : body[i - 1].end;
  const lead = src.slice(prevEnd, node.start).replace(/export\s+$/, '');
  return { node, lead, text: src.slice(node.start, node.end) };
});

const sections = plan.sections;
let current = plan.entry;
const moduleOf = new Map();
for (const piece of pieces) {
  for (const line of piece.lead.split('\n')) {
    const m = line.match(/^\/\* --- (.+?)(?: -+.*)?\s*\*?\/?$/) || line.match(/^\/\* --- (.+)$/);
    if (!m) continue;
    const title = m[1].trim().toLowerCase();
    const hit = sections.find((s) => title.startsWith(s.match.toLowerCase()));
    if (hit) current = hit.module;
  }
  const isDecl = ['FunctionDeclaration', 'ClassDeclaration', 'VariableDeclaration'].includes(piece.node.type);
  piece.module = isDecl ? current : plan.entry;
  piece.section = current;
  if (!isDecl && current !== plan.entry) piece.statementFrom = current;
  moduleOf.set(piece, piece.module);
}

const owner = new Map();
const kind = new Map();
for (const piece of pieces) {
  for (const name of declared(piece.node)) {
    owner.set(name, piece.module);
    kind.set(name, piece.node.type === 'VariableDeclaration' ? piece.node.kind : piece.node.type === 'FunctionDeclaration' ? 'function' : 'class');
  }
}
const arrowConst = new Set();
for (const piece of pieces) {
  const n = piece.node;
  if (n.type !== 'VariableDeclaration' || n.kind !== 'const' || n.declarations.length !== 1) continue;
  const d = n.declarations[0];
  if (d.id.type === 'Identifier' && d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression') && !d.init.generator) {
    arrowConst.add(d.id.name);
    kind.set(d.id.name, 'function');
  }
}
const importedNames = new Map();
for (const imp of imports) {
  for (const s of imp.specifiers) {
    importedNames.set(s.local.name, {
      source: imp.source.value,
      imported: s.type === 'ImportSpecifier' ? s.imported.name : null,
      kind: s.type === 'ImportSpecifier' ? 'named' : s.type === 'ImportDefaultSpecifier' ? 'default' : 'namespace'
    });
  }
}

const written = new Map();
for (const piece of pieces) {
  walk(piece.node, (n) => {
    let target = null;
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') target = n.left.name;
    if (n.type === 'UpdateExpression' && n.argument.type === 'Identifier') target = n.argument.name;
    if (target && kind.get(target) === 'let') {
      if (!written.has(target)) written.set(target, new Set());
      written.get(target).add(piece.module);
    }
  });
}
const liveNames = new Set();
for (const [name, mods] of written) {
  const others = [...mods].filter((m) => m !== owner.get(name));
  if (others.length) liveNames.add(name);
}

function rewrite(piece) {
  const n = piece.node;
  const edits = [];
  if (liveNames.size) {
    for (const id of references(n)) {
      if (liveNames.has(id.name)) edits.push([id.start, id.end, `live.${id.name}`]);
    }
  }
  let text = src.slice(n.start, n.end);
  const base = n.start;
  edits.sort((a, b) => b[0] - a[0]);
  for (const [s, e, rep] of edits) text = text.slice(0, s - base) + rep + text.slice(e - base);
  if (n.type === 'VariableDeclaration' && n.kind === 'let' && n.declarations.some((d) => d.id.type === 'Identifier' && liveNames.has(d.id.name))) {
    const parts = n.declarations.map((d) => {
      const name = d.id.name;
      const init = d.init ? src.slice(d.init.start, d.init.end) : 'undefined';
      return liveNames.has(name) ? `live.${name} = ${init};` : `let ${name} = ${init};`;
    });
    return { text: parts.join('\n'), exported: [] };
  }
  const names = declared(n);
  if (n.type === 'VariableDeclaration' && names.length === 1 && arrowConst.has(names[0])) {
    const d = n.declarations[0];
    const fn = d.init;
    const head = src.slice(fn.start, fn.body.start);
    const arrowAt = fn.type === 'ArrowFunctionExpression' ? head.lastIndexOf('=>') : -1;
    let plist = (fn.type === 'ArrowFunctionExpression' ? head.slice(0, arrowAt) : head.replace(/^(async\s+)?function\s*[^(]*/, '')).trim();
    plist = plist.replace(/^async\s*/, '').trim();
    if (!plist.startsWith('(')) plist = `(${plist})`;
    let bodyText = src.slice(fn.body.start, fn.body.end);
    if (liveNames.size) {
      const inner = references(fn.body).filter((id) => liveNames.has(id.name)).sort((a, b) => b.start - a.start);
      for (const id of inner) {
        const rel = id.start - fn.body.start;
        bodyText = bodyText.slice(0, rel) + `live.${id.name}` + bodyText.slice(rel + id.name.length);
      }
    }
    if (fn.body.type !== 'BlockStatement') bodyText = `{\n  return (${bodyText});\n}`;
    return { text: `export ${fn.async ? 'async ' : ''}function ${names[0]}${plist} ${bodyText}`, exported: names };
  }
  if (['FunctionDeclaration', 'ClassDeclaration', 'VariableDeclaration'].includes(n.type)) {
    return { text: `export ${text}`, exported: names };
  }
  return { text, exported: [] };
}

const modules = new Map();
for (const piece of pieces) {
  if (!modules.has(piece.module)) modules.set(piece.module, { pieces: [], uses: new Set(), declares: new Set() });
  const mod = modules.get(piece.module);
  mod.pieces.push(piece);
  for (const name of declared(piece.node)) mod.declares.add(name);
  for (const id of references(piece.node)) mod.uses.add(id.name);
}
const report = [];
mkdirSync(outDir, { recursive: true });
const relSource = (source) => {
  if (!source.startsWith('.')) return source;
  const abs = join(dirname(inputPath), source);
  const home = join(dirname(inputPath), plan.targetDir ?? basename(outDir));
  let rel = relative(home, abs).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
};
for (const [name, mod] of modules) {
  const lines = [];
  const external = new Map();
  const internal = new Map();
  for (const used of mod.uses) {
    if (mod.declares.has(used)) continue;
    if (liveNames.has(used)) continue;
    if (importedNames.has(used)) {
      const info = importedNames.get(used);
      if (!external.has(info.source)) external.set(info.source, { named: [], default: null, namespace: null });
      const e = external.get(info.source);
      if (info.kind === 'named') e.named.push(info.imported === used ? used : `${info.imported} as ${used}`);
      else if (info.kind === 'default') e.default = used;
      else e.namespace = used;
    } else if (owner.has(used) && owner.get(used) !== name) {
      const from = owner.get(used);
      if (!internal.has(from)) internal.set(from, []);
      internal.get(from).push(used);
    }
  }
  if (liveNames.size && [...mod.uses].some((u) => liveNames.has(u))) {
    if (!internal.has('live')) internal.set('live', []);
    internal.get('live').push('live');
  }
  lines.push(plan.headers?.[name] ?? `/* ${name}: split out of ${basename(inputPath)} */`);
  lines.push('');
  for (const [source, e] of external) {
    const bits = [];
    if (e.default) bits.push(e.default);
    if (e.namespace) bits.push(`* as ${e.namespace}`);
    if (e.named.length) bits.push(`{ ${[...new Set(e.named)].sort().join(', ')} }`);
    lines.push(`import ${bits.join(', ')} from '${relSource(source)}';`);
  }
  for (const [from, names] of [...internal].sort()) {
    lines.push(`import { ${[...new Set(names)].sort().join(', ')} } from './${from}.js';`);
  }

  lines.push('');
  for (const piece of mod.pieces) {
    const lead = piece.lead.replace(/^\n+/, '\n').replace(/\n{3,}/g, '\n\n');
    const { text } = rewrite(piece);
    lines.push(lead.trimEnd() ? lead.replace(/^\n/, '') : '');
    lines.push(text);
    if (piece.statementFrom) {
      const cross = references(piece.node).map((r) => r.name).filter((u) => owner.has(u) && owner.get(u) !== name && kind.get(u) !== 'function' && !liveNames.has(u));
      if (cross.length) report.push(`entry statement from section "${piece.statementFrom}" reads non-function bindings: ${[...new Set(cross)].join(', ')}`);
    }
  }
  writeFileSync(join(outDir, `${name}.js`), lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n');
  report.push(`${name}.js: ${mod.pieces.length} pieces, ${mod.declares.size} declarations`);
}
for (const piece of pieces) {
  if (piece.module === plan.entry) continue;
  const isDecl = ['FunctionDeclaration', 'ClassDeclaration', 'VariableDeclaration'].includes(piece.node.type);
  if (!isDecl || piece.node.type === 'FunctionDeclaration') continue;
  if (piece.node.type === 'VariableDeclaration' && declared(piece.node).some((d) => arrowConst.has(d))) continue;
  const init = piece.node.declarations.map((d) => d.init).filter(Boolean);
  const cross = new Set();
  for (const i of init) for (const r of references(i)) {
    const u = r.name;
    if (owner.has(u) && owner.get(u) !== piece.module && kind.get(u) !== 'function' && kind.get(u) !== 'class' && !liveNames.has(u)) cross.add(u);
  }
  if (cross.size) report.push(`TDZ RISK ${piece.module}.js: "${declared(piece.node).join(', ')}" is initialised at load from ${[...cross].join(', ')} (owned elsewhere)`);
}
if (liveNames.size) {
  writeFileSync(join(outDir, 'live.js'), [
    '/**',
    ' * Module-level state that more than one screen writes.',
    ' *',
    ' * An imported binding is read-only, so a variable one module declares and',
    ' * another assigns cannot be a plain `let`; these live on one object every',
    ' * module shares. This module imports nothing, on purpose: it is therefore',
    ' * evaluated before anything that reads it, wherever the import cycle',
    ' * happens to start.',
    ' */',
    'export const live = {};',
    ''
  ].join('\n'));
  report.push(`shared lets moved onto live.js: ${[...liveNames].sort().join(', ')}`);
}
report.push(`arrow consts made functions: ${arrowConst.size}`);
console.log(report.join('\n'));
