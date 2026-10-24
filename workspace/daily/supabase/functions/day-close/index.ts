// day-close: called hourly by pg_cron (migration 20261024120200_cron.sql) with the shared cron secret.
// Runs the engine's advance(): closes every finished day (22:00 New York) and opens today (05:00).
// Idempotent and catch-up safe (the engine keys closes by date), so a missed hour just closes later.

import { fail, json } from '../_shared/cors.ts';
import { admin, checkCron, commit, engine, loadGame, rules } from '../_shared/game.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(req, 405, 'method', 'Use POST.');
  if (!checkCron(req)) return fail(req, 401, 'unauthorised', 'Missing or wrong cron secret.');

  const db = admin();
  try {
    const hash = await rules(db);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const game = await loadGame(db);
      if (!game) return json(req, 200, { ok: true, changed: false, reason: 'no game' });
      const now = Date.now();
      const { state, events } = engine.advance(game.state, now);
      if (!events.length && JSON.stringify(state) === JSON.stringify(game.state)) return json(req, 200, { ok: true, changed: false });
      const version = await commit(db, { expected: game.version, before: game.state, state, source: 'day-close', action: null, events, now, rules: hash });
      if (version !== null) {
        return json(req, 200, { ok: true, changed: true, version, events: events.map((e: { type: string }) => e.type) });
      }
      // The owner acted at the same moment: reload and try again.
    }
    return fail(req, 409, 'busy', 'The save kept changing; the next hourly run will close the day.');
  } catch (err) {
    console.error('day-close', err);
    return fail(req, 500, 'server', 'day-close failed.');
  }
});
