// Backend interface (ARCHITECTURE.md "UI backend"). The UI talks only to this object:
//   load() → { state, events }   act(action) → { state, events }   views() → view models
// LocalBackend runs the pure engine in the browser and saves to localStorage.
// PublicBackend shows the published snapshot read-only. A later SupabaseBackend replaces
// LocalBackend without touching the engine or the render modules.
export const SAVE_KEY = 'daily:v1';
export const SNAPSHOT_URL = '/daily/snapshot.json';

function safeStorage(storage) {
  return {
    get(key) { try { return storage?.getItem(key) ?? null; } catch { return null; } },
    set(key, value) { try { storage?.setItem(key, value); return true; } catch { return false; } },
    remove(key) { try { storage?.removeItem(key); } catch { /* blocked storage */ } },
  };
}

export async function loadEngine(base = import.meta.url) {
  try {
    const engine = await import(new URL('../engine/index.js', base).href);
    return typeof engine.applyAction === 'function' ? engine : null;
  } catch {
    return null;
  }
}

function randomSeed() {
  const seed = new Uint32Array(4);
  globalThis.crypto.getRandomValues(seed);
  return Array.from(seed);
}

export class LocalBackend {
  constructor(engine, storage, clock = () => Date.now()) {
    this.mode = 'owner';
    this.engine = engine;
    this.store = safeStorage(storage);
    this.clock = clock;
    this.state = null;
  }

  now() { return this.clock(); }

  hasSave() { return this.store.get(SAVE_KEY) !== null; }

  persist(next) {
    if (!this.store.set(SAVE_KEY, JSON.stringify(next))) throw Object.assign(new Error("That didn't save. Try again."), { code: 'save-failed' });
    this.state = next;
  }

  async load() {
    const text = this.store.get(SAVE_KEY);
    if (text === null) throw Object.assign(new Error('No save on this device.'), { code: 'no-save' });
    return this.refresh(JSON.parse(text));
  }

  // advance(): closes finished days and opens today. Called on load, focus and every minute.
  refresh(from = this.state) {
    const { state, events } = this.engine.advance(from, this.now());
    this.persist(state);
    return { state, events };
  }

  create(tasks) {
    const state = this.engine.newGame({ seed: randomSeed(), now: this.now(), tasks });
    this.persist(state);
    return this.refresh(state);
  }

  act(action) {
    const { state, events } = this.engine.applyAction(this.state, action, this.now());
    this.persist(state); // a failed write throws and leaves this.state untouched (no partial change)
    return { state, events };
  }

  views() {
    const e = this.engine, s = this.state, n = this.now();
    return {
      header: e.viewHeader(s, n), today: e.viewToday(s, n), pets: e.viewPets(s, n), eggs: e.viewEggs(s),
      collection: e.viewCollection(s), shop: e.viewShop(s, n), odds: e.viewOdds(), receipts: e.viewReceipts(s, n),
      ladder: e.viewLadder(s), settings: s.settings || {}, generatedAt: n, morning: typeof e.viewMorning === 'function' ? e.viewMorning(s, n) : null,
      list: s.list ? { month: s.list.month, tasks: s.list.tasks, next: s.nextList?.tasks || null, swapUsed: (s.list.swaps || 0) >= 1 } : null,
    };
  }

  hatchOdds(...args) { return typeof this.engine.hatchOdds === 'function' ? this.engine.hatchOdds(...args) : null; }
  exportJson() { return JSON.stringify(this.state, null, 2); }
  importJson(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('That file is not a Daily save.');
    return this.refresh(parsed);
  }
  exportSnapshot() { return JSON.stringify(this.engine.publicSnapshot(this.state, this.now()), null, 2); }
  forget() { this.store.remove(SAVE_KEY); }
}

export class PublicBackend {
  constructor(fetchImpl = globalThis.fetch?.bind(globalThis), url = SNAPSHOT_URL, clock = () => Date.now()) {
    this.mode = 'visitor';
    this.fetch = fetchImpl;
    this.url = url;
    this.clock = clock;
    this.snapshot = null;
  }
  now() { return this.clock(); }
  async load() {
    const res = await this.fetch(this.url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Snapshot unavailable (${res.status}).`);
    this.snapshot = await res.json();
    if (this.snapshot?.format !== 'daily-public') throw new Error('Unexpected snapshot format.');
    return { state: this.snapshot, events: [] };
  }
  refresh() { return { state: this.snapshot, events: [] }; }
  act() { throw Object.assign(new Error('Read-only public view.'), { code: 'read-only' }); }
  views() { return snapshotViews(this.snapshot); }
}

// Maps a public snapshot onto the same view-model names the owner UI uses.
export function snapshotViews(snap) {
  return {
    header: snap.header, today: snap.today, pets: snap.pets,
    eggs: { counts: snap.eggs || null }, collection: { petdex: snap.petdex || null }, swaps: snap.swaps || [],
    shop: null, odds: snap.odds || null, receipts: snap.receipts, ladder: snap.ladder,
    settings: {}, list: null, generatedAt: snap.generatedAt, preview: snap.kind === 'preview' || Boolean(snap.preview),
  };
}

// Chooses the backend: a save on this device → owner; otherwise visitor.
// Local dev hosts may pass ?fixtures=owner|visitor to use the hand-written fixtures.
export async function createBackend({ location = globalThis.location, storage = globalThis.localStorage, fetchImpl, base = import.meta.url } = {}) {
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost|.*\.test)$/.test(location?.hostname || '');
  const fixtures = local ? new URLSearchParams(location.search).get('fixtures') : null;
  if (fixtures) {
    try {
      const mod = await import(new URL('./fixtures/backend.js', base).href);
      return mod.createFixtureBackend(fixtures === 'visitor' ? 'visitor' : 'owner', storage);
    } catch { /* fixtures are not deployed; fall through */ }
  }
  const store = safeStorage(storage);
  if (store.get(SAVE_KEY) !== null) {
    const engine = await loadEngine(base);
    if (engine) return new LocalBackend(engine, storage);
  }
  return new PublicBackend(fetchImpl);
}

// "Owner view": creates the save on this device from a list. Needs the engine.
export async function startOwnerGame(tasks, { storage = globalThis.localStorage, base = import.meta.url } = {}) {
  const engine = await loadEngine(base);
  if (!engine) throw new Error('The game engine is not available yet.');
  const backend = new LocalBackend(engine, storage);
  backend.create(tasks);
  return backend;
}

export async function defaultTasks(fallback, base = import.meta.url) {
  const engine = await loadEngine(base);
  return Array.isArray(engine?.DEFAULT_TASKS) ? engine.DEFAULT_TASKS : fallback;
}
