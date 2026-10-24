// generate-variants: owner only. Suggests the five tier descriptions (Chill … Goddamn) for one task in
// list setup, so quality and physical tasks don't need hand-written tier text (PLAN.md section 1).
// POST { task: { name, type, unit?, chill?, chillText?, purpose?, physical? } } → { tiers: { chill, easy, medium, hard, goddamn }, model }
// Needs the ANTHROPIC_API_KEY function secret; the model id is VARIANTS_MODEL in _shared/config.ts.

import Anthropic from 'npm:@anthropic-ai/sdk@0.137.0';
import { fail, json, preflight } from '../_shared/cors.ts';
import { checkOwner, engine, readJson } from '../_shared/game.ts';
import { VARIANTS_MODEL } from '../_shared/config.ts';

const LEVELS: string[] = engine.LEVELS; // chill, easy, medium, hard, goddamn
const TEXT_MAX: number = engine.CONFIG.tasks.textMax;

const SYSTEM = `You write difficulty tiers for one task in Daily, a habit game where the owner's real daily list feeds virtual pets.
Each task has five levels: Chill (the floor, doable on a bad day), Easy, Medium, Hard, and Goddamn (a rare, very hard day).
Write one short, concrete description per level that says exactly what counts as done today.
Rules:
- Each description is at most ${Math.min(TEXT_MAX, 80)} characters, plain text, no emoji, no trailing full stop.
- Each level is clearly harder than the one before, and every level is doable within one day.
- Keep the owner's own Chill wording when one is given.
- Sleep is protected: a harder sleep tier never means less sleep or a later bedtime.
- For a physical task, harder tiers change intensity or form, not only duration.`;

const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(LEVELS.map((lv) => [lv, { type: 'string' }])),
  required: LEVELS,
  additionalProperties: false,
};

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function describe(task: Record<string, unknown>): string {
  const lines = [`Task: ${clip(task.name, 40)}`, `Type: ${task.type === 'quality' ? 'quality (described in words)' : 'quantity (an amount)'}`];
  if (task.unit) lines.push(`Unit: ${clip(task.unit, 20)}`);
  if (Number.isFinite(task.chill)) lines.push(`Chill amount: ${task.chill}`);
  if (task.chillText) lines.push(`Chill (owner's words): ${clip(task.chillText, TEXT_MAX)}`);
  if (task.purpose) lines.push(`Why it matters: ${clip(task.purpose, TEXT_MAX)}`);
  if (task.physical === true) lines.push('Physical: yes');
  return lines.join('\n');
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(req, 405, 'method', 'Use POST.');

  const who = await checkOwner(req);
  if (!who.ok) return fail(req, who.status, who.code, who.message);

  let task: Record<string, unknown>;
  try {
    task = (await readJson(req, 10_000)).task as Record<string, unknown>;
  } catch {
    return fail(req, 400, 'bad_request', 'Send { task }.');
  }
  if (!task || typeof task !== 'object' || !clip(task.name, 40) || !['quality', 'quantity'].includes(task.type as string)) {
    return fail(req, 400, 'bad_task', 'A task needs a name and a type (quality or quantity).');
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fail(req, 503, 'not_configured', 'Tier suggestions are not set up yet (ANTHROPIC_API_KEY).');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: VARIANTS_MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: describe(task) }],
    } as any);
    if (response.stop_reason === 'refusal') return fail(req, 422, 'refused', 'No suggestion for this task. Write the tiers by hand.');
    const text = response.content.find((b: { type: string }) => b.type === 'text') as { text?: string } | undefined;
    const parsed = JSON.parse(text?.text || '{}');
    const tiers = Object.fromEntries(LEVELS.map((lv) => [lv, clip(parsed[lv], TEXT_MAX)]));
    if (LEVELS.some((lv) => !tiers[lv])) return fail(req, 502, 'incomplete', 'The suggestion came back incomplete. Try again.');
    return json(req, 200, { tiers, model: response.model });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return fail(req, 429, 'rate_limited', 'Too many suggestions right now. Try again in a minute.');
    if (err instanceof Anthropic.APIError) {
      console.error('generate-variants', err.status, err.message);
      return fail(req, 502, 'upstream', 'The suggestion service failed. Write the tiers by hand or try again.');
    }
    console.error('generate-variants', err);
    return fail(req, 500, 'server', 'generate-variants failed.');
  }
});
