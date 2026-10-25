import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight';

describe('useVisualViewportHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns null when visualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined);
    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBeNull();
  });

  it('tracks visualViewport height and updates on resize', () => {
    const listeners: Record<string, Array<(event?: Event) => void>> = {};
    const vv = {
      height: 600,
      addEventListener: (ev: string, fn: (event?: Event) => void) => {
        (listeners[ev] ??= []).push(fn);
      },
      removeEventListener: (ev: string, fn: (event?: Event) => void) => {
        listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn);
      },
    };
    vi.stubGlobal('visualViewport', vv);

    const { result, unmount } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBe(600);

    act(() => {
      (vv as any).height = 320;
      (listeners.resize ?? []).forEach((fn) => fn());
    });
    expect(result.current).toBe(320);
    unmount();
  });
});
