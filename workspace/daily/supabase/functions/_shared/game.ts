// Server side of Daily: Supabase clients, caller checks, and reading/writing the one save.
// The engine is imported from workspace/daily/engine/ unchanged: the rules exist in exactly one place.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import * as engine from '../../../engine/index.js';
import { drawLog, listRows, rulesHash } from '../../../app/cloud-protocol.js';
import { MAX_LOGGED_DRAWS } from './config.ts';

export { engine };

// Hosted projects may expose the new key names (JSON maps) instead of the legacy ones.
function key(legacy: string, modern: string): string {
  const v = Deno.env.get(legacy);
  if (v) return v;
  try {
    const map = JSON.parse(Deno.env.get(modern) || '{}');
    return map.default || Object.values(map)[0] || '';
  } catch {
    return '';
  }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = key('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');
const SERVICE_KEY = key('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Service-role client: bypasses RLS. Only ever used inside these functions. */
export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: NO_SESSION });
}

type Check = { ok: true } | { ok: false; status: number; code: string; message: string };

/** The caller must send a session token of an allowlisted owner (public.is_owner()). */
export async function checkOwner(req: Request): Promise<Check> {
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+/.test(auth)) return { ok: false, status: 401, code: 'signed_out', message: 'Sign in first.' };
  const user = createClient(SUPABASE_URL, ANON_KEY, { auth: NO_SESSION, global: { headers: { Authorization: auth } } });
  const { data, error } = await user.rpc('is_owner');
  if (error) return { ok: false, status: 401, code: 'signed_out', message: 'Your session has expired. Sign in again.' };
  if (data !== true) return { ok: false, status: 403, code: 'not_owner', message: 'Not authorised.' };
  return { ok: true };
}

/** Cron calls carry the shared secret (Vault daily_cron_secret = function secret CRON_SECRET). */
export function checkCron(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET') || '';
  const given = req.headers.get('x-daily-cron') || '';
  if (expected.length < 16 || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export async function readJson(req: Request, limit = 2_000_000): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > limit) throw new Error('too_large');
  const body = text ? JSON.parse(text) : {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not_object');
  return body;
}

let rulesCache: string | null = null;
let configSynced = false;

/** The rules hash of the engine these functions run; also mirrors CONFIG into game_config once per isolate. */
export async function rules(db: SupabaseClient): Promise<string> {
  rulesCache ??= await rulesHash(engine);
  if (!configSynced) {
    const { data } = await db.from('game_config').select('hash').eq('id', 1).maybeSingle();
    if (data?.hash !== rulesCache) {
      const { error } = await db.from('game_config').upsert({ id: 1, hash: rulesCache, config: engine.CONFIG, updated_at: new Date().toISOString() });
      if (error) console.error('game_config sync failed', error.message);
    }
    configSynced = true;
  }
  return rulesCache;
}

export type Game = { state: any; version: number };

export async function loadGame(db: SupabaseClient): Promise<Game | null> {
  const { data, error } = await db.from('game_state').select('state, version').eq('id', 1).maybeSingle();
  if (error) throw new Error(`load failed: ${error.message}`);
  return data ? { state: data.state, version: data.version } : null;
}

type Write = {
  expected: number | null; // null = create (only when no game exists)
  before: any | null; // the state the write started from (for the RNG log); null for create/import
  state: any;
  source: 'create' | 'import' | 'action' | 'advance' | 'day-close';
  action: unknown;
  events: unknown[];
  now: number;
  rules: string;
};

/** One atomic write (public.daily_commit). Returns the new version, or null if the stored version moved on. */
export async function commit(db: SupabaseClient, w: Write): Promise<number | null> {
  const seed = w.state.rng.seed;
  const from = w.before ? w.before.rng.n : 0;
  const rng = drawLog(engine.drawAt, seed, from, w.state.rng.n, MAX_LOGGED_DRAWS);
  const { data, error } = await db.rpc('daily_commit', {
    p_expected: w.expected,
    p_state: w.state,
    p_config_hash: w.rules,
    p_event: { now_ms: w.now, source: w.source, action: w.action, rng, events: w.events },
    p_snapshot: engine.publicSnapshot(w.state, w.now),
    p_lists: listRows(w.state),
  });
  if (error) throw new Error(`commit failed: ${error.message}`);
  return typeof data === 'number' ? data : null;
}

/** A refused action is logged too (ok: false, nothing changed). Best effort. */
export async function logRefusal(db: SupabaseClient, g: Game, action: unknown, now: number, err: { code?: string; message?: string }) {
  const { error } = await db.from('game_events').insert({
    now_ms: now, source: 'action', action, ok: false, error: { code: err.code || 'error', message: err.message || '' },
    rng: { from: g.state.rng.n, to: g.state.rng.n, draws: [] }, events: [], version: g.version,
  });
  if (error) console.error('refusal log failed', error.message);
}
