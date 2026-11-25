<script setup>
// A hairline at the top and a small mono count while the engine loads (scene.load's
// onProgress). It never covers text or takes input, and it only appears if loading takes
// longer than a moment (CSS delay).
import { computed } from 'vue';
import content from '#build/site-content.mjs';
import { HOME_WEBGL } from '~~/contract.mjs';
import { sceneState } from '~/composables/useScene.js';

const { ui } = content;
const visible = computed(() => sceneState.webgl === HOME_WEBGL.on && sceneState.loading);
const percent = computed(() => Math.round(sceneState.loadProgress * 100));
</script>

<template>
  <Transition name="preloader">
    <div v-if="visible" class="preloader" aria-hidden="true">
      <span class="preloader-bar" :style="{ transform: `scaleX(${sceneState.loadProgress})` }" />
      <span class="preloader-label">{{ ui.loading }} {{ percent }}%</span>
    </div>
  </Transition>
</template>
