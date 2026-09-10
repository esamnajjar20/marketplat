/**
 * __tests__/unit/hooks/useDataSaver.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDataSaver } from '@/hooks/useDataSaver';
import { isDataSaverEnabled, setDataSaverEnabled } from '@/lib/dataSaver';

vi.mock('@/lib/dataSaver', () => ({
  isDataSaverEnabled: vi.fn(() => false),
  setDataSaverEnabled: vi.fn(),
}));

describe('useDataSaver', () => {
  beforeEach(() => {
    vi.mocked(isDataSaverEnabled).mockReturnValue(false);
    vi.mocked(setDataSaverEnabled).mockReset();
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
});
