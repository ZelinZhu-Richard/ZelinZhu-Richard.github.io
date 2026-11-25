// Writes licenses.txt (served at /colophon/licenses.txt) from the packages installed in workspace/home/node_modules.
// Run it after the homepage's packages change: node workspace/colophon/licenses.mjs
// It needs those packages installed, so CI never runs it; the test compares the file with them where they exist.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const modules = join(root, 'workspace/home/node_modules');
const pkg = name => JSON.parse(readFileSync(join(modules, name, 'package.json'), 'utf8'));
const licenseFile = name => {
  const file = readdirSync(join(modules, name)).find(f => /^licen[cs]e(\.md|\.txt)?$/i.test(f));
  if (!file) throw new Error(`no license file in ${name}`);
  return readFileSync(join(modules, name, file), 'utf8').replace(/\r\n/g, '\n').trim();
};

// The four libraries the homepage is built on, then the small helpers that Nuxt's client runtime and Vue import.
const MAIN = ['nuxt', 'vue', 'three'];
const HELPERS = ['@vue/runtime-core', '@vue/runtime-dom', '@vue/reactivity', '@vue/shared', 'vue-router', '@unhead/vue', 'unhead', 'ufo', 'hookable', 'defu', 'destr', 'ofetch', 'klona', 'ohash', 'cookie-es', 'perfect-debounce', 'unctx', 'devalue', 'errx', 'uncrypto', 'nostics', 'object-identity', 'fnv1a-64'];

const rule = '-'.repeat(72);
const section = name => {
  const p = pkg(name);
  return `${rule}\n${name} ${p.version} (${p.license})\n${rule}\n\n${licenseFile(name)}\n`;
};
const gsap = pkg('gsap');

const out = `Third-party licenses: the homepage and the Contact page

The homepage (/) and the Contact page (/contacts/) are a Nuxt app, built ahead of
time and committed (workspace/home in the site's repository). Their JavaScript
bundles code from the packages below. The minifier drops the license comments, so
the notices are collected here instead, copied from each package as installed.

The first four are the libraries the pages are built on. The rest are small
helpers that Nuxt's client runtime and Vue import; a build may leave some of them
out, and they are listed so that none is missed.

The scene, its models, textures, shaders, choreography and sounds are not
third-party: they are made by the scripts in workspace/home/assets-src and
workspace/home/engine.

${rule}
gsap ${gsap.version}, with its ScrollTrigger and SplitText plugins
${rule}

GSAP is not open source. It is free to use under GreenSock's standard
"no charge" license. The package ships no license file; this is the notice
from its source files:

  Copyright 2008-2026, GreenSock. All rights reserved.
  Subject to the terms at https://gsap.com/standard-license

${[...MAIN, ...HELPERS].map(section).join('\n')}`;

writeFileSync(join(root, 'workspace/colophon/licenses.txt'), out);
console.log('wrote', out.length, 'chars,', MAIN.length + HELPERS.length + 1, 'packages');
