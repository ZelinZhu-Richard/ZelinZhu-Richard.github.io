<script setup>
// Section 18: the seven stones, as real links to the seven sections of the site.
// - Placed: while the engine reports sphere positions ('stones:screen'), each link sits on
//   its sphere with a number, a title and a hairline leader, positioned by utils/stones.js.
// - List: otherwise (no WebGL, the stub, no positions yet) they are a tidy numbered list.
// - Hover and focus highlight the stone (scene.focusStone) and play the hover sound.
// - With a scene, a click or Enter opens a small panel and travels: scene.release(id),
//   then location.assign(href). A tap on a touch screen opens the panel first (a second
//   tap, or Open, travels). Esc closes the panel and cancels the trip. Without a scene the
//   links are ordinary links.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import content from '#build/site-content.mjs';
import { HOME_WEBGL } from '~~/contract.mjs';
import { focusStone, onSceneStoneClick, pickStone, releaseStone, sceneHot, sceneRef, sceneState, stonesScreen } from '~/composables/useScene.js';
import { playHover } from '~/composables/useSound.js';
import { storyState } from '~/composables/useStoryMotion.js';
import { normaliseScreen, placeLabels, stoneItems } from '~/utils/stones.js';

const props = defineProps({
  /** @type {import('vue').PropType<import('../utils/sections.js').StorySection>} */
  section: { type: Object, required: true },
});

/** How long the panel shows before the trip when release() resolves at once (ms). */
const PANEL_HOLD_MS = 420;
/** The trip goes ahead even if release() never resolves (ms). */
const RELEASE_TIMEOUT_MS = 4000;

const { ui } = content;
const stones = stoneItems(content.stones);
const ids = stones.map(stone => stone.id);
const byId = new Map(stones.map(stone => [stone.id, stone]));
const indexOf = new Map(stones.map((stone, index) => [stone.id, index]));

const root = ref(/** @type {HTMLElement | null} */ (null));
const openLink = ref(/** @type {HTMLAnchorElement | null} */ (null));
/** @type {import('vue').Ref<import('../utils/stones.js').StoneItem | null>} */
const panel = ref(null);
/** The stone being travelled to, or null. */
const travelling = ref(/** @type {string | null} */ (null));
/** The stone under the pointer or keyboard focus on the page. */
const hovered = ref(/** @type {string | null} */ (null));
/** The stones frame is up: staged, it is the active frame; unstaged, it is part of the page. */
const inView = computed(() => (storyState.staged ? storyState.active === props.section.index : true));

const points = computed(() => normaliseScreen(stonesScreen.value, ids));
/** Set once the engine has reported real positions; an empty report later keeps the placed layout (all hidden). */
const everPlaced = ref(false);
const placed = computed(() => sceneState.webgl === HOME_WEBGL.on && !!points.value && (points.value.length > 0 || everPlaced.value));
const hotId = computed(() => panel.value?.id ?? hovered.value ?? sceneHot.value ?? null);
const status = computed(() => (travelling.value && panel.value ? `${ui.opening} ${panel.value.title}` : ''));

/** @type {Map<string, HTMLElement>} */ const items = new Map();
/** @type {Map<string, HTMLAnchorElement>} */ const links = new Map();
/** @type {Map<string, HTMLElement>} */ const labels = new Map();
/** @type {Map<string, SVGGElement>} */ const leaders = new Map();
/** @param {Map<string, any>} map @param {string} id */
const keep = (map, id) => (/** @type {any} */ el) => { if (el) map.set(id, el); else map.delete(id); };

/** @type {Map<string, [number, number]> | null} */
let sizes = null;
let frame = 0;
let travelToken = 0;
let pointerKind = '';
let lastLinkClick = { id: '', at: 0 };
let disposed = false;
/** @type {(() => void) | null} */
let offStoneClick = null;

// ---- placement ------------------------------------------------------------------------

function requestLayout() {
  if (!frame && !disposed) frame = requestAnimationFrame(layout);
}

function measure() {
  sizes = new Map();
  for (const [id, label] of labels) sizes.set(id, [Math.ceil(label.offsetWidth), Math.ceil(label.offsetHeight)]);
}

function clearPlacement() {
  for (const item of items.values()) {
    item.style.transform = '';
    item.style.removeProperty('--d');
    delete item.dataset.hidden;
  }
  for (const label of labels.values()) label.style.transform = '';
}

/** Puts every link on its sphere; positions are viewport px, converted to this frame. */
function layout() {
  frame = 0;
  const host = root.value;
  const list = points.value;
  if (!host || !placed.value || !list) return;
  if (!sizes) measure();
  const rect = host.getBoundingClientRect();
  const top = document.querySelector('.masthead')?.getBoundingClientRect().bottom || 0;
  const boxes = placeLabels(list, /** @type {Map<string, [number, number]>} */ (sizes), { width: window.innerWidth, height: window.innerHeight, top });
  const byPoint = new Map(list.map(point => [point.id, point]));
  for (const id of ids) {
    const item = items.get(id);
    const label = labels.get(id);
    const leader = leaders.get(id);
    if (!item || !label) continue;
    const point = byPoint.get(id);
    const box = boxes.get(id);
    const shown = !!(inView.value && point?.visible && box);
    if (shown) delete item.dataset.hidden;
    else item.dataset.hidden = '';
    if (leader) {
      if (shown) delete leader.dataset.hidden;
      else leader.dataset.hidden = '';
    }
    if (!point) continue;
    item.style.transform = `translate3d(${(point.x - rect.left).toFixed(1)}px, ${(point.y - rect.top).toFixed(1)}px, 0)`;
    item.style.setProperty('--d', `${Math.max(2 * point.r, 44).toFixed(1)}px`);
    if (!box) continue;
    label.style.transform = `translate3d(${(box.x - point.x).toFixed(1)}px, ${(box.y - point.y).toFixed(1)}px, 0)`;
    if (leader) {
      const [line, dot] = /** @type {[SVGLineElement, SVGCircleElement]} */ (/** @type {unknown} */ ([leader.children[0], leader.children[1]]));
      const { x1, y1, x2, y2 } = box.leader;
      line.setAttribute('x1', (x1 - rect.left).toFixed(1));
      line.setAttribute('y1', (y1 - rect.top).toFixed(1));
      line.setAttribute('x2', (x2 - rect.left).toFixed(1));
      line.setAttribute('y2', (y2 - rect.top).toFixed(1));
      dot.setAttribute('cx', (x1 - rect.left).toFixed(1));
      dot.setAttribute('cy', (y1 - rect.top).toFixed(1));
    }
  }
}

watch(points, list => {
  if (list?.length) everPlaced.value = true;
  requestLayout();
});
watch(placed, async on => {
  sizes = null;
  await nextTick();
  if (on) requestLayout();
  else clearPlacement();
});

const onScroll = () => {
  if (placed.value && inView.value) requestLayout();
};
const onResize = () => {
  sizes = null;
  requestLayout();
};

// ---- hover, focus, sound ----------------------------------------------------------------

watch(hotId, (id, previous) => {
  focusStone(id);
  if (id && id !== previous) playHover(indexOf.get(id) ?? 0);
});

/** @param {PointerEvent} event @param {string} id */
function onEnter(event, id) {
  if (event.pointerType !== 'touch') hovered.value = id;
}
/** @param {string} id */
function onLeave(id) {
  if (hovered.value === id) hovered.value = null;
}

// ---- panel and travel -------------------------------------------------------------------

/** @param {number} ms */
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function cancelTravel() {
  travelToken++;
  travelling.value = null;
}

/** @param {import('../utils/stones.js').StoneItem} stone */
async function travel(stone) {
  if (travelling.value === stone.id) return;
  const token = ++travelToken;
  travelling.value = stone.id;
  const hold = sceneState.reducedMotion ? 0 : PANEL_HOLD_MS;
  await Promise.race([Promise.all([releaseStone(stone.id), wait(hold)]), wait(RELEASE_TIMEOUT_MS)]);
  if (token !== travelToken || disposed) return;
  window.location.assign(stone.href);
}

/**
 * @param {import('../utils/stones.js').StoneItem} stone
 * @param {boolean} moveFocus
 */
async function openPanel(stone, moveFocus) {
  if (panel.value?.id !== stone.id) cancelTravel();
  panel.value = stone;
  if (!moveFocus) return;
  await nextTick();
  openLink.value?.focus({ preventScroll: true });
}

/** @param {boolean} restoreFocus */
function closePanel(restoreFocus) {
  const id = panel.value?.id;
  cancelTravel();
  if (!id) return;
  panel.value = null;
  if (restoreFocus) links.get(id)?.focus({ preventScroll: true });
}

/**
 * @param {import('../utils/stones.js').StoneItem} stone
 * @param {'mouse' | 'touch' | 'keyboard'} kind
 */
function activate(stone, kind) {
  if (kind === 'touch') {
    if (panel.value?.id === stone.id) travel(stone);
    else openPanel(stone, true);
    return;
  }
  openPanel(stone, kind === 'keyboard');
  travel(stone);
}

/** @param {MouseEvent} event */
const modified = event => event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

/** @param {PointerEvent} event */
function onPointerDown(event) {
  pointerKind = event.pointerType;
}

/**
 * @param {MouseEvent} event
 * @param {import('../utils/stones.js').StoneItem} stone
 */
function onStoneClick(event, stone) {
  if (!sceneRef.value || modified(event)) return;
  event.preventDefault();
  const kind = event.detail === 0 ? 'keyboard' : pointerKind === 'touch' ? 'touch' : 'mouse';
  pointerKind = '';
  lastLinkClick = { id: stone.id, at: performance.now() };
  activate(stone, kind);
}

/**
 * @param {MouseEvent} event
 * @param {import('../utils/stones.js').StoneItem} stone
 */
function onOpenClick(event, stone) {
  // A second press while already on the way: let the link go now.
  if (!sceneRef.value || modified(event) || travelling.value === stone.id) return;
  event.preventDefault();
  travel(stone);
}

/** A click on the frame itself: ask the scene what is under it, else close the panel. */
function onFrameClick(/** @type {MouseEvent} */ event) {
  const target = /** @type {Element} */ (event.target);
  if (target.closest?.('a, button, .stone-panel')) return;
  const id = pickStone(event.clientX, event.clientY);
  const stone = id ? byId.get(id) : null;
  const kind = pointerKind === 'touch' ? 'touch' : 'mouse';
  pointerKind = '';
  if (stone) activate(stone, kind);
  else closePanel(false);
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Escape' || !panel.value) return;
  event.preventDefault();
  closePanel(!!root.value?.contains(document.activeElement));
}

/** @param {PointerEvent} event */
function onDocumentPointerDown(event) {
  if (panel.value && root.value && !root.value.contains(/** @type {Node} */ (event.target))) closePanel(false);
}

/** Back/forward cache: the page comes back as it was left, panel and trip included. */
function onPageShow(/** @type {PageTransitionEvent} */ event) {
  if (!event.persisted) return;
  cancelTravel();
  panel.value = null;
  hovered.value = null;
}

watch(inView, on => {
  if (!on) {
    closePanel(false);
    hovered.value = null;
  }
  requestLayout();
});

onMounted(() => {
  offStoneClick = onSceneStoneClick(detail => {
    const stone = byId.get(detail.id);
    if (!stone || !inView.value) return;
    if (lastLinkClick.id === stone.id && performance.now() - lastLinkClick.at < 400) return;
    activate(stone, 'mouse');
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  if (placed.value) requestLayout();
});

onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(frame);
  offStoneClick?.();
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('pageshow', onPageShow);
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  cancelTravel();
  focusStone(null);
});
</script>

<template>
  <StorySection :section="section">
    <div
      ref="root"
      class="stones"
      :class="placed ? 'is-placed' : 'is-list'"
      @click="onFrameClick"
      @pointerdown.capture="onPointerDown"
    >
      <svg v-if="placed" class="stones-leaders" aria-hidden="true" focusable="false">
        <g v-for="stone in stones" :key="stone.id" :ref="keep(leaders, stone.id)" :class="{ 'is-hot': hotId === stone.id }">
          <line x1="0" y1="0" x2="0" y2="0" />
          <circle cx="0" cy="0" r="1.7" />
        </g>
      </svg>
      <nav class="stones-nav" :aria-label="ui.sections">
        <ol class="stones-list">
          <li
            v-for="stone in stones"
            :key="stone.id"
            :ref="keep(items, stone.id)"
            class="stone"
            :class="{ 'is-hot': hotId === stone.id, 'is-open': panel?.id === stone.id }"
          >
            <a
              :ref="keep(links, stone.id)"
              class="stone-link"
              :href="stone.href"
              :data-stone="stone.id"
              @click="onStoneClick($event, stone)"
              @pointerenter="onEnter($event, stone.id)"
              @pointerleave="onLeave(stone.id)"
              @focus="hovered = stone.id"
              @blur="onLeave(stone.id)"
            >
              <span class="stone-hit" aria-hidden="true" />
              <span :ref="keep(labels, stone.id)" class="stone-label">
                <span class="stone-number">{{ stone.number }}</span>
                <span class="stone-title">{{ stone.title }}</span>
                <span class="stone-subtitle">{{ stone.subtitle }}</span>
              </span>
            </a>
          </li>
        </ol>
      </nav>
      <Transition name="stone-panel">
        <div
          v-if="panel"
          class="stone-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="stone-panel-title"
          :data-travelling="travelling === panel.id ? '' : undefined"
        >
          <p class="stone-panel-number">{{ panel.number }}</p>
          <p id="stone-panel-title" class="stone-panel-title">{{ panel.title }}</p>
          <p class="stone-panel-subtitle">{{ panel.subtitle }}</p>
          <a ref="openLink" class="cue-link stone-panel-open" :href="panel.href" @click="onOpenClick($event, panel)">
            {{ ui.open }}<span class="cue-rule" aria-hidden="true" />
          </a>
          <button type="button" class="stone-panel-close" :aria-label="ui.close" @click="closePanel(true)">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </Transition>
      <p class="visually-hidden" aria-live="polite">{{ status }}</p>
    </div>
  </StorySection>
</template>
