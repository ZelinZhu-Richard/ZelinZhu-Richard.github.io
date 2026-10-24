// The contract between the browser's SupabaseBackend (app/cloud.js) and the Edge Functions
// (supabase/functions/_shared/game.ts). Pure ESM, no DOM, no dependencies: imported by the browser,
// by `node --test` and by Deno, like the engine.

/** game-action operations. Every request is POST { op, ... } with the owner's session. */
export const OPS = Object.freeze(['load', 'create', 'import', 'act', 'advance']);

const ZERO_SEED = [0, 0, 0, 0];

/**
 * The state the owner's browser receives. The RNG seed stays on the server, so outcomes can't be
 * computed ahead in the browser; every draw happens in an Edge Function.
 */
export function redactState(state) {
  if (!state || typeof state !== 'object' || !state.rng) return state;
  return { ...state, rng: { ...state.rng, seed: ZERO_SEED.slice(), redacted: true } };
}

export const isRedacted = (state) => state?.rng?.redacted === true;

/** sha256 (hex) of the rules both sides run: engine CONFIG, the content tables and the save schema version. */
export async function rulesHash(engine) {
  const text = JSON.stringify([engine.CONFIG, engine.content, engine.SCHEMA_VERSION]);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const iso = (at) => (Number.isFinite(at) ? new Date(at).toISOString() : typeof at === 'string' ? at : null);

/** task_lists rows for a state: this month's list (locked) and next month's, if set (not locked yet). */
export function listRows(state) {
  const rows = [];
  if (state?.list?.month) rows.push({ month: state.list.month, tasks: state.list.tasks, locked_at: iso(state.list.lockedAt), swaps: state.list.swaps || 0 });
  if (state?.nextList?.month && state.nextList.month !== state.list?.month) rows.push({ month: state.nextList.month, tasks: state.nextList.tasks, locked_at: null, swaps: 0 });
  return rows;
}

/** What one write drew from the save's RNG stream: the counter range [from, to) and the values (capped at max). */
export function drawLog(drawAt, seed, from, to, max = 512) {
  const draws = [];
  for (let n = from; n < to && draws.length < max; n += 1) draws.push(drawAt(seed, n));
  return { from, to, draws, truncated: to - from > draws.length };
}
