import {
  __resetMonitoringStateForTests,
  acknowledgeMonitoringAlert,
  getMonitoringAlerts,
  getMonitoringEvents,
  getMonitoringHistory,
  recordRequestObservation,
} from '../../src/shared/utils/monitoringState';

describe('monitoringState', () => {
  beforeEach(() => {
    __resetMonitoringStateForTests();
  });

  afterEach(() => {
    delete process.env.MONITORING_ALERT_5XX_THRESHOLD;
    delete process.env.MONITORING_ALERT_HTTP_ERROR_THRESHOLD;
    delete process.env.MONITORING_ALERT_SLOW_THRESHOLD;
    delete process.env.MONITORING_SLOW_REQUEST_MS;
  });

  it('stores only bounded, sanitized request metadata for errors and slow requests', () => {
    recordRequestObservation({
      requestId: 'safe-request-id',
      method: 'GET',
      route: '/api/v1/items/:id',
      statusCode: 500,
      durationMs: 2450,
      errorCode: 'INTERNAL_ERROR',
    });
    const event = getMonitoringEvents(1)[0];
    expect(event).toMatchObject({
      requestId: 'safe-request-id',
      route: '/api/v1/items/:id',
      statusCode: 500,
      kind: 'http-error',
      errorCode: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(event)).not.toContain('authorization');
    expect(JSON.stringify(event)).not.toContain('payload');
  });

  it('sanitizes route labels and bounds untrusted request metadata', () => {
    recordRequestObservation({
      requestId: 'request-with-sensitive-url',
      method: 'get\nFORGED',
      route: '/api/v1/users/:id?email=private@example.test\nforged=true',
      statusCode: 999,
      durationMs: Number.POSITIVE_INFINITY,
    });
    const event = getMonitoringEvents(1)[0];
    expect(event.route).toBe('/api/v1/users/:id');
    expect(event.route).not.toContain('email=');
    expect(event.method).toBe('OTHER');
    expect(event.statusCode).toBe(500);
    expect(event.durationMs).toBe(0);
  });

  it('rejects unknown alert identifiers without mutating alert state', () => {
    expect(acknowledgeMonitoringAlert('../server-errors')).toBe(false);
    expect(acknowledgeMonitoringAlert('')).toBe(false);
  });

  it('derives alert thresholds and supports acknowledgement', () => {
    process.env.MONITORING_ALERT_5XX_THRESHOLD = '1';
    recordRequestObservation({
      requestId: 'alert-test-request',
      method: 'POST',
      route: '/api/v1/test',
      statusCode: 503,
      durationMs: 10,
      errorCode: 'SERVICE_UNAVAILABLE',
    });
    const alert = getMonitoringAlerts().find((item) => item.id === 'server-errors');
    expect(alert?.status).toBe('active');
    expect(acknowledgeMonitoringAlert('server-errors')).toBe(true);
    expect(getMonitoringAlerts().find((item) => item.id === 'server-errors')?.status).toBe('acknowledged');
    expect(acknowledgeMonitoringAlert('not-a-rule')).toBe(false);
  });

  it('returns bounded process-local history and validates limits', () => {
    const history = getMonitoringHistory(10);
    expect(history.processLocal).toBe(true);
    expect(history.retentionMinutes).toBe(1440);
    expect(history.samples.length).toBeLessThanOrEqual(10);
  });
});
