import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

// Runtime files only: never docs, tests, seed files, _private or .qa.
export const HQ_FILES = Object.freeze(['index.html', 'style.css', 'app.js', 'store.js', 'helpers.js', 'sync.js']);

// Supabase mode shares Daily's project settings (workspace/daily/app/cloud-config.js) and its vendored
// supabase-js (/daily/vendor/supabase.js, same origin, so script-src 'self' still holds). With a project
// configured, the CSP allows exactly that origin for fetches; otherwise connect-src stays 'none'.
export async function cloudSettings() {
  const { CLOUD } = await import(pathToFileURL(join(source, '..', 'daily', 'app', 'cloud-config.js')).href);
  return CLOUD;
}

export function withConnectSrc(html, cloud) {
  if (!cloud?.url || !cloud?.anonKey) return html;
  const origin = new URL(cloud.url).origin;
  if (!html.includes("connect-src 'none'")) throw new Error('hq/index.html must carry connect-src \'none\' for build.mjs to replace.');
  return html.replace("connect-src 'none'", `connect-src ${origin}`);
}

export async function buildHq(output, { cloud } = {}) {
  const target = join(output, 'hq');
  await mkdir(target, { recursive: true });
  for (const file of HQ_FILES) if (file !== 'index.html') await cp(join(source, file), join(target, file));
  const html = await readFile(join(source, 'index.html'), 'utf8');
  await writeFile(join(target, 'index.html'), withConnectSrc(html, cloud ?? await cloudSettings()));
}
