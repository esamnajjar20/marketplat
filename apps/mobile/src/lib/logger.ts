/**
 * مسجّل آمن للإنتاج — لا يطبع في release إلا عند تفعيل صريح،
 * ولا يسجّل كلمات مرور / توكنات.
 */
const SENSITIVE = /password|passwd|token|authorization|cookie|secret|api[_-]?key|csrf|bearer|session/i;

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > 200) return `${value.slice(0, 80)}…(${value.length} chars)`;
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v);
  }
  return out;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function emit(level: LogLevel, tag: string, message: string, meta?: unknown): void {
  if (!__DEV__ && level === 'debug') return;
  const prefix = `[MarketPlat:${tag}]`;
  const args = meta === undefined ? [prefix, message] : [prefix, message, redact(meta)];
  switch (level) {
    case 'error':
      console.error(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    default:
      if (__DEV__) console.log(...args);
  }
}

export const logger = {
  debug: (tag: string, message: string, meta?: unknown) => emit('debug', tag, message, meta),
  info: (tag: string, message: string, meta?: unknown) => emit('info', tag, message, meta),
  warn: (tag: string, message: string, meta?: unknown) => emit('warn', tag, message, meta),
  error: (tag: string, message: string, meta?: unknown) => emit('error', tag, message, meta),
};
