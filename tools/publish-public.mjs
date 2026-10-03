import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HELP = `node tools/publish-public.mjs [options]

Builds the public copy of the game: one snapshot commit of a ref's tree, without the private files.
It never pushes; it prints the push command.

  --ref=<ref>        what to publish (default: HEAD)
  --remote=<url>     the public repository (its main is the parent of the new snapshot when it exists)
  --branch=<name>    the public branch (default: main)
  --email=<address>  author address (default: <id>+<login>@users.noreply.github.com from gh)
  --name=<name>      author name (default: git config user.name)
  --dry-run          only list what goes out and what is left out, and run the checks
`;

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
if (args.help) { console.log(HELP); process.exit(0); }

const ROOT = resolve('.');
const REF = String(args.ref ?? 'HEAD');
const BRANCH = String(args.branch ?? 'main');
const REMOTE = args.remote ? String(args.remote) : null;
const DRY = Boolean(args['dry-run']);

const git = (argv, opts = {}) => execFileSync('git', argv, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts }).trim();
const lines = (path) => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []);

const KEEP_WORKFLOWS = ['tests.yml'];
const ALWAYS_OUT = ['RELEASE.md', 'CLAUDE.local.md', 'android/keystore/', 'public/control/index.html', 'tools/private-words.txt', 'tools/public-exclude.txt'];
const EXTRA_OUT = lines(join(ROOT, 'tools/public-exclude.txt'));
const PRIVATE_WORDS = lines(join(ROOT, 'tools/private-words.txt')).filter((w) => w.length >= 4);

function noreply() {
  if (args.email) return String(args.email);
  const out = execFileSync('gh', ['api', 'user', '-q', '[.id, .login] | map(tostring) | join(" ")'], { encoding: 'utf8' }).trim();
  const [id, login] = out.split(' ');
  if (!/^\d+$/.test(id) || !login) throw new Error(`could not read the GitHub account (${out})`);
  return `${id}+${login}@users.noreply.github.com`;
}

const leftOut = (path) => {
  if (path.startsWith('.github/workflows/') && !KEEP_WORKFLOWS.includes(path.slice('.github/workflows/'.length))) return 'private workflow';
  const hit = [...ALWAYS_OUT, ...EXTRA_OUT].find((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
  return hit ? (ALWAYS_OUT.includes(hit) ? 'private' : 'tools/public-exclude.txt') : null;
};

const sha = git(['rev-parse', '--verify', `${REF}^{commit}`]);
const short = sha.slice(0, 7);
const all = git(['ls-tree', '-r', '--name-only', sha]).split('\n').filter(Boolean);
const excluded = all.map((p) => [p, leftOut(p)]).filter(([, why]) => why);
const kept = all.filter((p) => !leftOut(p));

const WORK = mkdtempSync(join(tmpdir(), 'wikster-public-'));
const TREE = join(WORK, 'tree');
execFileSync('mkdir', ['-p', TREE]);
execFileSync('sh', ['-c', `git archive ${sha} | tar -x -C "${TREE}"`], { cwd: ROOT });
for (const [p] of excluded) rmSync(join(TREE, p), { recursive: true, force: true });
for (const dir of ['android/keystore']) if (existsSync(join(TREE, dir)) && !readdirSync(join(TREE, dir)).length) rmSync(join(TREE, dir), { recursive: true });

const EMAIL = DRY && !args.email ? (() => { try { return noreply(); } catch { return 'noreply@users.noreply.github.com'; } })() : noreply();
const NAME = String(args.name ?? git(['config', 'user.name']));
const claude = join(TREE, 'CLAUDE.md');
if (existsSync(claude)) {
  const before = readFileSync(claude, 'utf8');
  const after = before.replace(/user\.email="[^"]+"/g, `user.email="${EMAIL}"`);
  writeFileSync(claude, after);
}

const ALLOWED_EMAILS = [/@example\.(com|test|org)$/i, /@users\.noreply\.github\.com$/i, /^quart\.gabriel\.pro@gmail\.com$/i, /@wikimedia\.org$/i, /^me@mail\.fr$/i];
const ALLOWED_PHONES = ['06 12 34 56 78', '+33 6 12 34 56 78'];
const LIVE_PUBLIC = /lfcehzltokzaymnqodgh|sb_publishable__SnC/;
const RULES = [
  { name: 'private key', rx: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'service or secret key', rx: /sb_secret_[A-Za-z0-9_-]{8,}|"role"\s*:\s*"service_role"/g },
  { name: 'json web token', rx: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'publishable key that is not the live one', rx: /sb_publishable_[A-Za-z0-9_-]{12,}/g, ok: (v) => LIVE_PUBLIC.test(v) || /your|example|staging_key/i.test(v) },
  { name: 'project ref that is not the live one', rx: /\b[a-z]{20}\.supabase\.co\b|--project-ref[= ]+[a-z]{20}\b/g, ok: (v) => LIVE_PUBLIC.test(v) },
  { name: 'Google API key', rx: /AIza[0-9A-Za-z_-]{30,}/g },
  { name: 'GitHub token', rx: /\bgh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'AdMob id that is not a test id', rx: /ca-app-pub-\d{16}[~/]\d{10}/g, ok: (v) => v.startsWith('ca-app-pub-3940256099942544') },
  { name: 'email address', rx: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, ok: (v) => ALLOWED_EMAILS.some((rx) => rx.test(v)) || /\.(png|js|svg|webp)$/i.test(v) },
  { name: 'phone number', rx: /(?<![\w#.])(?:\+33 ?[1-9]|0[1-9])(?:[ .]\d{2}){4}(?![\w.])/g, ok: (v) => ALLOWED_PHONES.includes(v) }
];
const BAD_FILES = [
  { name: 'env file', test: (p) => /(^|\/)\.env(\.|$)/.test(p) && !p.endsWith('.env.example') },
  { name: 'keystore or certificate', test: (p) => /\.(jks|keystore|p12|pem|key)$/i.test(p) },
  { name: 'Firebase config', test: (p) => /google-services\.json$/.test(p) },
  { name: 'special photo', test: (p) => /(^|\/)special\/.+\.(jpe?g|png|webp)$/i.test(p) }
];
const SKIP = /\.(mp3|ogg|wav|png|jpe?g|webp|ico|woff2?|ttf|otf)$|(^|\/)(package-lock\.json|Cargo\.lock)$/i;
const wordRx = PRIVATE_WORDS.map((w) => [w, new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu')]);

const mask = (v) => (v.length > 6 ? `${v.slice(0, 4)}***` : `${v.slice(0, 2)}***`);
const findings = [];
for (const path of kept) {
  for (const f of BAD_FILES) if (f.test(path)) findings.push(`${f.name}: ${path}`);
  if (SKIP.test(path)) continue;
  let text;
  try { text = readFileSync(join(TREE, path), 'utf8'); } catch { continue; }
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.rx)) {
      if (rule.ok?.(m[0])) continue;
      findings.push(`${rule.name}: ${mask(m[0])} in ${path}`);
    }
  }
  for (const [w, rx] of wordRx) if (rx.test(text)) findings.push(`private word ${mask(w)} in ${path}`);
}

const sweep = (() => {
  git(['init', '-q'], { cwd: TREE });
  git(['add', '-A'], { cwd: TREE });
  if (!existsSync(join(TREE, 'node_modules')) && existsSync(join(ROOT, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(TREE, 'node_modules'));
  try {
    return { ok: true, out: execFileSync(process.execPath, ['tools/sweep.mjs'], { cwd: TREE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() };
  }
})();
if (!sweep.ok) findings.push(...sweep.out.split('\n').filter(Boolean).map((l) => `sweep: ${l}`));
if (existsSync(join(TREE, 'node_modules')) && lstatSync(join(TREE, 'node_modules')).isSymbolicLink()) rmSync(join(TREE, 'node_modules'));

console.log(`ref ${REF} (${short}): ${all.length} files, ${kept.length} go out, ${excluded.length} left out`);
for (const [p, why] of excluded) console.log(`  left out (${why}): ${p}`);
console.log(`CLAUDE.md commit address: ${EMAIL}`);
console.log(`private words checked: ${PRIVATE_WORDS.length}${PRIVATE_WORDS.length ? '' : ' (tools/private-words.txt is missing: copy it from the private notes first)'}`);
console.log(sweep.ok ? sweep.out : 'sweep: FAILED');
if (findings.length) {
  console.log(`\n${findings.length} finding(s), nothing is committed:`);
  for (const f of findings) console.log(`  ${f}`);
}
if (DRY) {
  if (args.files) for (const p of kept) console.log(`  out: ${p}`);
  console.log(`\ndry run: snapshot tree left in ${TREE}`);
  process.exit(findings.length || !PRIVATE_WORDS.length ? 1 : 0);
}
if (findings.length || !PRIVATE_WORDS.length) process.exit(1);

let parent = null;
if (REMOTE) {
  try {
    git(['fetch', '-q', '--depth=1', REMOTE, BRANCH], { cwd: TREE, stdio: ['ignore', 'pipe', 'pipe'] });
    parent = git(['rev-parse', 'FETCH_HEAD'], { cwd: TREE });
  } catch {
    parent = null;
  }
}
const tree = git(['write-tree'], { cwd: TREE });
if (parent && git(['rev-parse', `${parent}^{tree}`], { cwd: TREE }) === tree) {
  console.log(`\nnothing changed since the last public snapshot (${parent.slice(0, 7)})`);
  process.exit(0);
}
const env = { ...process.env, GIT_AUTHOR_NAME: NAME, GIT_AUTHOR_EMAIL: EMAIL, GIT_COMMITTER_NAME: NAME, GIT_COMMITTER_EMAIL: EMAIL };
const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `Snapshot of ${short}`], { cwd: TREE, env });
git(['update-ref', `refs/heads/${BRANCH}`, commit], { cwd: TREE });
git(['symbolic-ref', 'HEAD', `refs/heads/${BRANCH}`], { cwd: TREE });
console.log(`\nsnapshot ${commit.slice(0, 7)} (${parent ? `on top of ${parent.slice(0, 7)}` : 'first snapshot, no parent'}) in ${TREE}`);
console.log('to publish it, run:');
console.log(`  git -C "${TREE}" push ${REMOTE ?? '<public remote url>'} ${commit}:refs/heads/${BRANCH}`);
