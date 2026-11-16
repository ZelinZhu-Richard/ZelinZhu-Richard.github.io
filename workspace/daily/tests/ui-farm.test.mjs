import test from 'node:test';
import assert from 'node:assert/strict';
import { placeholderArt } from '../app/art.js';
import { ownerViews } from '../app/fixtures/views.js';
import { DEFAULT_TASKS } from '../app/tasks.js';
import {
  CROPS, DECOR, FARM, MAX_PLOTS, PET_SLOTS, PLOT_TILES, canvasData, cropFor, farmLabel, farmModel, isTerrace, iso, onIsland, renderFarm, tileAt, tileCenter,
} from '../app/farm.js';

const NOW = Date.UTC(2026, 10, 12, 20, 30);
const vm = ownerViews(NOW);
const ctx = (over = {}) => ({ owner: true, art: placeholderArt, now: NOW, ui: {}, ...over });
const unescape = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

test('projection: every island tile centre maps back to its own tile', () => {
  for (let gx = 0; gx < FARM.size; gx++) {
    for (let gy = 0; gy < FARM.size; gy++) {
      if (!onIsland(gx, gy)) continue;
      const c = iso(gx + 0.5, gy + 0.5);
      assert.deepEqual(tileAt(c.x, c.y), { gx, gy });
    }
  }
  assert.equal(tileAt(5, 5), null, 'empty space is not a tile');
});

test('the whole island fits inside the scene frame', () => {
  for (let gx = 0; gx <= FARM.size; gx++) {
    for (let gy = 0; gy <= FARM.size; gy++) {
      const p = iso(gx, gy, 1);
      assert.ok(p.x >= 0 && p.x <= FARM.width && p.y >= 0 && p.y <= FARM.height, `${gx},${gy}`);
    }
  }
});

test('layout: plots, pet slots and decor never share a tile, and pets stand in front of decor', () => {
  const plots = new Set(PLOT_TILES.map(t => t.join()));
  assert.equal(plots.size, MAX_PLOTS);
  for (const [gx, gy] of PLOT_TILES) assert.ok(onIsland(gx, gy) && !isTerrace(gx, gy));
  assert.ok(PET_SLOTS.length >= 15, 'room for the 15-pet cap');
  const back = Math.max(...DECOR.map(d => d.gx + d.gy));
  for (const [gx, gy] of PET_SLOTS) {
    assert.ok(onIsland(gx, gy) && !isTerrace(gx, gy) && !plots.has(`${gx},${gy}`));
    assert.ok(gx + gy > back, 'tall decor is always behind a pet');
    // A crop one row in front of a pet in the same column would be hidden by the pet overlay.
    for (const [px, py] of PLOT_TILES) assert.ok(!(px + py - (gx + gy) === 1 && Math.abs(px - py - (gx - gy)) <= 1), `${gx},${gy} vs ${px},${py}`);
  }
  for (const d of DECOR) assert.ok(isTerrace(d.gx, d.gy));
});

test('crops: the default list gets six different crops; unknown tasks get a stable one', () => {
  const kinds = DEFAULT_TASKS.map(cropFor);
  assert.equal(new Set(kinds).size, 6, kinds.join());
  for (const k of kinds) assert.ok(CROPS[k]);
  const odd = { id: 'violin', name: 'Violin practice' };
  assert.equal(cropFor(odd), cropFor({ ...odd }));
  assert.equal(cropFor({ id: 'x', name: 'Swim laps', physical: true }), 'comet');
});

test('model: one plot per task, grown = ticked, pets on slots, extra tasks counted', () => {
  const m = farmModel(vm.today, vm.pets, vm.header);
  assert.equal(m.plots.length, 6);
  assert.deepEqual(m.plots.map(p => p.grown), vm.today.tasks.map(t => Boolean(t.ticked)));
  assert.equal(m.stats.grown, 3);
  assert.equal(m.stats.perfect, false);
  assert.equal(m.crew.length, 3);
  assert.equal(m.selected.id, 'p-ember');
  assert.equal(farmModel(vm.today, vm.pets, vm.header, { selectedId: 'p-pip' }).selected.id, 'p-pip');
  const many = { ...vm.today, tasks: Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, name: `Task ${i}`, ticked: true, level: 'easy' })) };
  const big = farmModel(many, vm.pets, vm.header);
  assert.equal(big.plots.length, MAX_PLOTS);
  assert.equal(big.extraTasks, 2);
  assert.equal(big.stats.perfect, true);
  const empty = farmModel(null, { active: [] }, null);
  assert.equal(empty.plots.length, 0);
  assert.equal(empty.selected, null);
  assert.equal(empty.stats.perfect, false);
});

test('markup: canvas data, labels, overlay positions, read-only for visitors', () => {
  const m = farmModel(vm.today, vm.pets, vm.header);
  const out = String(renderFarm(m, ctx()));
  const data = JSON.parse(unescape(/data-farm="([^"]*)"/.exec(out)[1]));
  assert.deepEqual(data, JSON.parse(JSON.stringify(canvasData(m))));
  assert.equal(data.plots.length, 6);
  assert.ok(data.fuel >= 0 && data.fuel <= 1);
  assert.match(out, /role="img" aria-label="Space farm on a floating asteroid\. 3 of 6 crops grown: /);
  assert.match(farmLabel(m), /3 pets aboard\./);
  for (const [, left, top] of out.matchAll(/left:([\d.]+)%;top:([\d.]+)%/g)) {
    assert.ok(+left > 0 && +left < 100 && +top > 0 && +top < 100);
  }
  assert.equal((out.match(/aria-pressed="true"/g) || []).length, 1);
  const visitor = String(renderFarm(m, ctx({ owner: false })));
  assert.deepEqual([...new Set([...visitor.matchAll(/data-action="([^"]+)"/g)].map(x => x[1]))], ['farm-select']);
  const c = tileCenter(PET_SLOTS[0][0], PET_SLOTS[0][1]);
  assert.match(out, new RegExp(`left:${Math.round(c.x / FARM.width * 10000) / 100}%`));
});

test('markup escapes names in the JSON, the label and the buttons', () => {
  const evil = ownerViews(NOW);
  evil.pets.active[0].name = '<img src=x onerror=alert(1)>';
  evil.today.tasks[0].name = '"><script>alert(1)</script>';
  const out = String(renderFarm(farmModel(evil.today, evil.pets, evil.header), ctx()));
  assert.doesNotMatch(out, /<img src=x|<script>/);
});
