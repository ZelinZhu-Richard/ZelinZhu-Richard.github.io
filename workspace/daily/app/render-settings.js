// Owner settings panel: list setup / next month, emergency swap, reminders, save tools.
import { html, raw } from './html.js';
import { TIER_KEYS, TIER_LABELS } from './tasks.js';
import { monthName } from './time.js';

// Enter in a text field submits a form through its first submit button. A disabled one first makes Enter do
// nothing, so only the visible Start / Lock / Save button submits a list.
const NO_ENTER_SUBMIT = raw('<button type="submit" disabled hidden aria-hidden="true" tabindex="-1"></button>');

// suggest: Supabase mode only, a "Suggest tier text" button per row (the generate-variants Edge Function).
export function renderListEditor(tasks, { form, submit, intro = '', suggest = false }) {
  return html`<form class="list-editor" data-form="${form}"${suggest ? raw(' data-suggest="1"') : ''}>${NO_ENTER_SUBMIT}${intro ? html`<p class="small muted">${intro}</p>` : ''}
<input type="hidden" name="count" value="${tasks.length}">
<ol class="editor-rows">${tasks.map((t, i) => renderEditorRow(t, i, { suggest }))}</ol>
<div class="editor-actions"><button type="button" class="button" data-action="list-add-row" data-form-target="${form}">Add a task</button><button type="submit" class="button button--accent">${submit}</button></div>
<p class="small muted">Quantity tasks scale from the Chill amount (×1 · 1.5 · 3 · 5 · 20). Physical tasks cap their duration at Hard; write what makes Goddamn harder, not longer. Sleep tiers only ever add sleep.</p></form>`;
}

// removable: false for the one-task correction form (list/edit), which can't add or drop tasks.
export function renderEditorRow(t = {}, i = 0, { suggest = false, removable = true } = {}) {
  const p = `task-${i}`;
  const tiers = Array.isArray(t.tiers) ? Object.fromEntries(TIER_KEYS.map((k, n) => [k, t.tiers[n]])) : { ...t.tiers };
  if (!tiers.chill && t.chillText) tiers.chill = t.chillText;
  const quality = t.type === 'quality';
  return html`<li class="editor-row">${['id', 'tag', 'receipt', 'purpose'].map(k => html`<input type="hidden" name="${p}-${k}" value="${t[k] || ''}">`)}<input type="hidden" name="${p}-tierQty" value="${Array.isArray(t.tierQty) ? t.tierQty.join(',') : ''}">
<label class="field"><span>Task</span><input name="${p}-name" value="${t.name || ''}" maxlength="40" autocomplete="off"></label>
<label class="field"><span>Type</span><select name="${p}-type"><option value="quantity"${quality ? '' : raw(' selected')}>Quantity</option><option value="quality"${quality ? raw(' selected') : ''}>Quality</option></select></label>
<label class="field field--narrow"><span>Chill amount</span><input name="${p}-chill" type="number" min="0" step="any" inputmode="decimal" value="${t.chill ?? ''}"></label>
<label class="field field--narrow"><span>Unit</span><input name="${p}-unit" value="${t.unit || ''}" maxlength="20" placeholder="minutes, pages"></label>
<label class="check"><input type="checkbox" name="${p}-physical"${t.physical ? raw(' checked') : ''}> Physical</label>
<label class="check"><input type="checkbox" name="${p}-noGoddamn"${t.noGoddamn ? raw(' checked') : ''}> No Goddamn</label>
<label class="field field--wide"><span>Goal it serves (private)</span><input name="${p}-goal" value="${t.goal || ''}" maxlength="80"></label>
<details class="tier-text"${quality ? raw(' open') : ''}><summary>Tier text${quality ? ' (quality tasks need Chill)' : ' (optional; physical: what makes Goddamn harder)'}</summary>${TIER_LABELS.map((label, k) => html`<label class="field"><span>${label}</span><input name="${p}-tier-${k}" value="${tiers[TIER_KEYS[k]] || ''}" maxlength="80"></label>`)}${suggest ? html`<button type="button" class="text-button" data-action="suggest-tiers">Suggest tier text</button>` : ''}</details>
${removable ? html`<button type="button" class="text-button danger" data-action="list-remove-row" aria-label="Remove ${t.name || 'this task'}">Remove</button>` : ''}</li>`;
}

// list/edit: one small form per task on this month's locked list. Tasks ticked today wait until tomorrow.
export function renderListCorrections(list, todayTasks, { suggest = false } = {}) {
  const left = list.editsLeft ?? 0;
  const ticked = new Set(todayTasks.filter(t => t.ticked).map(t => t.id));
  const intro = html`<p class="small muted">For setup mistakes and missing options. Each correction changes one task, needs a reason, and is logged. A task keeps its type; a quantity task keeps its unit and can't get an easier Chill amount. ${left === 1 ? '1 correction' : `${left} corrections`} left this month.</p>`;
  if (!left) return intro;
  return html`${intro}<ul class="corrections">${(list.tasks || []).map(t => (ticked.has(t.id)
    ? html`<li class="small muted">${t.name}: ticked today, so it can be corrected tomorrow.</li>`
    : html`<li><details><summary>${t.name}</summary><form class="list-editor" data-form="list-edit" data-task-id="${t.id}">${NO_ENTER_SUBMIT}<input type="hidden" name="count" value="1">
<ol class="editor-rows">${renderEditorRow(t, 0, { suggest, removable: false })}</ol>
<label class="field field--wide"><span>One-line reason (logged)</span><input name="reason" required maxlength="140" autocomplete="off"></label>
<div class="editor-actions"><button type="submit" class="button button--accent">Save the correction</button></div></form></details></li>`))}</ul>`;
}

export function renderSettings(vm, ctx, defaults) {
  const s = vm.settings || {};
  const r = s.reminders || {};
  const list = vm.list || {};
  const nextTasks = list.next || list.tasks || defaults;
  const pets = vm.pets?.active || [];
  const tasks = vm.today?.tasks || [];
  const nextMonth = ctx.nextMonthKey ? monthName(ctx.nextMonthKey) : 'next month';
  return html`<div class="section-head"><h2 class="section-title">Set<em>tings</em></h2><p class="mono-label">owner only · ${ctx.cloud ? 'synced' : 'this device'}</p></div>
<div class="settings-grid">
<details class="settings-block" open><summary>Companion and reminders</summary><form data-form="settings">
<label class="field"><span>Companion beside the pool</span><select name="companionId">${pets.map(p => html`<option value="${p.id}"${ctx.focusPet?.id === p.id ? raw(' selected') : ''}>${p.name}</option>`)}</select></label>
<fieldset><legend>Reminders (${ctx.cloud ? 'in this page, and by email once it is set up' : 'in this page only'})</legend>
<label class="check"><input type="checkbox" name="evening"${r.evening ? raw(' checked') : ''}> 7:00 PM and 9:15 PM when the list isn't done. Nothing after 9:30 PM.</label>
<label class="check"><input type="checkbox" name="morning"${r.morning ? raw(' checked') : ''}> 7:30 AM morning summary</label>
<label class="check"><input type="checkbox" name="notify"${r.notify ? raw(' checked') : ''}> Also show a browser notification while this page is open</label></fieldset>
<label class="check"><input type="checkbox" name="sound"${s.sound ? raw(' checked') : ''}> Sounds (off by default)</label>
<label class="field"><span>Motion</span><select name="motion"><option value="system"${s.motion !== 'reduced' ? raw(' selected') : ''}>Follow the system setting</option><option value="reduced"${s.motion === 'reduced' ? raw(' selected') : ''}>Reduce motion</option></select></label>
<button type="submit" class="button button--accent">Save settings</button></form></details>

<details class="settings-block"><summary>${list.next ? `${nextMonth}'s list (set)` : `${nextMonth}'s list`}</summary>
${renderListEditor(nextTasks, { form: 'next-list', suggest: Boolean(ctx.cloud), submit: `Lock for ${nextMonth}`, intro: `This month's list is locked. ${nextMonth}'s list locks on the 1st; if you don't set one, this month's carries over.` })}</details>

${list.tasks ? html`<details class="settings-block"><summary>Correct this month's list${list.editsLeft === 0 ? ' (used this month)' : ''}</summary>
${renderListCorrections(list, tasks, { suggest: Boolean(ctx.cloud) })}</details>` : ''}

<details class="settings-block"><summary>Emergency swap${list.swapUsed ? ' (used this month)' : ''}</summary>
${list.swapUsed ? html`<p class="small muted">This month's one swap is used.</p>` : html`<form data-form="swap"><p class="small muted">Once a month, for injuries and real changes in life. The new task's Chill baseline must be equal or harder. It's logged publicly with your reason.</p>
<label class="field"><span>Replace</span><select name="taskId">${tasks.map(t => html`<option value="${t.id}">${t.name}</option>`)}</select></label>
<label class="field"><span>New task</span><input name="name" required maxlength="40"></label>
<label class="field"><span>Type</span><select name="type"><option value="quantity">Quantity</option><option value="quality">Quality</option></select></label>
<label class="field field--narrow"><span>Chill amount</span><input name="chill" type="number" min="0" step="any"></label>
<label class="field field--narrow"><span>Unit</span><input name="unit" maxlength="20"></label>
<label class="field field--wide"><span>Chill description (quality)</span><input name="chillText" maxlength="80"></label>
<label class="field field--wide"><span>One-line reason (public)</span><input name="reason" required maxlength="120"></label>
<button type="submit" class="button">Swap…</button></form>`}</details>

<details class="settings-block"><summary>Save and snapshot</summary>
${ctx.cloud ? html`<p class="small muted">Your game is saved in the cloud; every change runs on the server. Export a copy now and then.</p>` : html`<p class="small muted">Your game lives in this browser. Export a copy now and then.</p>`}
<div class="manage-row"><button type="button" class="button" data-action="export-save">Export save</button>
<label class="button file-button">${ctx.cloud ? 'Import save (replaces the cloud game)' : 'Import save'}<input type="file" accept="application/json,.json" data-action="import-save" class="sr-only"></label>
<button type="button" class="button" data-action="export-snapshot">Export public snapshot</button></div>
${ctx.cloud ? html`<p class="small muted">Visitors see the live public view; a committed workspace/daily/public/snapshot.json is only the fallback.</p>
<button type="button" class="text-button" data-action="forget-device">Sign out on this device</button></details>` : html`<p class="small muted">Commit the snapshot as workspace/daily/public/snapshot.json; visitors see it at /daily/.</p>
<button type="button" class="text-button danger" data-action="forget-device">Remove the save from this device…</button></details>`}
</div>`;
}
