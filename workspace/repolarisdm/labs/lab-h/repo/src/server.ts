// HTTP API (docs/http-api.md). JSON in, JSON out. No framework: node:http only.
import { timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { silentLogger } from './log.ts';
import type { Logger } from './log.ts';
import type { FlagStore } from './store.ts';
import type { EvaluationContext, FlagConfig } from './types.ts';
import { validateContext } from './validate.ts';

export interface ServerOptions {
  store: FlagStore;
  // PUT /v1/config is disabled (403) when no admin token is set.
  adminToken?: string;
  logger?: Logger;
  maxBodyBytes?: number;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

class HttpError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'request body too large');
    chunks.push(chunk);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }
}

async function readContext(req: IncomingMessage, limit: number): Promise<EvaluationContext> {
  const body = await readJson(req, limit);
  const raw = typeof body === 'object' && body !== null ? (body as { context?: unknown }).context : body;
  const result = validateContext(raw);
  if (!result.ok) throw new HttpError(400, 'invalid context', result.errors);
  return result.context;
}

function requireMethod(req: IncomingMessage, method: string): void {
  if (req.method !== method) throw new HttpError(405, `use ${method}`);
}

function isAuthorized(req: IncomingMessage, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(req.headers.authorization ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Public view of a flag: enough to debug targeting, without variant values.
function summarize(flag: FlagConfig) {
  return {
    key: flag.key,
    description: flag.description ?? '',
    enabled: flag.enabled,
    variants: Object.keys(flag.variants),
    defaultVariant: flag.defaultVariant,
    offVariant: flag.offVariant,
    rules: flag.rules.length,
    rollout: flag.rollout !== undefined,
  };
}

export function createHandler(options: ServerOptions): Handler {
  const { store, adminToken } = options;
  const logger = options.logger ?? silentLogger;
  const limit = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return async function handle(req, res) {
    const started = performance.now();
    const path = new URL(req.url ?? '/', 'http://togglebox.invalid').pathname;
    try {
      if (path === '/healthz') {
        requireMethod(req, 'GET');
        return send(res, 200, { status: 'ok', version: store.version });
      }
      if (path === '/v1/flags') {
        requireMethod(req, 'GET');
        const flags = store.keys().map((key) => summarize(store.get(key)!));
        return send(res, 200, { version: store.version, flags });
      }
      if (path === '/v1/evaluate') {
        requireMethod(req, 'POST');
        const ctx = await readContext(req, limit);
        return send(res, 200, { version: store.version, results: store.evaluateAll(ctx) });
      }
      const single = /^\/v1\/evaluate\/([^/]+)$/.exec(path);
      if (single) {
        requireMethod(req, 'POST');
        const ctx = await readContext(req, limit);
        const result = store.evaluate(decodeURIComponent(single[1]), ctx);
        return send(res, result.errorCode === 'FLAG_NOT_FOUND' ? 404 : 200, result);
      }
      if (path === '/v1/config') {
        requireMethod(req, 'PUT');
        if (!adminToken) throw new HttpError(403, 'config updates are disabled');
        if (!isAuthorized(req, adminToken)) throw new HttpError(401, 'missing or wrong admin token');
        const loaded = store.load(await readJson(req, limit));
        if (!loaded.ok) throw new HttpError(400, 'invalid config', loaded.errors);
        logger.info('config replaced over HTTP', { version: loaded.version, changed: loaded.changed });
        return send(res, 200, { version: loaded.version, changed: loaded.changed });
      }
      throw new HttpError(404, 'not found');
    } catch (err) {
      if (err instanceof HttpError) {
        send(res, err.status, err.details === undefined ? { error: err.message } : { error: err.message, details: err.details });
      } else {
        logger.error('unhandled error', { path, error: String(err) });
        send(res, 500, { error: 'internal error' });
      }
    } finally {
      const ms = Math.round(performance.now() - started);
      logger.debug('request', { method: req.method, path, status: res.statusCode, ms });
    }
  };
}

export function createServer(options: ServerOptions): Server {
  const handle = createHandler(options);
  return createHttpServer((req, res) => {
    void handle(req, res);
  });
}
