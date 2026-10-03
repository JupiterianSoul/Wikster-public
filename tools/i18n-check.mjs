import { readFileSync } from 'node:fs';
const en_src = readFileSync('src/i18n.js', 'utf8');
const fr_src = readFileSync('src/i18n-fr.js', 'utf8');
const en0 = en_src.indexOf('\n  en: {');
const fr0 = fr_src.indexOf('export const fr = {');
if (en0 < 0 || fr0 < 0) { console.error('i18n: could not find the en/fr tables'); process.exit(2); }
const en = [...en_src.slice(en0).matchAll(/^    ([a-zA-Z0-9_]+):/gm)].map((m) => m[1]);
const fr = [...fr_src.slice(fr0).matchAll(/^  ([a-zA-Z0-9_]+):/gm)].map((m) => m[1]);
const se = new Set(en), sf = new Set(fr);
const dupes = (l) => l.filter((k, i) => l.indexOf(k) !== i);
const problems = [];
for (const k of en) if (!sf.has(k)) problems.push(`missing in fr: ${k}`);
for (const k of fr) if (!se.has(k)) problems.push(`extra in fr: ${k}`);
for (const k of dupes(en)) problems.push(`duplicate in en: ${k}`);
for (const k of dupes(fr)) problems.push(`duplicate in fr: ${k}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`i18n: ${en.length} keys in both languages`);
