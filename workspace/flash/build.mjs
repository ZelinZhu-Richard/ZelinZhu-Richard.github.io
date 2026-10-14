import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const source = fileURLToPath(new URL('.', import.meta.url));
const files = ['index.html', 'card.css', 'editor.css', 'editor.js', 'state.js', 'renderer.js', 'storage.js', 'export.js', 'assets/InstrumentSerif-Regular.ttf', 'assets/OFL.txt'];
export async function buildFlash(output) {
  const destination = join(output, 'flash');
  await mkdir(join(destination, 'assets'), { recursive: true });
  for (const file of files) await copyFile(join(source, file), join(destination, file));
  const css = await readFile(join(source, 'card.css'), 'utf8');
  const font = (await readFile(join(source, 'assets/InstrumentSerif-Regular.ttf'))).toString('base64');
  await writeFile(join(destination, 'export-assets.js'), `export const exportAssets = ${JSON.stringify({ css, font })};\n`);
}
