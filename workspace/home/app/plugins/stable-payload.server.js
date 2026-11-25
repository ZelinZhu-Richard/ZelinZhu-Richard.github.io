// Nuxt stamps each prerendered page with Date.now() (payload.prerenderedAt), so two
// builds of the same sources would differ. The client only checks that the value is
// truthy, so a constant keeps the meaning and makes release/ reproducible (npm run check).
import { defineNuxtPlugin } from '#imports';

export default defineNuxtPlugin(nuxtApp => {
  if (import.meta.prerender && nuxtApp.payload.prerenderedAt) nuxtApp.payload.prerenderedAt = 1;
});
