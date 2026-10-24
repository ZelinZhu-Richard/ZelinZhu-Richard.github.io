// /daily/eggs/ — eggs, collection & shop, with the loot reveal sequence.
import { createController } from './controller.js';
import {
  analysePair, itemText, readRewardForm, renderCollection, renderHatchery, renderItemChip, renderOdds, renderOpenEggs, renderPetEggBag, renderPetdex, renderShop, revealOrder,
} from './render-eggs.js';
import { renderResources } from './render-common.js';
import { html } from './html.js';
import { SPECIES_NAMES, article, num, pct, tierColor, tierName } from './format.js';
import { reduced, wait } from './motion.js';

const sections = (vm, ctx) => ({
  resources: ctx.owner ? renderResources(vm.shop, vm.eggs, vm.header, { eggFoodTiers: 4 }) : html``,
  openable: renderOpenEggs(vm.eggs, vm.odds, ctx),
  hatchery: renderHatchery(vm.eggs, vm.odds, ctx),
  bag: renderPetEggBag(vm.eggs, vm.collection, vm.odds, ctx),
  collection: vm.pets ? renderCollection(vm.pets, vm.collection, vm.odds, ctx) : html``,
  petdex: renderPetdex(vm.collection?.petdex, ctx),
  odds: renderOdds(vm.odds),
  shop: renderShop(vm.shop, ctx),
});

// ---------- the reveal: shake, crack, items one by one, pet egg last, rarity burst ----------
const R = {
  dialog: () => document.getElementById('reveal-dialog'),
  set(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; },
};

function revealSetup({ kicker, title }) {
  const d = R.dialog();
  R.set('reveal-kicker', kicker);
  R.set('reveal-title', title);
  document.getElementById('reveal-items').innerHTML = '';
  document.getElementById('reveal-stage').className = 'reveal-stage';
  document.getElementById('reveal-next').hidden = true;
  document.getElementById('reveal-skip').hidden = false;
  if (!d.open) d.showModal();
  return d;
}

function revealSay(text) {
  const el = document.getElementById('reveal-live');
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 20);
}

function stage(markup, burst) {
  const el = document.getElementById('reveal-stage');
  el.innerHTML = markup;
  if (burst !== undefined) { el.style.setProperty('--burst', burst); el.classList.add('is-burst'); }
}

async function revealEgg(c, ev, egg, left) {
  const art = c.art;
  const items = revealOrder(ev.items || []);
  const tier = ev.tier ?? egg?.tier ?? 0;
  const skip = { now: reduced() };
  revealSetup({ kicker: egg?.from || 'Openable egg', title: `${tierName(tier)} egg` });
  document.getElementById('reveal-skip').onclick = () => { skip.now = true; };
  const step = async ms => { if (!skip.now) await wait(ms); };
  stage(art.renderEgg({ kind: 'open', tier, state: 'shake', size: 200 }));
  document.querySelector('#reveal-stage svg')?.classList.add('egg--shake');
  await step(800);
  stage(art.renderEgg({ kind: 'open', tier, state: 'crack', size: 200 }));
  document.querySelector('#reveal-stage svg')?.classList.add('egg--crack');
  await step(550);
  stage(art.renderEgg({ kind: 'open', tier, state: 'open', size: 200 }));
  const list = document.getElementById('reveal-items');
  for (const item of items) {
    const pet = item.kind === 'petEgg';
    if (pet) await step(500);
    list.insertAdjacentHTML('beforeend', String(renderItemChip(item, skip.now ? '' : ' is-new')));
    if (pet) stage(art.renderEgg({ kind: 'pet', tier: item.petEgg?.tier ?? item.tier, state: 'idle', size: 200 }), tierColor(item.petEgg?.tier ?? item.tier));
    if (!skip.now) revealSay(itemText(item));
    await step(pet ? 900 : 380);
  }
  R.set('reveal-title', `${tierName(tier)} egg · ${items.length} items`);
  const summary = items.map(itemText).join(', ');
  revealSay(`${tierName(tier)} egg opened: ${summary}.`);
  document.getElementById('reveal-skip').hidden = true;
  const next = document.getElementById('reveal-next');
  next.hidden = left <= 0;
  next.textContent = `Open next (${left} left)`;
  (left > 0 ? next : document.getElementById('reveal-done')).focus();
  c.ui.lastOpened = { tier, items: ev.items || [] };
  c.render();
}

async function openEgg(c, eggId) {
  const egg = c.vm.eggs.openEggs.find(e => e.id === eggId);
  const events = await c.act({ type: 'egg/open', eggId });
  const ev = events?.find(e => e.type === 'egg.opened');
  if (!ev) return;
  await revealEgg(c, ev, egg, c.vm.eggs.openEggs.length);
  for (const d of events.filter(e => e.type === 'petdex.discovered')) c.announce(`New in the Petdex: ${tierName(d.tier)} ${d.species}.`);
}

async function revealHatch(c, ev, egg) {
  const pet = { ...ev.pet, speciesName: ev.pet.speciesName || SPECIES_NAMES[ev.pet.species] || ev.pet.species };
  const skip = { now: reduced() };
  revealSetup({ kicker: 'Hatchery', title: `${tierName(egg?.tier ?? pet.tier)} pet egg` });
  document.getElementById('reveal-skip').onclick = () => { skip.now = true; };
  const step = async ms => { if (!skip.now) await wait(ms); };
  stage(c.art.renderEgg({ kind: 'pet', tier: egg?.tier ?? pet.tier, state: 'shake', size: 200 }));
  document.querySelector('#reveal-stage svg')?.classList.add('egg--shake');
  await step(900);
  stage(c.art.renderEgg({ kind: 'pet', tier: egg?.tier ?? pet.tier, state: 'crack', size: 200 }));
  document.querySelector('#reveal-stage svg')?.classList.add('egg--crack');
  await step(600);
  stage(c.art.renderPet({ species: pet.species, tier: pet.tier, mood: 'happy', stars: pet.stars || 1, size: 200, name: pet.name, level: 1, focus: true, animate: !skip.now }), tierColor(pet.tier));
  const lucky = egg && pet.tier > egg.tier ? ` Lucky: +${pet.tier - egg.tier} tier${ev.charmUpgraded ? ' (charm)' : ''}.` : '';
  R.set('reveal-title', `${pet.name}, ${article(tierName(pet.tier))} ${tierName(pet.tier)} ${pet.speciesName || pet.species}`);
  document.getElementById('reveal-items').innerHTML = String(html`<li class="item-chip item-chip--pet" style="--chip:${tierColor(pet.tier)}">${tierName(pet.tier)} ${pet.speciesName || pet.species}</li>`);
  revealSay(`Hatched: ${pet.name}, ${article(tierName(pet.tier))} ${tierName(pet.tier)} ${pet.speciesName || pet.species}.${lucky} It goes to a free seat or the backpack.`);
  document.getElementById('reveal-skip').hidden = true;
  document.getElementById('reveal-done').focus();
}

const actions = {
  'open-egg': async (el, ev, c) => openEgg(c, el.dataset.egg),
  'open-all': async (el, ev, c) => { const first = c.vm.eggs.openEggs[0]; if (first) await openEgg(c, first.id); },
  'reveal-next': async (el, ev, c) => { const first = c.vm.eggs.openEggs[0]; if (first) await openEgg(c, first.id); },
  incubate: (el, ev, c) => { c.ui.incubating = el.dataset.petEgg; c.render(); document.querySelector('#hatchery .food-button:not([disabled]), #hatchery .button')?.focus(); },
  'feed-egg': async (el, ev, c) => {
    const events = await c.act({ type: 'petEgg/feed', petEggId: el.dataset.petEgg, foodTier: Number(el.dataset.food) });
    const fed = events?.find(e => e.type === 'petEgg.fed');
    if (fed) c.announce(`${fed.servings} of ${fed.need} servings.${fed.servings >= fed.need ? ' Ready to hatch.' : ''}`);
  },
  charm: async (el, ev, c) => {
    const egg = c.vm.eggs.petEggs.find(e => e.id === el.dataset.petEgg);
    const kind = el.dataset.charm;
    const ok = await c.confirm({ title: `Use a ${kind === 'sprout' ? 'Sprout' : 'Tier'} charm?`, body: `After the hatch roll, ${pct(c.vm.odds?.charm?.chance ?? 0.2)} chance of +1 tier. This ${tierName(egg.tier)} egg will need ${Math.ceil(egg.need * (c.vm.odds?.charm?.servingsMult ?? 1.5))} servings instead of ${egg.need}. One charm per egg; it can't be removed.`, confirm: 'Use the charm' });
    if (ok && await c.act({ type: 'petEgg/charm', petEggId: egg.id, charm: kind })) c.announce('Charm on.');
  },
  hatch: async (el, ev, c) => {
    const egg = c.vm.eggs.petEggs.find(e => e.id === el.dataset.petEgg);
    const events = await c.act({ type: 'petEgg/hatch', petEggId: egg.id });
    const hatched = events?.find(e => e.type === 'petEgg.hatched');
    if (hatched) { c.ui.incubating = null; await revealHatch(c, hatched, egg); c.render(); }
  },
  separate: async (el, ev, c) => {
    const egg = c.vm.eggs.petEggs.find(e => e.id === el.dataset.petEgg);
    const n = (c.vm.odds?.separate || [3, 4, 5, 6, 8, 10, 12])[egg.tier];
    const ok = await c.confirm({ title: `Separate this ${tierName(egg.tier)} pet egg?`, body: `It breaks into ${n} servings of ${tierName(egg.tier)} egg food. The egg is gone for good${egg.servings ? `, along with its ${egg.servings} servings` : ''}.`, confirm: 'Separate it', danger: true });
    if (ok && await c.act({ type: 'petEgg/separate', petEggId: egg.id })) c.announce(`Separated into ${n} ${tierName(egg.tier)} egg food.`);
  },
  'combine-eggs': async (el, ev, c) => {
    const a = c.vm.eggs.petEggs.find(e => e.id === el.dataset.a);
    const chance = c.vm.odds?.combine?.[a.tier] ?? 0;
    const ok = await c.confirm({ title: `Combine two ${tierName(a.tier)} pet eggs?`, body: `${pct(chance)} chance of one ${tierName(a.tier + 1)} pet egg. ${pct(1 - chance)} chance both eggs are destroyed.`, confirm: 'Combine. I accept the risk.', danger: true });
    if (!ok) return;
    const events = await c.act({ type: 'petEgg/combine', aId: el.dataset.a, bId: el.dataset.b });
    const res = events?.find(e => e.type === 'combine.result');
    if (res) c.announce(res.success ? `It worked: one ${tierName(a.tier + 1)} pet egg.` : `Combine failed. Both ${tierName(a.tier)} eggs are gone.`);
  },
  pick: (el, ev, c) => {
    const id = el.dataset.pet;
    let sel = c.ui.selected || [];
    sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id].slice(-2);
    c.ui.selected = sel;
    c.ui.collMsg = '';
    c.render();
  },
  merge: async (el, ev, c) => {
    const an = analysePair([el.dataset.a, el.dataset.b], c.vm.pets, c.vm.collection, c.vm.odds);
    const ok = await c.confirm({ title: `Merge ${an.a.name} and ${an.b.name}?`, body: an.text, confirm: 'Merge' });
    if (!ok) return;
    const events = await c.act({ type: 'pet/merge', aId: an.a.id, bId: an.b.id });
    const res = events?.find(e => e.type === 'pet.merged');
    if (res) { c.ui.selected = []; c.ui.collMsg = res.mutated ? `Mutation! ${an.a.name} went up a tier and has ${res.stars} stars.` : `${an.a.name} now has ${res.stars} stars.`; c.render(); c.announce(c.ui.collMsg); }
  },
  combine: async (el, ev, c) => {
    const an = analysePair([el.dataset.a, el.dataset.b], c.vm.pets, c.vm.collection, c.vm.odds);
    const ok = await c.confirm({ title: `Combine ${an.a.name} and ${an.b.name}?`, body: `${an.text} This can't be undone.`, confirm: 'Combine. I accept the risk.', danger: true });
    if (!ok) return;
    const events = await c.act({ type: 'pet/combine', aId: an.a.id, bId: an.b.id });
    const res = events?.find(e => e.type === 'combine.result');
    if (res) {
      c.ui.selected = [];
      c.ui.collMsg = res.success ? `It worked: ${article(tierName(an.a.tier + 1))} ${tierName(an.a.tier + 1)} ${res.result?.speciesName || res.result?.species || 'pet'}!` : `Combine failed. ${an.a.name} and ${an.b.name} are gone.`;
      c.render();
      c.announce(c.ui.collMsg);
    }
  },
  'shop-tab': (el, ev, c) => { c.ui.shopTab = el.dataset.tab; c.render(); },
  buy: async (el, ev, c) => {
    const item = c.vm.shop.tabs.flatMap(t => t.items).find(i => i.id === el.dataset.item);
    if (item.currency === 'diamonds' || item.price >= 1000) {
      const left = (item.currency === 'diamonds' ? c.vm.shop.diamonds : c.vm.shop.coins) - item.price;
      const ok = await c.confirm({ title: `Buy ${item.name}?`, body: `${num(item.price)} ${item.currency}. You'll have ${num(left)} ${item.currency} left.`, confirm: 'Buy' });
      if (!ok) return;
    }
    if (await c.act({ type: 'shop/buy', itemId: item.id })) c.announce(`Bought ${item.name}.`);
  },
  redeem: async (el, ev, c) => {
    const r = c.vm.shop.rewards.find(x => x.id === el.dataset.reward);
    const ok = await c.confirm({ title: `Redeem ${r.name}?`, body: `${num(r.price)} coins. It never expires; take it when it fits your day. It comes out of your normal real-life budget.`, confirm: 'Redeem' });
    if (ok && await c.act({ type: 'reward/redeem', rewardId: r.id })) c.announce('Redeemed. Enjoy it when it fits your day.');
  },
  'reward-taken': async (el, ev, c) => { if (await c.act({ type: 'reward/markTaken', redemptionId: el.dataset.redemption })) c.announce('Marked taken.'); },
  'edit-rewards': (el, ev, c) => { c.ui.editRewards = true; c.render(); document.querySelector('[data-form="rewards"] input:not([type="hidden"])')?.focus(); },
  'edit-rewards-cancel': (el, ev, c) => { c.ui.editRewards = false; c.render(); },
};

const forms = {
  rewards: async (form, c) => {
    if (await c.act({ type: 'reward/save', rewards: readRewardForm(form) })) { c.ui.editRewards = false; c.render(); c.announce('Rewards saved.'); }
  },
};

const controller = createController({ sections, actions, forms });
controller.ui = { selected: [], shopTab: null, incubating: null, lastOpened: null, editRewards: false };
controller.start();
