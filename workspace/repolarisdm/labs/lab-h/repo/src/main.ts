// Entry point: node src/main.ts <flags.json>
// Env: PORT (default 8080), LOG_LEVEL, TOGGLEBOX_ADMIN_TOKEN, TOGGLEBOX_CONFIG.
// Send SIGHUP to reload the file. A bad file is logged and the old config stays.
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { createLogger, parseLevel } from './log.ts';
import type { Logger } from './log.ts';
import { createServer } from './server.ts';
import { FlagStore } from './store.ts';

async function loadFile(store: FlagStore, path: string, logger: Logger): Promise<boolean> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    logger.error('cannot read config', { path, error: String(err) });
    return false;
  }
  const result = store.load(raw);
  if (!result.ok) {
    logger.error('config rejected', { path, errors: result.errors });
    return false;
  }
  logger.info('config loaded', { path, version: result.version, changed: result.changed });
  return true;
}

const configPath = process.argv[2] ?? process.env.TOGGLEBOX_CONFIG;
if (!configPath) {
  console.error('usage: node src/main.ts <flags.json>');
  process.exit(2);
}

const logger = createLogger({ level: parseLevel(process.env.LOG_LEVEL) });
const store = new FlagStore({ logger });
if (!(await loadFile(store, configPath, logger))) process.exit(1);

const server = createServer({ store, logger, adminToken: process.env.TOGGLEBOX_ADMIN_TOKEN });
server.listen(Number(process.env.PORT ?? 8080), () => {
  logger.info('listening', { port: (server.address() as AddressInfo).port });
});

process.on('SIGHUP', () => {
  void loadFile(store, configPath, logger);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
