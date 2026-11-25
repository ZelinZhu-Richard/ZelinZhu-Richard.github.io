// npm run release (or npm run home): generate the two pages and replace release/ with
// the allowlisted output plus stamp.json. release/ is committed; the site build copies it.
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { RELEASE_DIR, STAMP_FILE, checkRelease, inventory, sourceHash } from '../stamp.mjs';
import { collect, generate } from './generate.mjs';

const before = await sourceHash();
const publicDir = generate();
const { kept, dropped } = await collect(publicDir);
if (await sourceHash() !== before) throw new Error('Home sources changed during nuxt generate; run the release again.');

await rm(RELEASE_DIR, { recursive: true, force: true });
for (const file of kept) {
  await mkdir(dirname(join(RELEASE_DIR, file)), { recursive: true });
  await copyFile(join(publicDir, file), join(RELEASE_DIR, file));
}
const files = await inventory(RELEASE_DIR, kept);
await writeFile(join(RELEASE_DIR, STAMP_FILE), `${JSON.stringify({ sourceHash: before, files }, null, 2)}\n`);
await checkRelease();

const bytes = files.reduce((sum, entry) => sum + entry.bytes, 0);
console.log(`\nHome release: ${files.length} files, ${(bytes / 1024).toFixed(1)} KiB in workspace/home/release/`);
for (const entry of files) console.log(`  ${entry.file}  ${(entry.bytes / 1024).toFixed(1)} KiB`);
if (dropped.length) console.log(`Not released: ${dropped.join(', ')}`);
