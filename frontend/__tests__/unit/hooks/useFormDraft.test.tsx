/**
 * __tests__/unit/hooks/useFormDraft.test.tsx
 *
 * Previously uncovered despite being the autosave behind AdForm and
 * ProductForm (FIX P1-11) — losing an in-progress ad/product listing
 * (title, up to 5000-char description, images) to an accidental back
 * gesture or dropped connection is exactly the kind of loss this hook
 * exists to prevent, so a silent regression here is a real user-facing
 * data-loss bug, not just a nice-to-have breaking quietly.
 *
 * Coverage:
 *  - Does NOT persist on the very first render (would otherwise
 *    immediately re-save a just-restored draft, which is at best
 *    redundant and at worst overwrites a freshly-cleared draft with a
 *    default-empty forms if `values` briefly resets on mount)
 *  - Persists to localStorage under `draft:{key}` after debounceMs,
 *    only once inputs settle (debounce collapses rapid keystrokes into
 *    a single write instead of one per keystroke)
 *  - Rapid successive changes reset the debounce timer rather than
 *    scheduling multiple writes
 *  - enabled: false suppresses persistence entirely (e.g. edit forms
 *    that only want autosave once a real edit has been made)
 *  - A quota/private-browsing localStorage.setItem throw is swallowed,
 *    not propagated to the caller
 *  - clearDraft() removes the stored key and swallows storage errors
 *  - Unmounting before the debounce fires cancels the pending write
 *  - readFormDraft returns the parsed draft, null when absent, null on
 *    malformed JSON, and null under SSR (no window)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFormDraft', () => {
  it('does not write to localStorage on the initial render', () => {
    renderHook(() => useFormDraft('ad:new', { title: 'مسودة أولية' }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(window.localStorage.getItem('draft:ad:new')).toBeNull();
  });

  it('persists the values under draft:{key} after debounceMs once values change', () => {
    const { rerender } = renderHook(
      (values: { title: string }) => useFormDraft('ad:new', values, { debounceMs: 800 }),
      { initialProps: { title: 'عنوان أولي' } },
    );

    rerender({ title: 'عنوان معدّل' });

    act(() => {
      vi.advanceTimersByTime(799);
    });
    expect(window.localStorage.getItem('draft:ad:new')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(window.localStorage.getItem('draft:ad:new')).toBe(
      JSON.stringify({ title: 'عنوان معدّل' }),
    );
  });

  it('collapses rapid successive changes into a single debounced write', () => {
    const { rerender } = renderHook(
      (values: { title: string }) => useFormDraft('ad:new', values, { debounceMs: 800 }),
      { initialProps: { title: 'أ' } },
    );

    rerender({ title: 'أب' });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    rerender({ title: 'أبج' });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Total elapsed since the last change is only 400ms — should not
    // have written yet if the timer correctly reset on each change.
    expect(window.localStorage.getItem('draft:ad:new')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(window.localStorage.getItem('draft:ad:new')).toBe(JSON.stringify({ title: 'أبج' }));
  });

  it('does not persist anything when enabled is false', () => {
    const { rerender } = renderHook(
      (values: { title: string }) =>
        useFormDraft('ad:edit:1', values, { enabled: false, debounceMs: 100 }),
      { initialProps: { title: 'أ' } },
    );

    rerender({ title: 'ب' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(window.localStorage.getItem('draft:ad:edit:1')).toBeNull();
  });

  it('swallows a localStorage.setItem failure (e.g. private browsing / quota exceeded)', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

    const { rerender } = renderHook(
      (values: { title: string }) => useFormDraft('ad:new', values, { debounceMs: 100 }),
      { initialProps: { title: 'أ' } },
    );
    rerender({ title: 'ب' });

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(200);
      });
    }).not.toThrow();

    setItemSpy.mockRestore();
  });

  it('clearDraft removes the stored key', () => {
    window.localStorage.setItem('draft:ad:new', JSON.stringify({ title: 'قديم' }));

    const { result } = renderHook(() => useFormDraft('ad:new', { title: 'قديم' }));

    act(() => {
      result.current.clearDraft();
    });

    expect(window.localStorage.getItem('draft:ad:new')).toBeNull();
  });

  it('clearDraft swallows a localStorage.removeItem failure', () => {
    const removeItemSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new DOMException('not available');
      });

    const { result } = renderHook(() => useFormDraft('ad:new', { title: 'أ' }));

    expect(() => result.current.clearDraft()).not.toThrow();

    removeItemSpy.mockRestore();
  });

  it('cancels the pending write if the component unmounts before debounceMs elapses', () => {
    const { rerender, unmount } = renderHook(
      (values: { title: string }) => useFormDraft('ad:new', values, { debounceMs: 800 }),
      { initialProps: { title: 'أ' } },
    );

    rerender({ title: 'ب' });
    unmount();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(window.localStorage.getItem('draft:ad:new')).toBeNull();
  });

  it('scopes drafts by key so two different keys never collide', () => {
    const { rerender: rerenderNew } = renderHook(
      (values: { title: string }) => useFormDraft('ad:new', values, { debounceMs: 100 }),
      { initialProps: { title: 'أ' } },
    );
    const { rerender: rerenderEdit } = renderHook(
      (values: { title: string }) => useFormDraft('ad:edit:1', values, { debounceMs: 100 }),
      { initialProps: { title: 'ج' } },
    );

    rerenderNew({ title: 'ب' });
    rerenderEdit({ title: 'د' });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(window.localStorage.getItem('draft:ad:new')).toBe(JSON.stringify({ title: 'ب' }));
    expect(window.localStorage.getItem('draft:ad:edit:1')).toBe(JSON.stringify({ title: 'د' }));
  });
});

describe('readFormDraft', () => {
  it('returns null when no draft is stored for the key', () => {
    expect(readFormDraft('ad:new')).toBeNull();
  });

  it('returns the parsed draft when one exists', () => {
    window.localStorage.setItem('draft:ad:new', JSON.stringify({ title: 'محفوظ' }));
    expect(readFormDraft<{ title: string }>('ad:new')).toEqual({ title: 'محفوظ' });
  });

  it('returns null (not a throw) when the stored value is malformed JSON', () => {
    window.localStorage.setItem('draft:ad:new', '{not valid json');
    expect(readFormDraft('ad:new')).toBeNull();
  });

  it('returns null under SSR when window is undefined', () => {
    const original = globalThis.window;
    // @ts-expect-error simulating SSR
    delete globalThis.window;

    expect(readFormDraft('ad:new')).toBeNull();

    globalThis.window = original;
  });
});
