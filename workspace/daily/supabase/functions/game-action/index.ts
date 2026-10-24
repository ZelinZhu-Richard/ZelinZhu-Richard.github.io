// game-action: every owner state change (PLAN.md section 1 "Later: Supabase"). Owner only.
// POST { op: 'load' }                          → { state, version, rules }   (state: null when no game yet)
// POST { op: 'create', tasks }                 → a new game from the first list
// POST { op: 'import', save, replace?, version? } → moves a local-first save (LocalBackend exportJson) to the cloud
// POST { op: 'act', action, version }          → engine applyAction at the server's clock
// POST { op: 'advance', version? }             → closes finished days / opens today when the browser sees one due
// Every success answers { state (seed redacted), version, events, rules }. Randomness and `now` are the
// server's; the browser only displays state and calls actions.

import { fail, json, preflight } from '../_shared/cors.ts';
import { admin, checkOwner, commit, engine, type Game, loadGame, logRefusal, readJson, rules } from '../_shared/game.ts';
import { redactState } from '../../../app/cloud-protocol.js';

const isGameError = (err: unknown): err is { code: string; message: string } => (err as Error)?.name === 'GameError';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(req, 405, 'method', 'Use POST.');

  const who = await checkOwner(req);
  if (!who.ok) return fail(req, who.status, who.code, who.message);

  let body: Record<string, any>;
  try {
    body = await readJson(req);
  } catch {
    return fail(req, 400, 'bad_request', 'The request body must be a JSON object under 2 MB.');
  }

  const db = admin();
  try {
    const hash = await rules(db);
    const now = Date.now();
    const answer = (g: Game, events: unknown[] = [], status = 200) =>
      json(req, status, { state: redactState(g.state), version: g.version, events, rules: hash });
    const stale = (g: Game) =>
      fail(req, 409, 'stale', 'The game changed on another device or at the nightly close. It has been refreshed; try again.', {
        state: redactState(g.state), version: g.version, rules: hash,
      });

    const game = await loadGame(db);

    switch (body.op) {
      case 'load':
        return json(req, 200, { state: game ? redactState(game.state) : null, version: game?.version ?? 0, events: [], rules: hash });

      case 'create': {
        if (game) return fail(req, 409, 'game_exists', 'A game already exists.', { state: redactState(game.state), version: game.version, rules: hash });
        let state;
        let events: unknown[];
        try {
          const fresh = engine.newGame({ seed: engine.randomSeed(), now, tasks: body.tasks });
          ({ state, events } = engine.advance(fresh, now));
        } catch (err) {
          if (isGameError(err)) return fail(req, 400, err.code, err.message);
          throw err;
        }
        const version = await commit(db, { expected: null, before: null, state, source: 'create', action: { type: 'create', tasks: body.tasks }, events, now, rules: hash });
        if (version === null) return stale((await loadGame(db))!);
        return answer({ state, version }, events, 201);
      }

      case 'import': {
        const save = body.save;
        if (game && !body.replace) return fail(req, 409, 'game_exists', 'A game already exists. Import with replace to overwrite it.', { state: redactState(game.state), version: game.version, rules: hash });
        if (game && body.version !== game.version) return stale(game);
        let state;
        let events: unknown[];
        try {
          const parsed = engine.migrate(structuredClone(save));
          // New server-only seed: a local-first save's seed was made (and is readable) in the browser.
          parsed.rng = { seed: engine.randomSeed(), n: 0 };
          ({ state, events } = engine.advance(parsed, now));
        } catch (err) {
          if (isGameError(err)) return fail(req, 400, err.code, err.message);
          return fail(req, 400, 'bad_save', 'That file is not a Daily save.');
        }
        const action = { type: 'import', createdAt: save?.createdAt ?? null, replaced: Boolean(game), reseeded: true };
        const version = await commit(db, { expected: game ? game.version : null, before: null, state, source: 'import', action, events, now, rules: hash });
        if (version === null) return stale((await loadGame(db))!);
        return answer({ state, version }, events, 201);
      }

      case 'act': {
        if (!game) return fail(req, 404, 'no_game', 'There is no game yet.');
        if (body.version !== game.version) return stale(game);
        const action = body.action;
        if (!action || typeof action !== 'object' || typeof action.type !== 'string') return fail(req, 400, 'bad_action', 'An action needs a type.');
        let result;
        try {
          result = engine.applyAction(game.state, action, now);
        } catch (err) {
          if (!isGameError(err)) throw err;
          await logRefusal(db, game, action, now, err);
          return fail(req, 400, err.code, err.message);
        }
        const version = await commit(db, { expected: game.version, before: game.state, state: result.state, source: 'action', action, events: result.events, now, rules: hash });
        if (version === null) return stale((await loadGame(db))!);
        return answer({ state: result.state, version }, result.events);
      }

      case 'advance': {
        if (!game) return fail(req, 404, 'no_game', 'There is no game yet.');
        const { state, events } = engine.advance(game.state, now);
        if (!events.length && JSON.stringify(state) === JSON.stringify(game.state)) return answer(game);
        const version = await commit(db, { expected: game.version, before: game.state, state, source: 'advance', action: null, events, now, rules: hash });
        // Lost the race (the cron close or another device got there first): their result is the same day close.
        if (version === null) return answer((await loadGame(db))!);
        return answer({ state, version }, events);
      }

      default:
        return fail(req, 400, 'bad_op', 'Unknown operation.');
    }
  } catch (err) {
    console.error('game-action', err);
    return fail(req, 500, 'server', 'Something went wrong on the server. Nothing was changed.');
  }
});
