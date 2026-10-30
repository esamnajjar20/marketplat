/**
 * Production-safe logger. Console output is development-only by default.
 * A release may explicitly opt in to sanitized warn/error output, but never debug/info.
 */
const SENSITIVE_KEY = /password|passwd|token|authorization|cookie|secret|api[_-]?key|csrf|bearer|session/i;
const KEY_VALUE_SECRET = /(\b(?:access[_-]?token|refresh[_-]?token|token|authorization|set-cookie|cookie|csrf(?:[_-]?token)?|password|passwd|secret|api[_-]?key)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&#]+)/gi;
const BEARER_SECRET = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const QUERY_SECRET = /([?&](?:access[_-]?token|refresh[_-]?token|token|csrf(?:[_-]?token)?|api[_-]?key|key)=)[^&#\s]*/gi;
function productionLogsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_PRODUCTION_LOGS === 'true';
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function redactString(value: string): string {
  const redacted = value
    .replace(KEY_VALUE_SECRET, '$1[redacted]')
    .replace(BEARER_SECRET, 'Bearer [redacted]')
    .replace(QUERY_SECRET, '$1[redacted]');
  return redacted.length > 200 ? `${redacted.slice(0, 80)}…(${redacted.length} chars)` : redacted;
}

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(child);
  }
  return out;
}

function isDevelopment(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function emit(level: LogLevel, tag: string, message: string, meta?: unknown): void {
  const development = isDevelopment();
  if (!development && (!productionLogsEnabled() || (level !== 'warn' && level !== 'error'))) return;

  const prefix = `[MarketPlat:${tag}]`;
  const args = meta === undefined
    ? [prefix, redactString(message)]
    : [prefix, redactString(message), redact(meta)];
  switch (level) {
    case 'error':
      console.error(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'debug':
    case 'info':
      if (development) console.log(...args);
      break;
  }
}

export const logger = {
  debug: (tag: string, message: string, meta?: unknown) => emit('debug', tag, message, meta),
  info: (tag: string, message: string, meta?: unknown) => emit('info', tag, message, meta),
  warn: (tag: string, message: string, meta?: unknown) => emit('warn', tag, message, meta),
  error: (tag: string, message: string, meta?: unknown) => emit('error', tag, message, meta),
};
