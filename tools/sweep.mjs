import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import ts from 'typescript';

const SKIP = /\.(mp3|ogg|wav|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|jar|keystore)$/i;
const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\n').filter((f) => f && !SKIP.test(f));

const jsComment = (text, kind) => {
  const sf = ts.createSourceFile('x', text, ts.ScriptTarget.Latest, true, kind);
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.getLeadingCommentRanges(text, n.pos)?.length || ts.getTrailingCommentRanges(text, n.end)?.length) { found = true; return; }
    n.getChildren(sf).forEach(visit);
  };
  visit(sf);
  return found;
};
const cssComment = (s) => /\/\*[\s\S]*?\*\//.test(s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""'));
const htmlComment = (s) => /<!--/.test(s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ''));

const hasComment = (s, f) => {
  if (/\.(js|mjs|cjs)$/.test(f)) return jsComment(s, ts.ScriptKind.JS);
  if (/\.ts$/.test(f)) return jsComment(s, ts.ScriptKind.TS);
  if (/\.css$/.test(f)) return cssComment(s);
  if (/\.html$/.test(f)) return htmlComment(s);
  return false;
};

const serviceJwt = (s) => (s.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) ?? []).some((token) => {
  try { return /service_role/.test(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { return false; }
});

const PRIVATE = 'tools/private-words.txt';
const privateWords = existsSync(PRIVATE)
  ? readFileSync(PRIVATE, 'utf8').split('\n').map((w) => w.trim()).filter((w) => w.length >= 4)
    .map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu'))
  : [];

const RULES = [
  { name: 'em dash', test: (s) => s.includes('\u2014') },
  { name: 'code comment', test: hasComment },
  { name: 'env file', test: (s, f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f) },
  { name: 'secret key', test: (s) => /sb_secret_[A-Za-z0-9_]{8,}/.test(s) && !/sb_secret_\.\.\./.test(s) },
  { name: 'Groq key', test: (s) => /gsk_[A-Za-z0-9]{20,}/.test(s) },
  { name: 'service role token', test: (s) => serviceJwt(s) },
  { name: 'private key', test: (s) => /-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(s) },
  { name: 'Google service account', test: (s) => /"type"\s*:\s*"service_account"/.test(s) && /"private_key"/.test(s) },
  { name: 'Firebase config', test: (s, f) => /google-services\.json$/.test(f) },
  { name: 'keystore', test: (s, f) => /\.(jks|keystore)$/.test(f) && !/wikster-debug\.keystore$/.test(f) },
  { name: 'special photo in the repo', test: (s, f) => /(^|\/)(src\/assets|public)\/special\//.test(f) },
  { name: 'private word', test: (s, f) => f !== PRIVATE && privateWords.some((w) => w.test(s)) }
];

const problems = [];
for (const f of files) {
  let s;
  try { s = readFileSync(f, 'utf8'); } catch { continue; }
  for (const rule of RULES) if (rule.test(s, f)) problems.push(`${rule.name}: ${f}`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`sweep: ${files.length} files clean`);
