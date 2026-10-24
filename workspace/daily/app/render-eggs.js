// /daily/eggs/ render modules. Pure: (view models, ctx) → HTML. ctx = { owner, art, ui }.
import { html, raw } from './html.js';
import { TIERS, TIER_SHORT, article, num, pct, percentWidth, plural, stars, tierColor, tierName } from './format.js';
import { dayLabel, stampLabel } from './time.js';

const ui = ctx => ctx.ui || {};
const SOURCE = { laid: 'Laid by a pet', streak: 'Streak bonus', chest: 'Weekly chest', season: 'Season track', welcome: 'Welcome back', shop: 'Shop' };

export function petEggChance(odds, egg) {
  const table = odds?.petEggChance;
  if (!table) return null;
  return (egg.source === 'laid' ? table.laid : table.other)?.[egg.tier] ?? null;
}

// ---------- openable eggs ----------
export function renderOpenEggs(eggs, odds, ctx) {
  if (!ctx.owner) return renderEggCounts(eggs?.counts);
  const list = eggs?.openEggs || [];
  return html`${list.length ? html`<ul class="egg-grid">${list.map(e => {
    const c = tierColor(e.tier);
    const chance = petEggChance(odds, e);
    const from = e.from || SOURCE[e.source] || 'Egg';
    return html`<li class="egg-card" style="--tier:${c}" data-egg="${e.id}">${raw(ctx.art.renderEgg({ kind: 'open', tier: e.tier, state: 'idle', size: 72 }))}
<span class="mono-label" style="color:${c}">${tierName(e.tier)}</span><span class="small muted">${from}</span>${chance !== null ? html`<span class="mono small muted">pet egg ${pct(chance)}</span>` : ''}${e.extraItems ? html`<span class="mono small muted">+${e.extraItems} items</span>` : ''}
<button type="button" class="button button--tier" data-action="open-egg" data-egg="${e.id}" aria-label="Open ${tierName(e.tier)} egg, ${from.toLowerCase()}">Open</button></li>`;
  })}</ul>${list.length > 1 ? html`<button type="button" class="text-button" data-action="open-all">Open all ${list.length}, one by one</button>` : ''}` : html`<p class="empty">No eggs to open. Feed pets past 100, or keep the streak going.</p>`}
${renderLastOpened(ui(ctx).lastOpened)}`;
}

export function renderEggCounts(counts) {
  const open = counts?.openEggs || (Array.isArray(counts) ? counts : null);
  const pets = counts?.petEggs || null;
  const row = (label, arr) => html`<li><span class="muted">${label}</span> ${TIERS.map((t, i) => (arr?.[i] ? html`<span class="chip" style="--chip:${tierColor(i)}">${arr[i]} ${t}</span>` : ''))}${arr?.some(Boolean) ? '' : html`<span class="muted">none</span>`}</li>`;
  return html`<ul class="egg-counts">${row('Openable eggs waiting', open)}${row('Pet eggs in the bag', pets)}</ul><p class="small muted">The owner opens eggs on their own device. Every roll uses the public odds below.</p>`;
}

export function itemText(item) {
  switch (item.kind) {
    case 'coins': return `+${num(item.amount)} coin${item.amount === 1 ? '' : 's'}`;
    case 'diamonds': return `+${num(item.amount)} diamond${item.amount === 1 ? '' : 's'}`;
    case 'eggFood': return `+${num(item.amount)} ${tierName(item.tier)} egg food`;
    case 'treat': return `XP treat${item.amount ? ` (+${num(item.amount)} XP)` : ''}`;
    case 'charm': return `${item.charm === 'sprout' ? 'Sprout' : 'Tier'} charm`;
    case 'trinket': return `${tierName(item.trinket?.tier ?? item.tier)} trinket${item.trinket?.name ? `: ${item.trinket.name}` : ''}`;
    case 'petEgg': return `${tierName(item.petEgg?.tier ?? item.tier)} pet egg`;
    default: return item.label || item.kind;
  }
}

// Items in reveal order: loot first, the pet egg last (the contract already sends it last).
export function revealOrder(items) {
  return [...items.filter(i => i.kind !== 'petEgg'), ...items.filter(i => i.kind === 'petEgg')];
}

export function renderItemChip(item, extra = '') {
  const tier = item.kind === 'petEgg' ? (item.petEgg?.tier ?? item.tier) : item.kind === 'trinket' ? (item.trinket?.tier ?? item.tier) : item.tier;
  const c = tier !== undefined && tier !== null ? tierColor(tier) : item.kind === 'diamonds' ? '#9fd4ff' : '#ffffff40';
  const solid = item.kind === 'petEgg';
  return html`<li class="item-chip${solid ? ' item-chip--pet' : ''}${extra}" style="--chip:${c}">${itemText(item)}</li>`;
}

export function renderLastOpened(last) {
  if (!last) return html`<div class="last-opened"><p class="mono-label">Last opened</p><p class="last-title">Nothing yet. Open an egg to roll it with the real odds.</p></div>`;
  return html`<div class="last-opened" style="border-color:${tierColor(last.tier)}88"><p class="mono-label">Last opened</p><p class="last-title">${tierName(last.tier)} egg · ${plural(last.items.length, 'item')}</p><ul class="item-chips">${revealOrder(last.items).map(i => renderItemChip(i))}</ul></div>`;
}

// ---------- hatchery ----------
export function selectedPetEgg(eggs, ctx) {
  const list = eggs?.petEggs || [];
  return list.find(e => e.id === ui(ctx).incubating) || [...list].sort((a, b) => b.servings / b.need - a.servings / a.need)[0] || null;
}

export function renderHatchery(eggs, odds, ctx) {
  if (!ctx.owner) return html`<p class="small muted">Pet eggs hatch at 95% their own tier and 5% one higher. Every serving of better food nudges the odds; the egg always keeps at least 50% of its own tier.</p>`;
  const egg = selectedPetEgg(eggs, ctx);
  if (!egg) return html`<div class="hatch-empty"><p>The incubator is empty.</p><p class="small muted">Pet eggs come from openable eggs, the shop, and combining.</p></div>`;
  const c = tierColor(egg.tier);
  const full = egg.servings >= egg.need;
  const food = eggs.eggFood || [];
  const shown = [0, 1, 2, 3, 4, 5, 6].filter(t => food[t] > 0 || t === egg.tier || (t <= egg.tier + 2 && t < 4));
  const oddsRows = [0, 1, 2, 3, 4, 5, 6].filter(t => t >= egg.tier && (t <= egg.tier + 3 || (egg.odds?.[t] || 0) > 0)).slice(0, 4);
  const charms = eggs.charms || {};
  const sproutOk = egg.canSprout ?? (egg.tier <= (odds?.charm?.sproutMaxTier ?? 2) && !egg.charm);
  const tierOk = egg.canCharm ?? (!egg.charm && egg.tier < 6);
  return html`<div class="hatchery" style="--tier:${c}" data-pet-egg="${egg.id}">
<div class="hatch-top">${raw(ctx.art.renderEgg({ kind: 'pet', tier: egg.tier, state: full ? 'shake' : 'idle', size: 128 }))}<div><p class="hatch-title">${tierName(egg.tier)} pet egg</p><p class="small muted">Needs ${egg.need} servings${egg.charm ? ` (${egg.charm} charm: +50%)` : ''}. Each serving above its tier nudges the odds.</p></div></div>
<div class="meter"><div class="meter-head"><span>Servings</span><span>${egg.servings} / ${egg.need}</span></div><div class="bar bar--thick" role="progressbar" aria-label="Servings" aria-valuemin="0" aria-valuemax="${egg.need}" aria-valuenow="${egg.servings}"><span style="width:${percentWidth(egg.servings, egg.need)}%;background:${c}"></span></div></div>
<div><p class="mono-label">Hatch odds right now</p><ul class="odds-bars" aria-live="polite">${oddsRows.map(t => html`<li><span style="color:${tierColor(t)}">${tierName(t)}</span><span class="bar"><span style="width:${Math.max(1, Math.round((egg.odds?.[t] || 0) * 100))}%;background:${tierColor(t)}"></span></span><span class="mono">${pct(egg.odds?.[t] || 0)}</span></li>`)}</ul>
<p class="small muted">${egg.charm ? `${egg.charm === 'sprout' ? 'Sprout' : 'Tier'} charm on: after the roll above, another ${pct(odds?.charm?.chance ?? 0.2)} chance of +1 tier.` : 'Feed food above the egg’s tier to raise the odds.'}</p></div>
<div class="food-picker" role="group" aria-label="Feed one serving of egg food">${shown.map(t => html`<button type="button" class="food-button" data-action="feed-egg" data-pet-egg="${egg.id}" data-food="${t}" style="--chip:${tierColor(t)}"${full || !food[t] ? raw(' disabled') : ''}>${tierName(t)} food<span class="mono small muted">${food[t] || 0} left${t > egg.tier ? ' · boosts' : ''}</span></button>`)}</div>
<div class="hatch-actions">
<button type="button" class="button" data-action="charm" data-pet-egg="${egg.id}" data-charm="tier"${!tierOk || !charms.tier ? raw(' disabled') : ''}>Tier charm (${charms.tier || 0}) · 20% for +1 tier · +50% servings</button>
<button type="button" class="button" data-action="charm" data-pet-egg="${egg.id}" data-charm="sprout"${!sproutOk || !charms.sprout ? raw(' disabled') : ''}>Sprout charm (${charms.sprout || 0}) · Ordinary–Super Rare</button>
<button type="button" class="button button--tier" data-action="hatch" data-pet-egg="${egg.id}"${full ? '' : raw(' disabled')}>Hatch</button></div>
<p class="small muted">One charm per egg, any time before it hatches; the egg then needs 50% more servings. Servings can't be taken back.</p></div>`;
}

export function renderPetEggBag(eggs, collection, odds, ctx) {
  if (!ctx.owner) return html``;
  const list = eggs?.petEggs || [];
  const current = selectedPetEgg(eggs, ctx);
  const sep = odds?.separate || [3, 4, 5, 6, 8, 10, 12];
  const pairs = collection?.eggCombinePairs || [];
  return html`<h3 class="sub-title">Pet egg bag</h3>${list.length ? html`<ul class="bag">${list.map(e => html`<li style="--tier:${tierColor(e.tier)}"><span class="bag-name"><b style="color:${tierColor(e.tier)}">${tierName(e.tier)}</b> pet egg <span class="mono small muted">${e.servings}/${e.need}${e.charm ? ` · ${e.charm} charm` : ''}</span></span>
<button type="button" class="pill-button" data-action="incubate" data-pet-egg="${e.id}" aria-pressed="${current?.id === e.id}">${current?.id === e.id ? 'In the incubator' : 'Incubate'}</button>
<button type="button" class="pill-button muted" data-action="separate" data-pet-egg="${e.id}">Separate · +${sep[e.tier]} food</button></li>`)}</ul>` : html`<p class="empty">No pet eggs yet.</p>`}
${pairs.map(p => {
    const a = list.find(e => e.id === p.aId);
    if (!a) return '';
    const chance = p.odds?.success ?? odds?.combine?.[a.tier];
    return html`<button type="button" class="combine-eggs" data-action="combine-eggs" data-a="${p.aId}" data-b="${p.bId}">Combine two ${tierName(a.tier)} eggs: ${pct(chance)} for ${article(tierName(a.tier + 1))} ${tierName(a.tier + 1)} egg, otherwise both are gone…</button>`;
  })}`;
}

// ---------- collection: merge / combine ----------
export function analysePair(sel, pets, collection, odds) {
  const all = [...(pets?.active || []), ...(pets?.backpack || [])];
  if (sel.length < 2) return { kind: 'none', text: sel.length ? 'Pick one more pet.' : 'Pick two pets.' };
  const [a, b] = sel.map(id => all.find(p => p.id === id));
  if (!a || !b) return { kind: 'none', text: 'Pick two pets.' };
  const match = list => (list || []).find(p => (p.aId === a.id && p.bId === b.id) || (p.aId === b.id && p.bId === a.id));
  const merge = match(collection?.mergePairs);
  if (merge) {
    const mut = merge.odds?.mutation ?? odds?.merge?.mutation ?? 0.05;
    return { kind: 'merge', a, b, text: `Merge ${a.name} + ${b.name} → ${stars(a.stars + 1).replace(/☆/g, '')} ${tierName(a.tier)} ${a.speciesName || a.species}, guaranteed. ${pct(mut)} mutation to ${tierName(Math.min(6, a.tier + 1))}. ${b.name} is used up; its trinkets go back to the inventory.` };
  }
  const combine = match(collection?.combinePairs);
  if (combine) {
    const r = combine.odds?.success ?? odds?.combine?.[a.tier] ?? 0;
    return { kind: 'combine', a, b, chance: r, text: `Combine ${a.name} + ${b.name}: ${pct(r)} for one ${tierName(a.tier + 1)} pet, ${pct(1 - r)} both are destroyed.` };
  }
  return { kind: 'none', text: 'Merge needs the same species, tier and stars. Combine needs the same tier and different species. Ultra pets can’t combine.' };
}

export function renderCollection(pets, collection, odds, ctx) {
  const all = [...(pets?.active || []), ...(pets?.backpack || [])];
  const sel = ui(ctx).selected || [];
  const an = analysePair(sel, pets, collection, odds);
  return html`<div class="pick-grid" role="group" aria-label="Your pets">${all.map(p => {
    const on = sel.includes(p.id);
    return html`<button type="button" class="pick" data-action="pick" data-pet="${p.id}" aria-pressed="${on}" style="--tier:${tierColor(p.tier)}"${ctx.owner ? '' : raw(' disabled')}>${raw(ctx.art.renderPet({ species: p.species, tier: p.tier, mood: p.mood, stars: p.stars, size: 72, name: p.name, focus: false, animate: false }))}<span class="pick-name">${p.name}</span><span class="small" style="color:${tierColor(p.tier)}">${tierName(p.tier)} ${p.speciesName || p.species}</span><span class="mono small muted">${stars(p.stars)} · Lv ${p.level}</span></button>`;
  })}</div>
${ctx.owner ? html`<div class="pair-panel pair-panel--${an.kind}" aria-live="polite"><p>${an.text}</p>${an.kind !== 'none' ? html`<button type="button" class="button ${an.kind === 'combine' ? 'button--amber' : 'button--accent'}" data-action="${an.kind}" data-a="${an.a.id}" data-b="${an.b.id}">${an.kind === 'merge' ? 'Merge…' : 'Combine…'}</button>` : ''}${ui(ctx).collMsg ? html`<p class="amber small">${ui(ctx).collMsg}</p>` : ''}</div>` : ''}
<ul class="rules"><li><b>Merge</b>: same species, tier and stars. Guaranteed +1 star (max 5). ${pct(odds?.merge?.mutation ?? 0.05)} mutation: also +1 tier. Safe.</li>
<li><b>Combine</b>: same tier, different species (or two pet eggs of the same tier). ${(odds?.combine || []).map((r, t) => `${TIERS[t]} ${pct(r)}`).join(' · ')} for one of the next tier. Otherwise both are gone.</li></ul>`;
}

// ---------- Petdex ----------
export function petdexCount(petdex) {
  return Object.values(petdex?.cells || {}).filter(c => c.found).length;
}

export function renderPetdex(petdex, ctx) {
  if (!petdex) return html`<p class="empty">The Petdex loads with the game.</p>`;
  const species = petdex.species || [];
  const tiers = petdex.tiers || 7;
  const names = { ...Object.fromEntries((ctx.art.SPECIES || []).map(s => [s.id, s.name])), ...(petdex.names || {}) };
  const total = species.length * tiers;
  return html`<div class="panel-head"><h3 class="sub-title">Petdex</h3><span class="mono small muted">${petdexCount(petdex)} / ${total} discovered · first find pays a bonus</span></div>
<div class="table-wrap" tabindex="0" role="region" aria-label="Petdex grid"><table class="petdex"><thead><tr><th scope="col">species</th>${TIER_SHORT.slice(0, tiers).map((s, t) => html`<th scope="col" style="color:${tierColor(t)}"><abbr title="${TIERS[t]}">${s}</abbr></th>`)}</tr></thead>
<tbody>${species.map(sp => html`<tr><th scope="row">${names[sp] || sp}</th>${Array.from({ length: tiers }, (_, t) => {
    const cell = petdex.cells?.[`${sp}:${t}`];
    const found = Boolean(cell?.found);
    const label = `${TIERS[t]} ${names[sp] || sp}${found ? `, discovered${cell.firstDay ? ` ${dayLabel(cell.firstDay)}` : ''}` : ', not found yet'}`;
    return html`<td class="dex-cell${found ? ' is-found' : ''}" style="--tier:${tierColor(t)}"><span class="sr-only">${label}</span><span aria-hidden="true" title="${label}">${raw(found ? ctx.art.renderPet({ species: sp, tier: t, mood: 'healthy', stars: 1, size: 72, focus: false, animate: false }) : ctx.art.renderSilhouette({ species: sp, size: 72 }))}</span></td>`;
  })}</tr>`)}</tbody></table></div>
<p class="small muted">More species unlock on the Keeper road and in monthly seasons. A first discovery pays 100 × (tier + 1) coins, plus diamonds from Epic up.</p>`;
}

// ---------- odds (public) ----------
export function renderOdds(odds) {
  if (!odds) return html`<p class="empty">Odds tables load with the game.</p>`;
  const laid = odds.petEggChance?.laid || [];
  const other = odds.petEggChance?.other || [];
  const split = odds.tierSplit?.laid || [];
  const otherSplit = odds.tierSplit?.other;
  const splitText = (s, t) => {
    if (!s) return '—';
    if (t === 6) return `100${odds.ultraTrinket ? ` · plus ${pct(odds.ultraTrinket)} Ultra trinket` : ''}`;
    const parts = s.map(x => Math.round(x * 1000) / 10);
    if (t === 5) return `${parts[0]} / ${parts[1]} (Ultra) / —`;
    if (t === 4) return `${parts[0]} / ${parts[1]} / ${parts[2]} (Ultra)`;
    return parts.join(' / ');
  };
  const ic = odds.itemCount || {};
  const h = odds.hatch || {};
  return html`<div class="table-wrap" tabindex="0" role="region" aria-label="Egg odds table"><table class="odds-table"><thead><tr><th scope="col">Egg tier</th><th scope="col">Pet egg inside · laid by a pet</th><th scope="col">· streak, chest &amp; season</th><th scope="col">If laid: same / +1 / +2</th></tr></thead>
<tbody>${TIERS.map((t, i) => html`<tr><th scope="row" style="color:${tierColor(i)}">${t}</th><td>${laid[i] !== undefined ? pct(laid[i]) : '—'}</td><td>${other[i] !== undefined ? pct(other[i]) : '—'}</td><td>${splitText(split[i], i)}</td></tr>`)}</tbody></table></div>
<ul class="rules">
${otherSplit ? html`<li>Streak, chest and season eggs never jump two tiers: ${pct(otherSplit[0])} same tier, ${pct(otherSplit[1])} one higher.</li>` : ''}
${odds.loot ? html`<li>Everything else in an egg is loot: ${odds.loot.map(l => `${l.label} ${pct(l.weight)}`).join(' · ')}.</li>` : ''}
${odds.itemCount ? html`<li>Items per egg: ${ic.min}–${ic.max}, about ${ic.mean ?? 5.5} on average, plus ${ic.perTenLevels ?? 1} for every 10 levels of the pet that laid it (up to +${ic.maxBonus ?? 5}).</li>` : ''}
${odds.hatch ? html`<li>Hatching: ${pct(h.own)} its own tier, ${pct(h.up)} one higher. Each serving of food k tiers above the egg adds ${(h.bonus || []).map(pct).join(', ')} to the next tiers. The egg always keeps at least ${pct(h.floor)} of its own tier.</li>` : ''}
${odds.servings ? html`<li>Servings to hatch: ${odds.servings.map((n, t) => `${TIERS[t]} ${n}`).join(' · ')}. Separating gives ${(odds.separate || []).join(' / ')} servings of its tier.</li>` : ''}
${odds.charm ? html`<li>Charms: one per egg, ${pct(odds.charm.chance)} for +1 tier after the roll; the egg needs ${Math.round(((odds.charm.servingsMult ?? 1.5) - 1) * 100)}% more servings. Sprout charms work on Ordinary to Super Rare eggs only.</li>` : ''}
${odds.merge ? html`<li>Merge mutation: ${pct(odds.merge.mutation)}. Combine success: ${(odds.combine || []).map((r, t) => `${TIERS[t]} ${pct(r)}`).join(' · ')}.</li>` : ''}
</ul>`;
}

// ---------- shop ----------
export function renderShop(shop, ctx) {
  if (!ctx.owner || !shop) {
    return html`<p class="small muted">Coins and diamonds are earned only: no real money, ever. Freezes 600 coins (hold 3) · extra seats 150 / 400 / 1,000 diamonds · Epic pet egg 250 diamonds · Sprout charm 60 diamonds · Beacon 300 diamonds · trinkets from 150 diamonds. Real-life rewards are priced at about 300 coins per good day.</p>`;
  }
  const isLife = id => /^real-?life$/.test(id);
  const tabs = (shop.tabs || []).some(t => isLife(t.id)) ? shop.tabs : [...(shop.tabs || []), { id: 'real-life', label: 'Real life' }];
  const active = tabs.find(t => t.id === ui(ctx).shopTab) || tabs[0];
  return html`<div class="shop-head"><div class="picker-row" role="group" aria-label="Shop sections">${tabs.map(t => html`<button type="button" class="chip-button" data-action="shop-tab" data-tab="${t.id}" aria-pressed="${t.id === active.id}" style="--chip:var(--accent)">${t.label}</button>`)}</div></div>
${shop.flashSale ? html`<p class="flash-sale">Ultra flash sale: ${num(shop.flashSale.price)} diamonds until ${stampLabel(shop.flashSale.until)}.</p>` : ''}
${isLife(active.id) ? renderRealLife(shop, ctx) : html`<ul class="shop-grid">${(active.items || []).map(it => {
    const color = it.tier !== undefined ? tierColor(it.tier) : 'var(--ink)';
    return html`<li class="shop-item"><p class="shop-name" style="color:${color}">${it.name}</p><p class="small muted">${it.desc || ''}${it.max ? ` You hold ${it.owned ?? 0} / ${it.max}.` : ''}</p>
<div class="shop-buy"><span class="mono">${num(it.price)} ${it.currency}</span><button type="button" class="button button--accent" data-action="buy" data-item="${it.id}" aria-label="Buy ${it.name} for ${num(it.price)} ${it.currency}"${it.canBuy ? '' : raw(' disabled')}>${it.canBuy ? 'Buy' : 'Buy'}</button></div>${!it.canBuy && it.reason ? html`<p class="small amber">${it.reason}</p>` : ''}</li>`;
  })}</ul>`}`;
}

export function renderRealLife(shop, ctx) {
  const editing = ui(ctx).editRewards;
  return html`<p class="small muted">About 300 coins ≈ one good day. Rewards add to life; they never gate sleep, meals or friends. Screen-time rewards end by 9:30 PM.</p>
${editing ? renderRewardEditor(shop.rewards || []) : html`<ul class="shop-grid">${(shop.rewards || []).map(r => html`<li class="shop-item"><p class="shop-name">${r.name}</p><p class="small muted">${r.size ? `Size ${r.size}` : ''}${r.note ? ` · ${r.note}` : ''}</p><div class="shop-buy"><span class="mono">${num(r.price)} coins</span><button type="button" class="button button--accent" data-action="redeem" data-reward="${r.id}"${(r.canBuy ?? shop.coins >= r.price) ? '' : raw(' disabled')}>Redeem</button></div>${r.canBuy === false && r.reason ? html`<p class="small amber">${r.reason}</p>` : ''}</li>`)}</ul>
<button type="button" class="text-button" data-action="edit-rewards">Edit rewards</button>`}
<h3 class="sub-title">Redemption log</h3>${(shop.redemptions || []).length ? html`<ul class="redemptions">${shop.redemptions.map(r => html`<li><span>${r.name}</span><span class="mono small muted">${num(r.price ?? r.coins)} coins · ${r.at ? stampLabel(r.at) : ''}${r.taken ? ' · taken' : ''}</span>${r.taken ? '' : html`<button type="button" class="text-button" data-action="reward-taken" data-redemption="${r.id}">Mark taken</button>`}</li>`)}</ul>` : html`<p class="empty">Nothing redeemed yet.</p>`}`;
}

export function renderRewardEditor(rewards) {
  return html`<form data-form="rewards" class="reward-editor"><input type="hidden" name="count" value="${rewards.length}"><ol>${rewards.map((r, i) => html`<li><input type="hidden" name="r-${i}-id" value="${r.id}"><label class="field field--wide"><span>Reward</span><input name="r-${i}-name" value="${r.name}" maxlength="60"></label><label class="field field--narrow"><span>Coins</span><input type="number" min="50" step="50" name="r-${i}-price" value="${r.price}"></label><label class="check"><input type="checkbox" name="r-${i}-remove"> Remove</label></li>`)}
<li><label class="field field--wide"><span>New reward</span><input name="new-name" maxlength="60"></label><label class="field field--narrow"><span>Coins</span><input type="number" min="50" step="50" name="new-price"></label></li></ol>
<div class="manage-row"><button type="submit" class="button button--accent">Save rewards</button><button type="button" class="button" data-action="edit-rewards-cancel">Cancel</button></div></form>`;
}

export function readRewardForm(form) {
  const data = new FormData(form);
  const out = [];
  for (let i = 0; i < Number(data.get('count')); i += 1) {
    if (data.get(`r-${i}-remove`) === 'on') continue;
    const name = String(data.get(`r-${i}-name`) || '').trim();
    if (name) out.push({ id: String(data.get(`r-${i}-id`)), name, price: Math.max(50, Number(data.get(`r-${i}-price`)) || 50) });
  }
  const name = String(data.get('new-name') || '').trim();
  if (name) out.push({ id: `r-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, price: Math.max(50, Number(data.get('new-price')) || 300) });
  return out;
}

// ---------- reveal dialog content ----------
export function renderRevealStage({ tier, kind = 'open', state = 'idle' }, art) {
  return raw(art.renderEgg({ kind, tier, state, size: 200 }));
}
