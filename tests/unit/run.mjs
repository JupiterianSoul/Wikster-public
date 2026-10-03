import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('tests/unit').filter((n) => n.endsWith('.test.mjs')).sort();
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--import', './tests/lib/assets.mjs', `tests/unit/${file}`], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} unit file(s) failed` : `\nunit: ${files.length} file(s) passed`);
process.exit(failed ? 1 : 0);
