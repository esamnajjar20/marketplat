/**
 * __tests__/unit/hooks/useDataSaver.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDataSaver } from '@/hooks/useDataSaver';
import { hydrateDataSaver, isDataSaverEnabled, setDataSaverEnabled } from '@/lib/dataSaver';
import { useDataSaver as useDataSaverFlag } from '@/lib/useDataSaver';

vi.mock('@/lib/dataSaver', () => ({
  hydrateDataSaver: vi.fn(),
  isDataSaverEnabled: vi.fn(() => false),
  setDataSaverEnabled: vi.fn(),
}));

describe('useDataSaver', () => {
  beforeEach(() => {
    vi.mocked(isDataSaverEnabled).mockReturnValue(false);
    vi.mocked(setDataSaverEnabled).mockReset();
    vi.mocked(hydrateDataSaver).mockReset();
  });

  it('starts with enabled=false and syncs from isDataSaverEnabled on mount', async () => {
    vi.mocked(isDataSaverEnabled).mockReturnValue(true);
    const { result } = renderHook(() => useDataSaver());

    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it('setEnabled updates local state and persists via setDataSaverEnabled', async () => {
    const { result } = renderHook(() => useDataSaver());

    await act(async () => {
      result.current.setEnabled(true);
    });

    expect(setDataSaverEnabled).toHaveBeenCalledWith(true);
    expect(result.current.enabled).toBe(true);
  });

  it('reacts to custom marketplat:data-saver events', async () => {
    const { result } = renderHook(() => useDataSaver());

    await act(async () => {
      window.dispatchEvent(new CustomEvent('marketplat:data-saver', { detail: true }));
    });

    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it('hydrates the data-saver flag on mount (the toggle used to read false until something else hydrated it)', async () => {
    renderHook(() => useDataSaver());

    await waitFor(() => expect(hydrateDataSaver).toHaveBeenCalled());
  });

  it('re-syncs when another tab changes the stored value (storage event)', async () => {
    const { result } = renderHook(() => useDataSaver());
    expect(result.current.enabled).toBe(false);

    vi.mocked(isDataSaverEnabled).mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'marketplat:data-saver', newValue: '1' }));
    });

    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it('the boolean variant shares the same subscription', async () => {
    vi.mocked(isDataSaverEnabled).mockReturnValue(true);
    const { result } = renderHook(() => useDataSaverFlag());

    await waitFor(() => expect(result.current).toBe(true));
  });
});
