/**
 * __tests__/unit/hooks/useResettableDialog.test.tsx
 *
 * Previously uncovered despite backing three edit dialogs
 * (EditCategoryButton, EditProductCategoryButton,
 * EditServiceCategoryButton). The whole point of this hook per its own
 * header comment is that a cancelled edit doesn't reopen with stale
 * draft values — that guarantee only holds if `reset()` runs *before*
 * the dialog opens, not after, so ordering is the one thing this test
 * has to pin down.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResettableDialog } from '@/hooks/useResettableDialog';

describe('useResettableDialog', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useResettableDialog(vi.fn()));
    expect(result.current.open).toBe(false);
  });

  it('does not call reset just from rendering', () => {
    const reset = vi.fn();
    renderHook(() => useResettableDialog(reset));
    expect(reset).not.toHaveBeenCalled();
  });

  it('handleOpen calls reset and opens the dialog', () => {
    const reset = vi.fn();
    const { result } = renderHook(() => useResettableDialog(reset));

    act(() => {
      result.current.handleOpen();
    });

    expect(reset).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(true);
  });

  it('calls reset before flipping open to true, not after', () => {
    const callOrder: string[] = [];
    const reset = vi.fn(() => callOrder.push('reset'));
    const { result } = renderHook(() => useResettableDialog(reset));

    act(() => {
      result.current.handleOpen();
    });
    callOrder.push('open=' + result.current.open);

    expect(callOrder).toEqual(['reset', 'open=true']);
  });

  it('setOpen(false) closes the dialog without calling reset', () => {
    const reset = vi.fn();
    const { result } = renderHook(() => useResettableDialog(reset));

    act(() => {
      result.current.handleOpen();
    });
    reset.mockClear();

    act(() => {
      result.current.setOpen(false);
    });

    expect(result.current.open).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });

  it('calls reset again on every handleOpen (re-seeds from latest source each time)', () => {
    const reset = vi.fn();
    const { result } = renderHook(() => useResettableDialog(reset));

    act(() => {
      result.current.handleOpen();
    });
    act(() => {
      result.current.setOpen(false);
    });
    act(() => {
      result.current.handleOpen();
    });

    expect(reset).toHaveBeenCalledTimes(2);
  });
});
