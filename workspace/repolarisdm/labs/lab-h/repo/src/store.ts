// In-memory flag store. A load validates the whole config first and then swaps
// it in at once, so readers never see half of an update.
import { evaluateFlag } from './evaluate.ts';
import { silentLogger } from './log.ts';
import type { Logger } from './log.ts';
import { validateConfig } from './validate.ts';
import type { EvaluationContext, EvaluationResult, FlagConfig } from './types.ts';

export type LoadResult = { ok: true; version: number; changed: string[] } | { ok: false; errors: string[] };
export type ChangeListener = (version: number, changed: string[]) => void;

export interface StoreOptions {
  logger?: Logger;
}

export class FlagStore {
  #flags = new Map<string, FlagConfig>();
  #version = 0;
  #listeners = new Set<ChangeListener>();
  #logger: Logger;

  constructor(options: StoreOptions = {}) {
    this.#logger = options.logger ?? silentLogger;
  }

  // Starts at 0 (empty store) and goes up by one on every successful load.
  get version(): number {
    return this.#version;
  }

  load(raw: unknown): LoadResult {
    const result = validateConfig(raw);
    if (!result.ok) return result;
    const next = new Map<string, FlagConfig>();
    for (const flag of result.flags) next.set(flag.key, flag);
    const changed = changedKeys(this.#flags, next);
    this.#flags = next;
    this.#version += 1;
    for (const listener of this.#listeners) {
      try {
        listener(this.#version, changed);
      } catch (err) {
        // A broken listener must not undo or block a good config.
        this.#logger.error('change listener failed', { error: String(err) });
      }
    }
    return { ok: true, version: this.#version, changed };
  }

  keys(): string[] {
    return [...this.#flags.keys()].sort();
  }

  get(key: string): FlagConfig | undefined {
    return this.#flags.get(key);
  }

  evaluate(key: string, ctx: EvaluationContext = {}): EvaluationResult {
    const flag = this.#flags.get(key);
    if (!flag) return { flagKey: key, value: null, variant: null, reason: 'ERROR', errorCode: 'FLAG_NOT_FOUND' };
    return evaluateFlag(flag, ctx);
  }

  evaluateAll(ctx: EvaluationContext = {}): Record<string, EvaluationResult> {
    const results: Record<string, EvaluationResult> = {};
    for (const key of this.keys()) results[key] = this.evaluate(key, ctx);
    return results;
  }

  // Returns a function that removes the listener.
  onChange(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

// Keys that were added, removed or edited between two configs, sorted.
function changedKeys(before: Map<string, FlagConfig>, after: Map<string, FlagConfig>): string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((key) => JSON.stringify(before.get(key)) !== JSON.stringify(after.get(key))).sort();
}
