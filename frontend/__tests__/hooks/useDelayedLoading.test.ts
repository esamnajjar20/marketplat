import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDelayedLoading } from '@/hooks/ui/useDelayedLoading';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDelayedLoading', () => {
  it('never shows for loads shorter than the delay', () => {
    const { result, rerender } = renderHook(({ l }) => useDelayedLoading(l), { initialProps: { l: true } });
    act(() => { vi.advanceTimersByTime(150); });
    rerender({ l: false });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(false);
  });

  it('shows after the delay when loading persists', () => {
    const { result } = renderHook(() => useDelayedLoading(true));
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(true);
  });

  it('stays visible for minDuration once shown', () => {
    const { result, rerender } = renderHook(({ l }) => useDelayedLoading(l), { initialProps: { l: true } });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ l: false });
    act(() => { vi.advanceTimersByTime(399); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(false);
  });

  it('stays visible when loading restarts before it hides', () => {
    const { result, rerender } = renderHook(({ l }) => useDelayedLoading(l), { initialProps: { l: true } });
    act(() => { vi.advanceTimersByTime(500); });
    rerender({ l: false });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ l: true });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(true);
  });
});
