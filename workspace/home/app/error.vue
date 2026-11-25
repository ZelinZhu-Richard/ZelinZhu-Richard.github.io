<script setup>
// Shown only for an error inside the app (the site's own 404.html covers unknown URLs).
// Replaces Nuxt's default error pages so the release carries none of their assets.
import { useHead } from '#imports';

const props = defineProps({
  /** @type {import('vue').PropType<{ statusCode?: number }>} */
  error: { type: Object, default: () => ({}) },
});
const missing = props.error?.statusCode === 404;
useHead({ htmlAttrs: { lang: 'en' }, title: `${missing ? 'Not found' : 'Something went wrong'} — Richard Zhu` });
</script>

<template>
  <main id="main" class="page page-error">
    <h1 class="error-title">{{ missing ? 'Not found.' : 'Something went wrong.' }}</h1>
    <p class="error-link"><a href="/">Home</a></p>
  </main>
</template>
