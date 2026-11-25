<script setup>
// The compact menu: the seven sections and Contact. A <details> disclosure, so it opens
// and closes without JavaScript; with it, Esc, a click outside, a link and a route change
// close it too.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from '#imports';
import content from '#build/site-content.mjs';
import { stoneItems } from '~/utils/stones.js';

const { ui } = content;
const stones = stoneItems(content.stones);
const details = ref(/** @type {HTMLDetailsElement | null} */ (null));
const route = useRoute();

/** @param {boolean} focusToggle */
function close(focusToggle) {
  const el = details.value;
  if (!el?.open) return;
  el.open = false;
  if (focusToggle) el.querySelector('summary')?.focus();
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key === 'Escape' && details.value?.open) {
    event.preventDefault();
    close(!!details.value.contains(document.activeElement));
  }
}

/** @param {PointerEvent} event */
function onPointerDown(event) {
  if (details.value?.open && !details.value.contains(/** @type {Node} */ (event.target))) close(false);
}

/** @param {MouseEvent} event */
function onPanelClick(event) {
  if (/** @type {Element} */ (event.target).closest?.('a')) close(false);
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onPointerDown);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('pointerdown', onPointerDown);
});
watch(() => route.fullPath, () => close(false));
</script>

<template>
  <details ref="details" class="menu">
    <summary class="menu-toggle">{{ ui.menu }}</summary>
    <nav class="menu-panel" :aria-label="ui.siteMenu" @click="onPanelClick">
      <ol class="menu-list">
        <li v-for="stone in stones" :key="stone.id">
          <a class="menu-link" :href="stone.href">
            <span class="menu-number">{{ stone.number }}</span>
            <span class="menu-title">{{ stone.title }}</span>
          </a>
        </li>
      </ol>
      <NuxtLink class="menu-link menu-contact" to="/contacts/">
        <span class="menu-number" aria-hidden="true">—</span>
        <span class="menu-title">{{ ui.contact }}</span>
      </NuxtLink>
    </nav>
  </details>
</template>
