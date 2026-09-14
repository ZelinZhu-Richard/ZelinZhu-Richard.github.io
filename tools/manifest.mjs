import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const file = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not permitted in site output: ${file}`);
    if (entry.isDirectory()) files.push(...await inventory(`${directory}/${entry.name}`, `${file}/`));
    else {
      const data = await readFile(`${directory}/${entry.name}`);
      files.push({ file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    }
  }
  return files;
}
export async function verifyManifest() {
  const manifest = JSON.parse(await readFile('asset-manifest.json', 'utf8'));
  const actual = await inventory('public');
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error('Public files differ from asset-manifest.json. Review changes, then run npm run manifest.');
  console.log(`Verified ${actual.length} public files against SHA-256 inventory.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await inventory('public');
  await writeFile('asset-manifest.json', JSON.stringify({ source: 'Adapted from the local noomo-storytelling project; see THIRD_PARTY.md', files }, null, 2) + '\n');
  console.log(`Recorded ${files.length} public files.`);
}
