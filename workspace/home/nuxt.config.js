// The homepage and Contact page. `npm run release` generates them statically and
// copies the result into release/, which the site build serves at / and /contacts/.
import { defineNuxtConfig } from 'nuxt/config';

const SITE = 'https://zelinzhu-richard.github.io';
const IMAGE = `${SITE}/richard.jpg`;
/** The only two pages. Trailing slashes make Nitro write index.html and contacts/index.html. */
const PAGES = ['/', '/contacts/'];
// scripts/check.mjs rebuilds into a scratch folder under _dev/ instead of .nuxt/ and .output/.
const OUTPUT = process.env.HOME_NUXT_OUTPUT;
const BUILD_DIR = process.env.HOME_NUXT_BUILD;

export default defineNuxtConfig({
  compatibilityDate: '2026-11-20',
  ...(BUILD_DIR ? { buildDir: BUILD_DIR } : {}),
  ssr: true,
  telemetry: false,
  devtools: { enabled: false },
  // No analytics, fonts or other modules. modules/site-content.js is registered automatically.
  modules: [],
  buildId: 'home',
  sourcemap: { client: false, server: false },
  spaLoadingTemplate: false,
  css: ['~/assets/css/home.css'],
  app: {
    baseURL: '/',
    buildAssetsDir: '/_home/',
    rootId: '__home',
    head: {
      htmlAttrs: { lang: 'en' },
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      meta: [
        { name: 'theme-color', content: '#100f15' },
        { name: 'color-scheme', content: 'dark' },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: IMAGE },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: IMAGE },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  experimental: {
    appManifest: false,
    payloadExtraction: false,
  },
  nitro: {
    prerender: {
      routes: PAGES,
      crawlLinks: false,
      // Nuxt adds these SPA fallbacks to every static build; this site has its own 404.
      ignore: ['/200.html', '/404.html'],
      failOnError: true,
    },
    ...(OUTPUT ? { output: { dir: OUTPUT } } : {}),
  },
  vite: {
    // The story page imports gsap lazily; pre-bundling it keeps `nuxt dev` from reloading
    // the page the first time those imports run. No effect on the release build.
    optimizeDeps: { include: ['gsap', 'gsap/ScrollTrigger', 'gsap/SplitText'] },
    $client: {
      build: {
        rolldownOptions: {
          output: {
            // three.js gets a chunk of its own, loaded only when the scene loads.
            codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }] },
            chunkFileNames: chunk => (chunk.name === 'three' ? '_home/three.[hash].js' : '_home/[hash].js'),
          },
        },
      },
    },
  },
});
