// Minimal structured logger: one JSON object per line, on stderr by default.

export type Level = 'debug' | 'info' | 'warn' | 'error';
export type Fields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
}

export interface LoggerOptions {
  level?: Level;
  write?: (line: string) => void;
  now?: () => Date;
}

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function parseLevel(value: string | undefined): Level {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : 'info';
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const min = ORDER[options.level ?? 'info'];
  const write = options.write ?? ((line: string) => process.stderr.write(`${line}\n`));
  const now = options.now ?? (() => new Date());
  const at = (level: Level) => (msg: string, fields: Fields = {}) => {
    if (ORDER[level] < min) return;
    write(JSON.stringify({ time: now().toISOString(), level, msg, ...fields }));
  };
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}

export const silentLogger: Logger = createLogger({ write: () => {} });
