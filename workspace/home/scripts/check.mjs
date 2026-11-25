// npm run check: rebuild from scratch into _dev/check-*/ and compare with release/.
// Passes only when release/ is fresh and a clean rebuild reproduces it byte for byte.
// The scratch folder is removed on success and kept on failure for inspection.
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { HOME_ROOT, checkRelease, inventory } from '../stamp.mjs';
import { collect, generate } from './generate.mjs';

const stamp = await checkRelease();
await mkdir(join(HOME_ROOT, '_dev'), { recursive: true });
const scratch = await mkdtemp(join(HOME_ROOT, '_dev', 'check-'));
const publicDir = generate({ output: join(scratch, '.output'), buildDir: join(scratch, '.nuxt') });
const { kept } = await collect(publicDir);
const fresh = new Map((await inventory(publicDir, kept)).map(entry => [entry.file, entry]));
const released = new Map(stamp.files.map(entry => [entry.file, entry]));

const problems = [];
for (const [file, entry] of fresh) {
  const old = released.get(file);
  if (!old) problems.push(`only in the rebuild: ${file}`);
  else if (old.sha256 !== entry.sha256) problems.push(`differs: ${file} (${old.bytes} -> ${entry.bytes} bytes)`);
}
for (const file of released.keys()) if (!fresh.has(file)) problems.push(`only in release/: ${file}`);

if (problems.length) {
  console.error(`Home rebuild does not match release/ (scratch kept at ${scratch}):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  await rm(scratch, { recursive: true, force: true });
  console.log(`Home rebuild matches release/: ${fresh.size} files.`);
}
