import { classifyError, isNetworkError, isRetryableError, isRetryableStatus } from '@/lib/errorPolicy';

describe('unified error policy', () => {
  it('uses one retry policy for transient failures', () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableError({ statusCode: 0, code: 'NETWORK_ERROR' })).toBe(true);
  });

  it('classifies presentation states consistently', () => {
    expect(classifyError({ statusCode: 401 })).toBe('unauthorized');
    expect(classifyError({ statusCode: 403 })).toBe('forbidden');
    expect(classifyError({ statusCode: 404 })).toBe('not-found');
    expect(classifyError({ statusCode: 409 })).toBe('conflict');
    expect(classifyError({ statusCode: 429 })).toBe('rate-limit');
    expect(classifyError({ statusCode: 503 })).toBe('service-unavailable');
    expect(classifyError({ statusCode: 500 })).toBe('server');
    expect(classifyError({ statusCode: 0, code: 'NETWORK_ERROR' })).toBe('network');
  });

  it('does not mistake a real HTTP response for a network error', () => {
    expect(isNetworkError({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' })).toBe(false);
  });
});
