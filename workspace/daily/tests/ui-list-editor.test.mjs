// The list editor: Enter never submits, the empty setup error stays hidden, the editor round-trip keeps every
// TaskDef field (tierQty, noGoddamn, chillText), and the owner's per-task correction forms (list/edit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as E from '../engine/index.js';
import { engineViews } from '../app/backend.js';
import { placeholderArt } from '../app/art.js';
import { renderListEditor, renderListCorrections, renderSettings } from '../app/render-settings.js';
import { readTaskFields } from '../app/tasks.js';
import { normalizeTasks } from '../engine/tasks.js';

const s = x => String(x);
const unescape = v => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

// What a browser's FormData holds for a rendered form: inputs (checkboxes only when checked) and selects.
function formData(markup) {
  const data = new FormData();
  for (const tag of markup.match(/<input\b[^>]*>/g) || []) {
    const name = attr(tag, 'name');
    if (!name) continue;
    if (attr(tag, 'type') === 'checkbox') { if (/\schecked\b/.test(tag)) data.append(name, 'on'); continue; }
    data.append(name, unescape(attr(tag, 'value') ?? ''));
  }
  for (const [, name, body] of markup.matchAll(/<select name="([^"]+)">(.*?)<\/select>/gs)) {
    const chosen = body.match(/<option value="([^"]*)" selected>/) || body.match(/<option value="([^"]*)"/);
    data.append(name, chosen[1]);
  }
  return data;
}

const firstSubmit = markup => markup.match(/<button\b[^>]*type="submit"[^>]*>/)[0];

test('Enter in a field never submits a list: the form\'s default button is disabled', () => {
  const out = s(renderListEditor(E.DEFAULT_TASKS, { form: 'setup', submit: 'Start the game' }));
  assert.match(firstSubmit(out), /\sdisabled\b/, 'implicit submission clicks the first submit button; a disabled one does nothing');
  assert.match(firstSubmit(out), /\shidden\b/);
  assert.match(out, /<button type="submit" class="button button--accent">Start the game<\/button>/, 'the real button still submits');
});

test('the empty setup error is hidden; only a message shows the red box', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.error:empty\{display:none\}/);
  const page = await readFile(new URL('../pages/index.html', import.meta.url), 'utf8');
  assert.match(page, /<p class="error" data-slot="setup-error" role="alert"><\/p>/, 'the slot starts empty');
});

test('editor round-trip keeps the default list exactly, tierQty included', () => {
  const out = s(renderListEditor(E.DEFAULT_TASKS, { form: 'setup', submit: 'Start' }));
  const read = readTaskFields(formData(out));
  assert.deepEqual(read.find(t => t.id === 'sleep').tierQty, [7, 7.5, 8, 8, 8.5]);
  assert.deepEqual(read.find(t => t.id === 'veg').tierQty, [1, 2, 3, 5, 7]);
  assert.deepEqual(normalizeTasks(read), normalizeTasks(E.DEFAULT_TASKS));
});

test('editor round-trip keeps noGoddamn and a swapped-in chillText', () => {
  const tasks = normalizeTasks([
    { name: 'Work out', type: 'quantity', unit: 'minutes', chill: 15, physical: true, noGoddamn: true },
    { name: 'Stretch', type: 'quality', chillText: '5 minutes of stretching' },
  ]);
  const out = s(renderListEditor(tasks, { form: 'next-list', submit: 'Lock' }));
  assert.match(out, /name="task-0-noGoddamn" checked/);
  assert.doesNotMatch(out, /name="task-1-noGoddamn" checked/);
  const read = normalizeTasks(readTaskFields(formData(out)));
  assert.equal(read[0].noGoddamn, true);
  assert.equal(read[1].tiers.chill, '5 minutes of stretching', 'chillText shows as the Chill tier text');
  assert.equal(tasks[1].tiers, undefined, 'rendering does not touch the task');
});

test('owner settings: one correction form per unticked task; ticked tasks wait; none once used', () => {
  const now = E.time.nyInstant('2026-11-02', 9 * 60);
  let st = E.newGame({ seed: 3, now, tasks: E.DEFAULT_TASKS });
  st = E.applyAction(st, { type: 'task/tick', taskId: 'read' }, now).state;
  const vm = engineViews(E, st, now);
  assert.equal(vm.list.editsLeft, E.CONFIG.tasks.editsPerMonth);
  const out = s(renderSettings(vm, { owner: true, art: placeholderArt, now, ui: {}, nextMonthKey: '2026-12' }, E.DEFAULT_TASKS));
  assert.match(out, /Correct this month's list/);
  assert.equal((out.match(/data-form="list-edit"/g) || []).length, 5);
  assert.doesNotMatch(out, /data-form="list-edit" data-task-id="read"/);
  assert.match(out, /Read: ticked today, so it can be corrected tomorrow\./);
  const form = out.slice(out.indexOf('data-task-id="workout"'), out.indexOf('</form>', out.indexOf('data-task-id="workout"')));
  assert.match(firstSubmit(form), /\sdisabled\b/);
  assert.doesNotMatch(form, /list-remove-row|list-add-row/, 'a correction never adds or drops tasks');
  assert.deepEqual(readTaskFields(formData(form)), [readTaskFields(formData(s(renderListEditor([st.list.tasks[4]], { form: 'x', submit: 'x' }))))[0]]);
  const used = s(renderListCorrections({ tasks: st.list.tasks, editsLeft: 0 }, []));
  assert.match(used, /0 corrections left this month/);
  assert.doesNotMatch(used, /data-form/);
});
