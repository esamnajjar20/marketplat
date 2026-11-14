import { describe, it, expect, vi, afterEach } from 'vitest';
import { openExternal } from '@/lib/openExternal';

describe('openExternal', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens a new context with noopener,noreferrer', () => {
    const fakeWindow = {} as Window;
    const spy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    expect(openExternal('https://example.com')).toBe(fakeWindow);
    expect(spy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });
  it('returns null when the popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openExternal('https://example.com')).toBeNull();
  });
  it('does nothing for an empty url', () => {
    const spy = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openExternal('')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
