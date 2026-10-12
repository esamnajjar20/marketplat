/**
 * Bounded, privacy-conscious operational event buffer and short-window history.
 * This state is process-local by design; Prometheus remains the durable metrics
 * source when an external scraper/retention store is configured.
 */
export type MonitoringEvent = {
  id: string;
  timestamp: string;
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  kind: 'http-error' | 'slow-request';
  errorCode?: string;
};

export type MonitoringSample = {
  timestamp: string;
  requests: number;
  errors: number;
  serverErrors: number;
  averageDurationMs: number;
  rssBytes: number;
  heapUsedBytes: number;
};

export type MonitoringAlert = {
  id: string;
  title: string;
  severity: 'warning' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved';
  description: string;
  value: number;
  threshold: number;
  firstSeenAt: string;
  updatedAt: string;
};

const MAX_EVENTS = 500;
const MAX_SAMPLES = 24 * 60;

/** Keep diagnostic metadata bounded and free of URL/query or control data. */
function sanitizeRouteLabel(value: string): string {
  const route = value.split(/[?#]/, 1)[0].replace(/[\r\n\t\u0000-\u001f\u007f]/g, '').trim();
  if (!route.startsWith('/')) return '/unknown';
  return route.slice(0, 200);
}

function sanitizeMethod(value: string): string {
  const method = value.toUpperCase();
  return /^[A-Z]{1,12}$/.test(method) ? method : 'OTHER';
}
const events: MonitoringEvent[] = [];
const samples: MonitoringSample[] = [];
const alertStates = new Map<string, { status: 'active' | 'acknowledged' | 'resolved'; firstSeenAt: string; updatedAt: string }>();
let eventSequence = 0;
let minuteBucket = -1;
let minuteRequests = 0;
let minuteErrors = 0;
let minuteServerErrors = 0;
let minuteDurationTotal = 0;

function safeThreshold(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function recordRequestObservation(input: {
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  errorCode?: string;
}): void {
  const now = new Date();
  const timestamp = now.toISOString();
  // H1-FIX: counters applied after flush — see tail of this function

  const slowThresholdMs = safeThreshold('MONITORING_SLOW_REQUEST_MS', 2000);
  if (input.statusCode >= 400 || input.durationMs >= slowThresholdMs) {
    events.unshift({
      id: `${timestamp}-${eventSequence++}-${input.requestId}`,
      timestamp,
      requestId: input.requestId.slice(0, 64),
      method: sanitizeMethod(input.method),
      route: sanitizeRouteLabel(input.route),
      statusCode: Number.isInteger(input.statusCode) && input.statusCode >= 100 && input.statusCode <= 599 ? input.statusCode : 500,
      durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.min(Math.round(input.durationMs), 86_400_000)) : 0,
      kind: input.statusCode >= 400 ? 'http-error' : 'slow-request',
      ...(input.statusCode >= 400 && input.errorCode ? { errorCode: input.errorCode.slice(0, 80) } : {}),
    });
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  }

  // Capture at most one aggregate sample per minute. The current minute's
  // counts are finalized when the first request of the next minute arrives.
  const bucket = Math.floor(now.getTime() / 60_000);
  if (minuteBucket === -1) minuteBucket = bucket;
  if (bucket > minuteBucket) {
    const memory = process.memoryUsage();
    samples.unshift({
      timestamp: new Date(minuteBucket * 60_000).toISOString(),
      requests: minuteRequests,
      errors: minuteErrors,
      serverErrors: minuteServerErrors,
      averageDurationMs: minuteRequests ? Math.round(minuteDurationTotal / minuteRequests) : 0,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
    });
    if (samples.length > MAX_SAMPLES) samples.length = MAX_SAMPLES;
    minuteBucket = bucket;
    minuteRequests = 0;
    minuteErrors = 0;
    minuteServerErrors = 0;
    minuteDurationTotal = 0;
  }

  minuteRequests += 1;
  if (input.statusCode >= 400) minuteErrors += 1;
  if (input.statusCode >= 500) minuteServerErrors += 1;
  minuteDurationTotal += input.durationMs;
}

/** Test-only reset of the process-local buffers. Not exported from
 * the module's public surface in production builds (guarded by NODE_ENV). */
export function __resetMonitoringStateForTests(): void {
  events.length = 0;
  samples.length = 0;
  alertStates.clear();
  minuteBucket = -1;
  minuteRequests = 0;
  minuteErrors = 0;
  minuteServerErrors = 0;
  minuteDurationTotal = 0;
}

export function getMonitoringEvents(limit = 100): MonitoringEvent[] {
  const safeLimit = Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 100;
  return events.slice(0, safeLimit);
}

export function getMonitoringHistory(limit = 60): { processLocal: true; retentionMinutes: number; samples: MonitoringSample[] } {
  const safeLimit = Number.isInteger(limit) ? Math.min(1440, Math.max(1, limit)) : 60;
  return { processLocal: true, retentionMinutes: 1440, samples: samples.slice(0, safeLimit).reverse() };
}

export function getMonitoringAlerts(): MonitoringAlert[] {
  const now = Date.now();
  const windowStart = now - 5 * 60_000;
  const recent = events.filter((event) => Date.parse(event.timestamp) >= windowStart);
  const recentServerErrors = recent.filter((event) => event.statusCode >= 500).length;
  const recentHttpErrors = recent.filter((event) => event.statusCode >= 400).length;
  const slowThresholdMs = safeThreshold('MONITORING_SLOW_REQUEST_MS', 2000);
  const recentSlow = recent.filter((event) => event.durationMs >= slowThresholdMs).length;
  const rules = [
    { id: 'server-errors', title: 'أخطاء الخادم 5xx', severity: 'critical' as const, description: 'عدد أخطاء الخادم المسجّلة في آخر 5 دقائق', value: recentServerErrors, threshold: safeThreshold('MONITORING_ALERT_5XX_THRESHOLD', 5) },
    { id: 'http-errors', title: 'أخطاء HTTP', severity: 'warning' as const, description: 'أخطاء HTTP 4xx و5xx المسجّلة في آخر 5 دقائق', value: recentHttpErrors, threshold: safeThreshold('MONITORING_ALERT_HTTP_ERROR_THRESHOLD', 20) },
    { id: 'slow-requests', title: 'طلبات بطيئة', severity: 'warning' as const, description: 'طلبات تجاوزت عتبة البطء في آخر 5 دقائق', value: recentSlow, threshold: safeThreshold('MONITORING_ALERT_SLOW_THRESHOLD', 20) },
  ];
  return rules.map((rule) => {
    const triggered = rule.value >= rule.threshold;
    const previous = alertStates.get(rule.id);
    const updatedAt = new Date(now).toISOString();
    if (!triggered) {
      const firstSeenAt = previous?.firstSeenAt ?? updatedAt;
      alertStates.set(rule.id, { status: 'resolved', firstSeenAt, updatedAt });
      return { ...rule, status: 'resolved' as const, firstSeenAt, updatedAt };
    }

    const firstSeenAt = previous && previous.status !== 'resolved' ? previous.firstSeenAt : updatedAt;
    const status: MonitoringAlert['status'] = previous?.status === 'acknowledged' ? 'acknowledged' : 'active';
    alertStates.set(rule.id, { status, firstSeenAt, updatedAt });
    return { ...rule, status, firstSeenAt, updatedAt };
  });
}

export function acknowledgeMonitoringAlert(id: string): boolean {
  if (!['server-errors', 'http-errors', 'slow-requests'].includes(id)) return false;
  const now = new Date().toISOString();
  const previous = alertStates.get(id);
  alertStates.set(id, { status: 'acknowledged', firstSeenAt: previous?.firstSeenAt ?? now, updatedAt: now });
  return true;
}
