// Shared render pieces for both Daily pages. Pure: view models in, HTML strings out.
import { html } from './html.js';
import { num } from './format.js';
import { stampLabel } from './time.js';

// The owner/visitor bar under the hero. Visitors get a small "Owner view" link.
export function renderModeBar(vm, ctx) {
  if (ctx.owner) {
    return html`<p class="mode-line"><span class="mode-chip mode-chip--owner">Owner view · ${ctx.cloud ? 'synced' : 'saved on this device'}</span>${ctx.fixture ? html`<span class="mode-chip">Fixture data</span>` : ''}<button type="button" class="text-button" data-action="view-as-visitor">See the public view</button></p>`;
  }
  const when = vm.generatedAt ? html` · snapshot from ${stampLabel(vm.generatedAt)}` : '';
  return html`<p class="mode-line"><span class="mode-chip">Public view · read-only${when}</span>${vm.preview ? html`<span class="mode-chip mode-chip--amber">Preview · sample data, not real progress</span>` : ''}${ctx.canReturn ? html`<button type="button" class="text-button" data-action="view-as-owner">Back to owner view</button>` : html`<button type="button" class="text-button" data-action="owner-view">Owner view</button>`}</p>`;
}

export function renderResources(shop, eggs, header, { eggFoodTiers = 4 } = {}) {
  if (!shop) return html``;
  const food = eggs?.eggFood || [];
  const names = ['Ord', 'Rare', 'SR', 'Epic', 'Mythic', 'Leg', 'Ultra'];
  const colors = ['#c2bad0', '#9fd4ff', '#7ee0c3', '#c9a2ff', '#ff9ecf', '#ffc98f', '#fff3b0'];
  const shown = food.map((n, i) => ({ n, i })).filter(x => x.i < eggFoodTiers || x.n > 0);
  return html`<span>coins <b>${num(shop.coins)}</b></span><span>diamonds <b>${num(shop.diamonds)}</b>${shop.shards ? html` + ${shop.shards}/10 shards` : ''}</span>${food.length ? html`<span>egg food ${shown.map((x, k) => html`${k ? ' · ' : ''}<span style="color:${colors[x.i]}">${names[x.i]}</span> <b>${num(x.n)}</b>`)}</span>` : ''}${eggs?.charms ? html`<span>charms <b>${eggs.charms.tier || 0}</b> tier · <b>${eggs.charms.sprout || 0}</b> sprout</span>` : ''}${header ? html`<span>freezes <b>${header.freezes}</b>/${header.freezeCap ?? 3}</span>` : ''}`;
}

// A section heading in the mockup's style: sans words with one Seasons-italic word.
export const heading = (lead, em, tag = 'h2', id = '') => html`<${tag}${id ? html` id="${id}"` : ''} class="section-title">${lead}<em>${em}</em></${tag}>`;
