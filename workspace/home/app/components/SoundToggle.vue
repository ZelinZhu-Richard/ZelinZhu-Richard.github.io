<script setup>
// Sound on or off: a toggle button (aria-pressed), off by default. The choice persists in
// localStorage (useSound.js, SOUND_KEY) and goes through the window contract, so
// window.__home.setSound and this button always agree. Audio is unlocked inside the
// click itself, the one place browsers let it start. Hidden without JavaScript (CSS).
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useNuxtApp } from '#imports';
import content from '#build/site-content.mjs';
import { HOME_EVENTS, HOME_GLOBAL } from '~~/contract.mjs';
import { sceneState } from '~/composables/useScene.js';
import { armUnlock, readStoredSound, storeSound, unlockAudio } from '~/composables/useSound.js';

const { ui } = content;
const on = ref(false);
const nuxtApp = useNuxtApp();
/** The client plugin's API; absent on the server. */
const contract = () => /** @type {any} */ (nuxtApp).$homeContract;

function toggle() {
  const next = !on.value;
  if (next) unlockAudio();
  const api = contract();
  if (api) api.setSound(next);
  else {
    on.value = next;
    storeSound(next);
  }
}

/** @param {Event} event */
function onSound(event) {
  on.value = !!(/** @type {CustomEvent} */ (event).detail?.sound);
  storeSound(on.value);
}

onMounted(() => {
  window.addEventListener(HOME_EVENTS.sound, onSound);
  on.value = !!(/** @type {any} */ (window))[HOME_GLOBAL]?.sound;
  if (!on.value && readStoredSound()) {
    contract()?.setSound(true);
    // Remembered "on": audio can only start at the next gesture, so pass it on then.
    armUnlock(() => contract()?.setSound(true));
  }
});
onBeforeUnmount(() => window.removeEventListener(HOME_EVENTS.sound, onSound));
</script>

<template>
  <button
    type="button"
    class="sound-toggle"
    :class="{ 'is-still': sceneState.reducedMotion }"
    :aria-pressed="on ? 'true' : 'false'"
    @click="toggle"
  >
    <span class="sound-label">{{ ui.sound }}</span>
    <span class="sound-bars" aria-hidden="true"><span /><span /><span /></span>
  </button>
</template>
