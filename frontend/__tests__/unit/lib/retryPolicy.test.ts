import { describe, expect, it } from 'vitest';
import {
  getRetryDelayMs,
  isRetryableHttpStatus,
  isRetryableParsedError,
  isSafeHttpMethod,
  parseRetryAfterMs,
} from '@/lib/retryPolicy';

describe('retryPolicy', () => {
  it('only treats safe HTTP methods as automatically retryable at the client layer', () => {
    expect(isSafeHttpMethod('GET')).toBe(true);
    expect(isSafeHttpMethod('HEAD')).toBe(true);
    expect(isSafeHttpMethod('OPTIONS')).toBe(true);
    expect(isSafeHttpMethod('POST')).toBe(false);
    expect(isSafeHttpMethod('PATCH')).toBe(false);
  });

  it('recognizes transient HTTP statuses including rate limiting', () => {
    for (const status of [408, 425, 429, 502, 503, 504]) {
      expect(isRetryableHttpStatus(status)).toBe(true);
    }
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(409)).toBe(false);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfterMs('3', 0)).toBe(3000);
    expect(parseRetryAfterMs('Thu, 01 Jan 1970 00:00:05 GMT', 0)).toBe(5000);
    expect(parseRetryAfterMs('not-a-date')).toBeUndefined();
  });

  it('uses Retry-After when available and caps it', () => {
    expect(getRetryDelayMs(0, 3000, 0.5)).toBe(3000);
    expect(getRetryDelayMs(0, 60_000, 0.5)).toBe(15_000);
  });

  it('uses bounded exponential jitter when Retry-After is absent', () => {
    const first = getRetryDelayMs(0, undefined, 0);
    const second = getRetryDelayMs(2, undefined, 1);
    expect(first).toBeGreaterThanOrEqual(562);
    expect(second).toBeLessThanOrEqual(6000);
  });

  it('treats status 0 and transient HTTP statuses as retryable parsed errors', () => {
    expect(isRetryableParsedError({ statusCode: 0 })).toBe(true);
    expect(isRetryableParsedError({ statusCode: 429 })).toBe(true);
    expect(isRetryableParsedError({ statusCode: 400 })).toBe(false);
  });
});
