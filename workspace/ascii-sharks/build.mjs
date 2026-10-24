import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));
const assets = '<link rel="stylesheet" href="/ascii-sharks/background.css">\n<script type="module" src="/ascii-sharks/background.js"></script>\n';
const canvas = '<canvas id="ascii-sharks-background" aria-hidden="true" role="presentation"></canvas>\n';

export function withSharkBackground(html) {
  if (html.includes('id="ascii-sharks-background"')) return html;
  return html.replace(/<\/head\s*>/i, assets + '</head>')
    .replace(/(<body\b[^>]*>)/i, '$1\n' + canvas);
}

// One final pass also covers standalone experiments and generated playbook pages.
export async function buildSharkBackground(output) {
  const target = join(output, 'ascii-sharks');
  await mkdir(join(target, 'vendor'), { recursive: true });
  for (const file of ['background.js', 'background.css', 'NOTICE.txt']) {
    await cp(join(source, file), join(target, file));
  }
  for (const file of await readdir(join(source, 'vendor'))) {
    if (file.endsWith('.js')) await cp(join(source, 'vendor', file), join(target, 'vendor', file));
  }
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.html')) {
        await writeFile(path, withSharkBackground(await readFile(path, 'utf8')));
      }
    }
  }
  await visit(output);
}
