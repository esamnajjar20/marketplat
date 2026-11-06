import { describe, expect, it } from 'vitest';
import { isQueryCancellation, throwIfQueryCancelled } from '@/lib/queryCancellation';

describe('query cancellation helpers', () => {
  it('recognizes an aborted query signal even when transport error is generic', () => {
    const controller = new AbortController();
    controller.abort();

    expect(isQueryCancellation(new Error('request stopped'), controller.signal)).toBe(true);
  });

  it('recognizes Axios cancellation codes and names', () => {
    expect(isQueryCancellation({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isQueryCancellation({ name: 'CanceledError' })).toBe(true);
    expect(isQueryCancellation({ __CANCEL__: true })).toBe(true);
  });

  it('recognizes browser AbortError without classifying ordinary network errors as cancellation', () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';

    expect(isQueryCancellation(aborted)).toBe(true);
    expect(isQueryCancellation(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('rethrows the original cancellation so offline fallbacks cannot swallow it', () => {
    const controller = new AbortController();
    controller.abort();
    const original = new Error('cancelled');

    expect(() => throwIfQueryCancelled(original, controller.signal)).toThrow(original);
  });
});
