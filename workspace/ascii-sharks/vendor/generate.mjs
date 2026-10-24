import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Run locally with Node's built-in TypeScript transformer (Node 22.13+ / 24+).
// The site's build consumes the checked-in browser ESM and needs no transformer.
const modules = ['engine', 'index', 'math', 'renderer', 'species', 'world'];
for (const name of modules) {
  const source = await readFile(new URL(`source/${name}.ts`, import.meta.url), 'utf8');
  const javascript = stripTypeScriptTypes(source, { mode: 'transform' }).replace(
    /\bfrom\s+(["'])(\.{1,2}\/[^"']+)\1/g,
    (_, quote, path) => `from ${quote}${path.endsWith('.js') ? path : `${path}.js`}${quote}`,
  );
  const banner = `// Generated from source/${name}.ts by generate.mjs; edit the TypeScript source.\n`;
  await writeFile(new URL(`${name}.js`, import.meta.url), banner + javascript.trimEnd() + '\n');
}
