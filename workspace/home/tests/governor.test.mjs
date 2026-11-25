// The quality governor (engine/quality/governor.js) on synthetic frame-time
// traces, plus sanity checks of the tier table and the first-guess rules.
// Pure: nothing here needs three or a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGovernor, runGovernor, GOVERNOR_DEFAULTS } from '../engine/quality/governor.js';
import { TIERS, MIN_TIER, MAX_TIER, LARGE_FRAME_PIXELS, MIN_DPR, clampTier, tierSettings, tierForQuality, effectiveDpr, msaaSamples } from '../engine/quality/tiers.js';
import { detectTier, classifyGpu, readSignals, detectQuality } from '../engine/quality/detect.js';
import { SCENE_QUALITY } from '../contract.mjs';

const HZ60 = 1000 / 60;
const framesFor = (seconds, ms) => Math.ceil((seconds * 1000) / ms);
const steady = (seconds, ms) => Array(framesFor(seconds, ms)).fill(ms);

/**
 * The no-oscillation contract: one tier per step, each decision starts where
 * the last one ended, and nothing goes up once anything has gone down.
 */
function assertNoOscillation(decisions, label) {
  let dropped = false;
  decisions.forEach((d, i) => {
    assert.equal(Math.abs(d.to - d.from), 1, `${label}: one tier per step`);
    assert.equal(d.direction, d.to > d.from ? 'up' : 'down', `${label}: direction`);
    if (i > 0) assert.equal(d.from, decisions[i - 1].to, `${label}: decisions chain`);
    if (d.direction === 'down') dropped = true;
    else assert.ok(!dropped, `${label}: raised after a drop: ${JSON.stringify(decisions)}`);
  });
}

const summary = (decisions) => decisions.map((d) => `${d.from}->${d.to}`);

test('steady fast: one raise, only after a long stable period, then nothing', () => {
  const { decisions, governor } = runGovernor(steady(180, HZ60), { tier: 2, maxTier: 3 });
  assertNoOscillation(decisions, 'steady fast');
  assert.deepEqual(summary(decisions), ['2->3']);
  assert.equal(decisions[0].reason, 'stable');
  assert.ok(decisions[0].atMs >= GOVERNOR_DEFAULTS.raiseAfterMs, `raised after ${decisions[0].atMs} ms`);
  assert.equal(governor.tier, 3);
});

test('steady fast at the ceiling: no change at all', () => {
  const { decisions, governor } = runGovernor(steady(180, HZ60), { tier: 2, maxTier: 2 });
  assert.deepEqual(decisions, []);
  assert.equal(governor.tier, 2);
});

test('steady slow (open loop): drops within a few seconds, then freezes when dropping did not help', () => {
  const { decisions, governor } = runGovernor(steady(60, 28), { tier: 2 });
  assertNoOscillation(decisions, 'steady slow');
  assert.deepEqual(summary(decisions), ['2->1']);
  assert.equal(decisions[0].reason, 'slow');
  assert.ok(decisions[0].atMs < 5000, `first drop at ${decisions[0].atMs} ms`);
  assert.equal(governor.frozen, true);
});

test('steady slow (closed loop): drops one tier at a time until frames fit, then holds', () => {
  const cost = [12, 18, 28, 40]; // ms per frame at tiers 0..3
  const { decisions, governor, tiers } = runGovernor((i, tier) => cost[tier], { tier: 3, frames: framesFor(240, 18) });
  assertNoOscillation(decisions, 'closed loop');
  assert.deepEqual(summary(decisions), ['3->2', '2->1']);
  assert.equal(governor.tier, 1);
  assert.equal(governor.frozen, false);
  assert.equal(tiers.at(-1), 1);
});

test('spiky: GC hitches, one long frame every 20 and tab pauses change nothing', () => {
  const trace = Array.from({ length: framesFor(180, HZ60) }, (_, i) => {
    if (i % 2000 === 1999) return 5000; // a hidden tab: ignored
    if (i % 500 === 250) return 300; // a GC or compile hitch
    if (i % 20 === 7) return 70; // a dropped frame every third of a second
    return HZ60 + ((i * 7919) % 13) / 10; // vsync jitter
  });
  const { decisions, governor } = runGovernor(trace, { tier: 2 });
  assert.deepEqual(decisions, [], JSON.stringify(decisions));
  assert.equal(governor.tier, 2);
  assert.ok(governor.snapshot().ignored >= 3, 'pauses are ignored, not counted as slow');
});

test('slow then fast: one drop, never back up', () => {
  const { decisions, governor } = runGovernor([...steady(10, 30), ...steady(300, HZ60)], { tier: 2 });
  assertNoOscillation(decisions, 'slow then fast');
  assert.deepEqual(summary(decisions), ['2->1']);
  assert.equal(governor.tier, 1);
  assert.equal(governor.ceiling, 1, 'the failed tier is above the ceiling for good');
});

test('a probe that fails: up once, down once, never again (10 minutes)', () => {
  const cost = [10, 12, HZ60, 24]; // tier 3 is too heavy for this device
  const { decisions, governor } = runGovernor((i, tier) => cost[tier], { tier: 2, frames: framesFor(600, HZ60) });
  assertNoOscillation(decisions, 'failed probe');
  assert.deepEqual(summary(decisions), ['2->3', '3->2']);
  assert.equal(governor.tier, 2);
  assert.equal(governor.ceiling, 2);
});

test('judder (every other frame misses vsync) counts as slow', () => {
  const trace = Array.from({ length: framesFor(20, 25) }, (_, i) => (i % 2 ? 2 * HZ60 : HZ60));
  const { decisions } = runGovernor(trace, { tier: 2 });
  assert.equal(decisions[0]?.direction, 'down', JSON.stringify(decisions));
});

test('a 30 Hz display or power cap: at most one wasted drop, then frozen', () => {
  const { decisions, governor } = runGovernor(steady(120, 2 * HZ60), { tier: 3 });
  assertNoOscillation(decisions, '30 Hz cap');
  assert.equal(decisions.length, 1);
  assert.equal(governor.frozen, true);
  assert.equal(governor.tier, 2);
});

test('limits hold and junk input is ignored', () => {
  const low = runGovernor(steady(60, 40), { tier: 0 });
  assert.deepEqual(low.decisions, [], 'never below minTier');
  const floor = runGovernor(steady(60, 40), { tier: 2, minTier: 2 });
  assert.deepEqual(floor.decisions, [], 'never below a raised minTier');

  const g = createGovernor({ tier: 1 });
  for (const junk of [Number.NaN, -1, 0, Number.POSITIVE_INFINITY, '16', null, undefined, {}]) assert.equal(g.push(/** @type {any} */ (junk)), null);
  const snap = g.snapshot();
  assert.equal(snap.ignored, 8);
  assert.equal(snap.frames, 0);
  assert.equal(g.tier, 1);

  assert.equal(createGovernor({ tier: 9 }).tier, MAX_TIER);
  assert.equal(createGovernor({ tier: 3, maxTier: 1 }).tier, 1);
  assert.equal(createGovernor({ tier: 0, minTier: 2, maxTier: 3 }).tier, 2);
  assert.throws(() => createGovernor({ budgetMs: -1 }), TypeError);
  assert.throws(() => createGovernor({ windowFrames: 0 }), TypeError);
  assert.throws(() => createGovernor({ dropShare: /** @type {any} */ ('x') }), TypeError);
});

test('deterministic and resettable', () => {
  const trace = Array.from({ length: framesFor(90, HZ60) }, (_, i) => (i < 900 ? 26 + (i % 7) : HZ60 + (i % 3)));
  const a = runGovernor(trace, { tier: 3 });
  const b = runGovernor(trace, { tier: 3 });
  assert.deepEqual(a.decisions, b.decisions);
  assert.deepEqual(a.tiers, b.tiers);

  const g = a.governor;
  g.reset({ tier: 2, maxTier: 3 });
  const s = g.snapshot();
  assert.equal(s.tier, 2);
  assert.equal(s.ceiling, 3);
  assert.equal(s.frozen, false);
  assert.deepEqual(s.changes, []);
  assert.equal(s.clockMs, 0);
});

test('the governor never reads a clock or a timer', async () => {
  const source = await readFile(new URL('../engine/quality/governor.js', import.meta.url), 'utf8');
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const word of ['performance', 'Date', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'Math.random']) {
    assert.ok(!codeOnly.includes(word), `governor.js uses ${word}`);
  }
});

test('quality modules are pure: relative imports inside engine/quality only (no three, no DOM)', async () => {
  for (const file of ['tiers.js', 'detect.js', 'governor.js']) {
    const source = await readFile(new URL(`../engine/quality/${file}`, import.meta.url), 'utf8');
    for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] || m[2];
      assert.match(spec, /^\.\/[\w-]+\.js$/, `${file} imports ${spec}`);
    }
  }
});

test('tier table: four tiers, ordered, monotone, sane values', () => {
  assert.equal(TIERS.length, 4);
  assert.equal(MIN_TIER, 0);
  assert.equal(MAX_TIER, 3);
  assert.ok(Object.isFrozen(TIERS) && TIERS.every((t) => Object.isFrozen(t) && Object.isFrozen(t.reflection) && Object.isFrozen(t.glow)));
  TIERS.forEach((t, i) => {
    assert.equal(t.tier, i);
    assert.ok([0, 2, 4].includes(t.msaa), `tier ${i} msaa`);
    assert.ok([0, 2, 4].includes(t.msaaLargeFrame) && t.msaaLargeFrame <= t.msaa, `tier ${i} msaaLargeFrame`);
    assert.ok(Number.isInteger(t.sky) && t.sky >= 0 && t.sky <= 3, `tier ${i} sky`);
    assert.ok(Number.isInteger(t.glow.levels) && t.glow.levels >= 0 && t.glow.levels <= 3, `tier ${i} glow`);
    assert.ok(t.dprCap >= 1 && t.dprCap <= 3, `tier ${i} dprCap`);
    assert.ok(t.maxPixels >= 1e6, `tier ${i} maxPixels`);
    assert.ok(t.maxTextureSize >= 1024 && (t.maxTextureSize & (t.maxTextureSize - 1)) === 0, `tier ${i} maxTextureSize is a power of two`);
    assert.equal(typeof t.reflection.enabled, 'boolean');
    assert.ok(t.reflection.enabled ? t.reflection.scale > 0 && t.reflection.scale <= 1 : t.reflection.scale === 0, `tier ${i} reflection scale`);
  });
  const keys = [(t) => t.dprCap, (t) => t.maxPixels, (t) => t.msaa, (t) => t.sky, (t) => t.glow.levels, (t) => t.maxTextureSize, (t) => t.reflection.scale, (t) => t.reflection.seaScale, (t) => +t.reflection.enabled];
  for (const key of keys) {
    for (let i = 1; i < TIERS.length; i++) assert.ok(key(TIERS[i]) >= key(TIERS[i - 1]), `tier ${i} is never cheaper than tier ${i - 1}: ${key}`);
  }
  assert.ok(TIERS.slice(1).every((t, i) => JSON.stringify(t) !== JSON.stringify(TIERS[i])), 'each tier differs from the one below');
});

test('tier names and the facade quality words agree', () => {
  for (const quality of SCENE_QUALITY) {
    const tier = tierForQuality(quality);
    if (quality === 'auto') assert.equal(tier, null);
    else assert.equal(TIERS[tier].name, quality);
  }
  assert.equal(TIERS[3].name, 'high', 'tier 3 reports as high');
  assert.throws(() => tierForQuality('ultra'), TypeError);
  assert.equal(clampTier(-4), 0);
  assert.equal(clampTier(7), 3);
  assert.equal(clampTier(1.6), 2);
  assert.equal(clampTier('junk'), 2);
  assert.equal(clampTier(Number.NaN, 1), 1);
  assert.equal(tierSettings(99), TIERS[3]);
});

test('effective DPR and MSAA follow the tier', () => {
  assert.equal(effectiveDpr(2, 1440, 900, 2), 2, 'a laptop keeps DPR 2 at tier 2');
  assert.equal(effectiveDpr(1, 390, 844, 3), 1.5, 'a phone is capped at 1.5 at tier 1');
  assert.equal(effectiveDpr(0, 390, 844, 3), 1, 'tier 0 renders at DPR 1');
  const big = effectiveDpr(2, 2560, 1440, 2);
  assert.ok(big < 2 && big >= MIN_DPR, `a big screen trades DPR for the pixel budget: ${big}`);
  assert.ok(2560 * 1440 * big * big <= TIERS[2].maxPixels * 1.0001);
  assert.equal(effectiveDpr(0, 5120, 2880, 1), MIN_DPR, 'never below MIN_DPR');
  assert.equal(effectiveDpr(2, 800, 600, 0.5), 0.5, 'a zoomed-out page keeps its own DPR');
  assert.equal(effectiveDpr(2, 800, 600, Number.NaN), 1);

  assert.equal(msaaSamples(0, 1e6), 0);
  assert.equal(msaaSamples(2, 2e6), 4);
  assert.equal(msaaSamples(2, LARGE_FRAME_PIXELS + 1), 2, 'large frames drop to 2x at tier 2');
  assert.equal(msaaSamples(3, LARGE_FRAME_PIXELS + 1), 4);
  assert.equal(msaaSamples(2, 2e6, 2), 2, 'capped by MAX_SAMPLES');
  assert.equal(msaaSamples(2, 2e6, 0), 0);
});

test('first guess: device classes', () => {
  const phone = detectTier({ dpr: 3, coarse: true, fine: false, gpu: 'Apple GPU', cores: 6 });
  assert.deepEqual([phone.tier, phone.maxTier, phone.mobile], [1, 2, true]);

  const laptop = detectTier({ dpr: 2, coarse: false, fine: true, gpu: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)', cores: 8, memory: 8 });
  assert.deepEqual([laptop.tier, laptop.maxTier], [2, 3]);

  const tower = detectTier({ dpr: 1, coarse: false, fine: true, gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)', cores: 16, memory: 8 });
  assert.deepEqual([tower.tier, tower.maxTier], [3, 3]);

  const software = detectTier({ gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' });
  assert.deepEqual([software.tier, software.maxTier], [0, 0]);

  const oldPhone = detectTier({ coarse: true, fine: false, gpu: 'Mali-G52', memory: 3 });
  assert.deepEqual([oldPhone.tier, oldPhone.maxTier], [0, 1]);

  const tablet = detectTier({ coarse: true, fine: true, gpu: 'Apple GPU' });
  assert.equal(tablet.mobile, false, 'a fine pointer means a desk, not a phone');

  assert.equal(detectTier({ memory: 2 }).tier, 0);
  assert.equal(detectTier({ memory: 4 }).tier, 1);
  assert.equal(detectTier({ saveData: true }).tier, 1);
  assert.equal(detectTier({ maxTextureSize: 2048 }).tier, 1);
  assert.equal(detectTier({}).tier, 2, 'no signals: a desktop guess');
  for (const guess of [phone, laptop, tower, software, oldPhone, tablet]) {
    assert.ok(guess.tier >= guess.minTier && guess.tier <= guess.maxTier && guess.reasons.length > 0);
  }

  assert.equal(classifyGpu('Adreno (TM) 610'), 'weak');
  assert.equal(classifyGpu('Adreno (TM) 740'), 'mid');
  assert.equal(classifyGpu('Intel(R) HD Graphics 620'), 'weak');
  assert.equal(classifyGpu('Intel(R) UHD Graphics 630'), 'mid');
  assert.equal(classifyGpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)'), 'strong');
  assert.equal(classifyGpu(null), 'unknown');
});

test('readSignals reads a browser and a renderer without throwing', () => {
  const fakeGl = {
    RENDERER: 0x1f01,
    getParameter: (p) => (p === 0x1f01 ? 'WebKit WebGL' : p === 0x9246 ? 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' : null),
    getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
  };
  const win = {
    devicePixelRatio: 2, innerWidth: 1440, innerHeight: 900,
    navigator: { hardwareConcurrency: 10, deviceMemory: 8, connection: { saveData: false } },
    matchMedia: (q) => ({ matches: q === '(any-pointer: fine)' }),
  };
  const signals = readSignals({ window: win, renderer: { getContext: () => fakeGl, capabilities: { maxTextureSize: 16384, maxSamples: 4 } } });
  assert.deepEqual(signals, {
    dpr: 2, cores: 10, memory: 8, coarse: false, fine: true, width: 1440, height: 900, saveData: false,
    gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', maxTextureSize: 16384, maxSamples: 4,
  });
  assert.equal(detectQuality({ window: win, renderer: { getContext: () => fakeGl, capabilities: { maxTextureSize: 16384, maxSamples: 4 } } }).tier, 3);

  const hostile = readSignals({
    window: { matchMedia: () => { throw new Error('no'); } },
    renderer: { getContext: () => { throw new Error('lost'); } },
  });
  assert.equal(hostile.gpu, null);
  assert.equal(hostile.coarse, false);
  assert.equal(hostile.dpr, 1);
  assert.equal(detectTier(hostile).tier, 2);
});
