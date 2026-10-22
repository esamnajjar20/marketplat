import { describe, it, expect } from 'vitest';
import { parseSwUiNotice } from '@/lib/offlineShellStatus';

describe('parseSwUiNotice', () => {
  it('accepts well-formed shell results', () => {
    expect(parseSwUiNotice({ type: 'SHELL_CACHE_RESULT', pathname: '/a', status: 'pending' }))
      .toEqual({ type: 'SHELL_CACHE_RESULT', pathname: '/a', status: 'pending' });
  });
  it('accepts stale-api notices', () => {
    expect(parseSwUiNotice({ type: 'STALE_API_SERVED', cachedAt: 123 }))
      .toEqual({ type: 'STALE_API_SERVED', cachedAt: 123 });
  });
  it('rejects unknown/malformed payloads', () => {
    expect(parseSwUiNotice(null)).toBeNull();
    expect(parseSwUiNotice({ type: 'SHELL_CACHE_RESULT', pathname: '/a', status: 'weird' })).toBeNull();
    expect(parseSwUiNotice({ type: 'STALE_API_SERVED', cachedAt: 'x' })).toBeNull();
    expect(parseSwUiNotice({ type: 'QUEUE_DRAIN_STARTED' })).toBeNull();
  });
});
