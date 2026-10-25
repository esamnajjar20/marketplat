import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useClampedPage } from '@/hooks/useClampedPage';

describe('useClampedPage', () => {
  it('moves back to the last page when the list shrinks below the current page', () => {
    const setPage = vi.fn();
    renderHook(() => useClampedPage(3, 2, setPage));
    expect(setPage).toHaveBeenCalledWith(2);
  });

  it('falls back to page 1 when the list becomes empty (totalPages = 0)', () => {
    const setPage = vi.fn();
    renderHook(() => useClampedPage(2, 0, setPage));
    expect(setPage).toHaveBeenCalledWith(1);
  });

  it('does nothing while metadata is unknown or the page is in range', () => {
    const setPage = vi.fn();
    renderHook(() => useClampedPage(2, undefined, setPage));
    renderHook(() => useClampedPage(2, 5, setPage));
    expect(setPage).not.toHaveBeenCalled();
  });
});
