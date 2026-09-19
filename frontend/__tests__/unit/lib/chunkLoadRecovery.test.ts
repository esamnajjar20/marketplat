import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleChunkLoadError, isChunkLoadError } from '@/lib/errorReporter';

describe('handleChunkLoadError', () => {
  const chunkError = Object.assign(new Error('Loading chunk 8601 failed.'), {
    name: 'ChunkLoadError',
  });
  let onLineSpy: ReturnType<typeof vi.spyOn>;
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    onLineSpy = vi.spyOn(navigator, 'onLine', 'get');
  });
  afterEach(() => onLineSpy.mockRestore());

  it('detects chunk errors', () => {
    expect(isChunkLoadError(chunkError)).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
  });

  it('reloads once when online', () => {
    onLineSpy.mockReturnValue(true);
    expect(handleChunkLoadError(chunkError)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when offline', () => {
    onLineSpy.mockReturnValue(false);
    expect(handleChunkLoadError(chunkError)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
