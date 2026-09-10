/**
 * __tests__/unit/hooks/useAsyncAction.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncAction } from '@/hooks/useAsyncAction';

describe('useAsyncAction', () => {
  it('runs action and returns result', async () => {
    const action = vi.fn(async (n: number) => n * 2);
    const { result } = renderHook(() => useAsyncAction(action));

    let out: number | undefined;
    await act(async () => {
      out = await result.current.run(3);
    });
    expect(out).toBe(6);
    expect(action).toHaveBeenCalledWith(3);
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error and rethrows on failure', async () => {
    const action = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useAsyncAction(action));

    await act(async () => {
      await expect(result.current.run()).rejects.toThrow('boom');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isPending).toBe(false);
  });

  it('ignores concurrent runs while pending', async () => {
    let resolve!: (v: string) => void;
    const action = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );
    const { result } = renderHook(() => useAsyncAction(action));

    let p1: Promise<string | undefined>;
    act(() => {
      p1 = result.current.run();
    });
    expect(result.current.isPending).toBe(true);

    let second: string | undefined;
    await act(async () => {
      second = await result.current.run();
    });
    expect(second).toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve('ok');
      await p1!;
    });
    expect(result.current.isPending).toBe(false);
  });

  it('reset clears error', async () => {
    const action = vi.fn(async () => {
      throw new Error('x');
    });
    const { result } = renderHook(() => useAsyncAction(action));
    await act(async () => {
      await expect(result.current.run()).rejects.toThrow();
    });
    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
  });
});
