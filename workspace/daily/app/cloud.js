// Supabase mode (PLAN.md section 1 "Later: Supabase"), loaded only when app/cloud-config.js holds a project.
// SupabaseBackend keeps LocalBackend's interface, so the controller and renderers don't change: the engine still
// computes every view in the browser, but every state change and every random draw happens in the game-action
// Edge Function, and the browser holds a copy of the state with the RNG seed removed.
// Visitors read the sanitized public snapshot (the daily_public view) with the public key.
import { CLOUD } from './cloud-config.js';
import { rulesHash } from './cloud-protocol.js';
import { PublicBackend, SAVE_KEY, SNAPSHOT_URL, engineViews, loadEngine } from './backend.js';

export const VENDOR_SRC = '/daily/vendor/supabase.js';
/** A save uploaded to the cloud stays on this device under this key, as a backup that is never offered again. */
export const UPLOADED_KEY = `${SAVE_KEY}:uploaded`;
const RESYNC_MS = 5 * 60 * 1000; // re-read the cloud save this often while the page is open (other devices)

export class CloudError extends Error {
  constructor(code, message, status = 0, body = null) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

let libPromise = null;
/** The vendored supabase-js UMD build: a classic script that defines window.supabase. Loaded once. */
export function loadSupabaseLib({ doc = globalThis.document, src = VENDOR_SRC } = {}) {
  if (globalThis.supabase?.createClient) return Promise.resolve(globalThis.supabase);
  libPromise ??= new Promise((resolve, reject) => {
    const el = doc.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => (globalThis.supabase?.createClient ? resolve(globalThis.supabase) : reject(new Error('supabase-js did not load.')));
    el.onerror = () => { libPromise = null; reject(new Error('supabase-js could not be loaded.')); };
    doc.head.append(el);
  });
  return libPromise;
}

// One auth session for /daily/ and /hq/ (same origin, same storage key). PKCE: GitHub sends the owner back
// with ?code=…, which the client exchanges on load.
export function createCloudClient(lib, cloud = CLOUD) {
  return lib.createClient(cloud.url, cloud.anonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

/** Where GitHub sends the owner back: this page without query or hash. It must be in Supabase's redirect URLs. */
export const returnUrl = (loc = globalThis.location) => `${loc.origin}${loc.pathname}`;

/** After the GitHub round trip the client has exchanged ?code=…; drop it so a reload doesn't try again. */
export function cleanAuthParams(loc = globalThis.location, history = globalThis.history) {
  try {
    const params = new URLSearchParams(loc?.search || '');
    if (params.has('code') || params.has('error_description')) history.replaceState(null, '', returnUrl(loc));
  } catch { /* not a browser */ }
}

export async function signIn(client, loc = globalThis.location) {
  const { error } = await client.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: returnUrl(loc) } });
  if (error) throw new CloudError('sign_in', error.message);
}

export async function signOut(client) {
  try { await client.auth.signOut(); } catch { /* already signed out */ }
}

export async function accessToken(client) {
  try {
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

/** POST to one Edge Function with the owner's session. Throws CloudError(code, message, status, body). */
export async function callFunction({ cloud = CLOUD, fetchImpl = globalThis.fetch?.bind(globalThis), token }, name, body) {
  let res;
  try {
    res = await fetchImpl(`${cloud.url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cloud.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CloudError('offline', "Can't reach the server. Check the connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or not JSON */ }
  if (!res.ok) throw new CloudError(data?.error?.code || `http_${res.status}`, data?.error?.message || `The server answered ${res.status}.`, res.status, data);
  return data;
}

export class SupabaseBackend {
  constructor(engine, { cloud = CLOUD, client = null, fetchImpl = globalThis.fetch?.bind(globalThis), getToken = () => accessToken(client), clock = () => Date.now() } = {}) {
    this.mode = 'owner';
    this.cloud = true;
    this.engine = engine;
    this.config = cloud;
    this.client = client;
    this.fetchImpl = fetchImpl;
    this.getToken = getToken;
    this.clock = clock;
    this.state = null;
    this.version = 0;
    this.rules = null;
    this.serverRules = null;
    this.syncedAt = 0;
  }

  now() { return this.clock(); }
  get hasGame() { return this.state !== null; }
  /** True when the deployed Edge Functions run different rules from this page (one side is not deployed yet). */
  get rulesMismatch() { return Boolean(this.rules && this.serverRules && this.rules !== this.serverRules); }

  async call(name, body) {
    const token = await this.getToken();
    if (!token) throw new CloudError('signed_out', 'Sign in again to keep playing.', 401);
    return callFunction({ cloud: this.config, fetchImpl: this.fetchImpl, token }, name, body);
  }

  adopt(r) {
    this.state = r.state ?? null;
    this.version = r.version ?? 0;
    this.serverRules = r.rules ?? null;
    this.syncedAt = this.now();
    return { state: this.state, events: r.events || [] };
  }

  /** Reads the cloud save (state is null until the first list or an upload). Throws CloudError('not_owner'). */
  async init() {
    this.rules = await rulesHash(this.engine);
    this.adopt(await this.call('game-action', { op: 'load' }));
    return this;
  }

  async load() {
    if (!this.state) throw new CloudError('no_game', 'There is no game yet.');
    return this.refresh();
  }

  // advance() is pure, so the browser can tell when a day is due to close or open; only then does it ask the
  // server, which runs the real advance (and its draws). Otherwise it re-reads the save every few minutes.
  async refresh() {
    if (!this.state) return { state: null, events: [] };
    if (this.engine.advance(this.state, this.now()).events.length) return this.adopt(await this.call('game-action', { op: 'advance', version: this.version }));
    if (this.now() - this.syncedAt >= RESYNC_MS) return this.adopt(await this.call('game-action', { op: 'load' }));
    return { state: this.state, events: [] };
  }

  async act(action) {
    try {
      return this.adopt(await this.call('game-action', { op: 'act', action, version: this.version }));
    } catch (err) {
      if (err.code === 'stale' && err.body?.state) this.adopt(err.body); // show what changed; the owner retries
      throw err;
    }
  }

  async create(tasks) {
    return this.adopt(await this.call('game-action', { op: 'create', tasks }));
  }

  /** Uploads a local-first save (LocalBackend exportJson). Replaces the cloud game when one exists. */
  async importJson(text) {
    let save;
    try { save = JSON.parse(text); } catch { throw new Error('That file is not a Daily save.'); }
    if (!save || typeof save !== 'object' || Array.isArray(save)) throw new Error('That file is not a Daily save.');
    return this.adopt(await this.call('game-action', { op: 'import', save, replace: this.hasGame, version: this.version }));
  }

  views() { return engineViews(this.engine, this.state, this.now()); }
  hatchOdds(...args) { return typeof this.engine.hatchOdds === 'function' ? this.engine.hatchOdds(...args) : null; }
  exportJson() { return JSON.stringify(this.state, null, 2); }
  exportSnapshot() { return JSON.stringify(this.engine.publicSnapshot(this.state, this.now()), null, 2); }

  /** generate-variants: five tier descriptions for one task in the list editor. */
  async suggestTiers(task) { return (await this.call('generate-variants', { task })).tiers; }

  async forget() { if (this.client) await signOut(this.client); }
}

/** The public view from the cloud (daily_public), falling back to the published /daily/snapshot.json. */
export class CloudPublicBackend extends PublicBackend {
  constructor({ cloud = CLOUD, fetchImpl = globalThis.fetch?.bind(globalThis), clock, client = null, notice = '', pendingOwner = null } = {}) {
    super(fetchImpl, SNAPSHOT_URL, clock);
    this.config = cloud;
    this.client = client; // set: the "Owner view" link signs in with GitHub
    this.notice = notice;
    this.pendingOwner = pendingOwner; // set: signed in as the owner, but no cloud game yet
    this.source = null;
  }

  async load() {
    try {
      const res = await this.fetch(`${this.config.url}/rest/v1/daily_public?select=snapshot`, { headers: { apikey: this.config.anonKey, Accept: 'application/json' }, cache: 'no-cache' });
      const snap = res.ok ? (await res.json())?.[0]?.snapshot : null;
      if (snap?.format === 'daily-public') {
        this.snapshot = snap;
        this.source = 'cloud';
        return { state: snap, events: [] };
      }
    } catch { /* fall back to the published file */ }
    this.source = 'file';
    return super.load();
  }
}

/** Owner (signed in and allowlisted) → SupabaseBackend; anyone else → CloudPublicBackend. */
export async function createCloudBackend({ cloud = CLOUD, location = globalThis.location, fetchImpl = globalThis.fetch?.bind(globalThis), base = import.meta.url, loadLib = loadSupabaseLib } = {}) {
  const visitor = (extra = {}) => new CloudPublicBackend({ cloud, fetchImpl, ...extra });
  let client;
  try {
    client = createCloudClient(await loadLib(), cloud);
  } catch {
    return visitor({ notice: 'Owner sign-in is unavailable right now.' });
  }
  const token = await accessToken(client); // also completes a pending GitHub sign-in (?code=…)
  cleanAuthParams(location);
  if (!token) return visitor({ client });
  const engine = await loadEngine(base);
  if (!engine) return visitor({ client, notice: 'The game engine is not available.' });
  const owner = new SupabaseBackend(engine, { cloud, client, fetchImpl });
  try {
    await owner.init();
  } catch (err) {
    if (err.code === 'not_owner') {
      await signOut(client);
      return visitor({ client, notice: 'That GitHub account is not the owner. Not authorised.' });
    }
    return visitor({ client, notice: err.code === 'signed_out' ? '' : `The owner view is unavailable: ${err.message}` });
  }
  return owner.hasGame ? owner : visitor({ client, pendingOwner: owner });
}

/** A local-first save on this device that hasn't been uploaded yet (text), or null. */
export function localSave(storage = globalThis.localStorage) {
  try { return storage?.getItem(SAVE_KEY) ?? null; } catch { return null; }
}

/** After an upload: keep the local save as a backup under UPLOADED_KEY so it is not offered again. */
export function retireLocalSave(storage = globalThis.localStorage) {
  try {
    const text = storage.getItem(SAVE_KEY);
    if (text === null) return;
    storage.setItem(UPLOADED_KEY, text);
    storage.removeItem(SAVE_KEY);
  } catch { /* storage blocked: the prompt may show again, the upload is refused as game_exists */ }
}
