import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    const listeners: Record<string, Function[]> = {};
    const vv = {
      height: 600,
      addEventListener: (ev: string, fn: Function) => {
        (listeners[ev] ??= []).push(fn);
      },
      removeEventListener: (ev: string, fn: Function) => {
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
