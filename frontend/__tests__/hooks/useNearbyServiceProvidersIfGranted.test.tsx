/**
 * __tests__/hooks/useNearbyServiceProvidersIfGranted.test.tsx
 *
 * Plan §6/§7: this hook must never trigger the browser's geolocation
 * permission popup. Coverage targets:
 *  - Permissions API unsupported → available=false, no getCurrentPosition call
 *  - Permission state 'prompt' → available=false, getCurrentPosition never called
 *  - Permission state 'denied' → available=false, getCurrentPosition never called
 *  - Permission state 'granted' → getCurrentPosition called (resolves silently,
 *    no popup, since permission already exists), feeds coords into
 *    useNearbyServiceProviders, available=true once position resolves
 *  - Permission 'granted' but getCurrentPosition itself fails → available=false
 *  - permissions.query() rejecting → available=false, no throw
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useNearbyServiceProvidersIfGranted } from '@/hooks/queries/useNearbyServiceProvidersIfGranted';
import { useNearbyServiceProviders } from '@/hooks/queries/useServiceProviders';

vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useNearbyServiceProviders: vi.fn(),
}));

function mockUnderlyingQuery(overrides: Record<string, unknown> = {}) {
  (useNearbyServiceProviders as ReturnType<typeof vi.fn>).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  });
}

describe('useNearbyServiceProvidersIfGranted', () => {
  const originalGeolocation = navigator.geolocation;
  const originalPermissions = navigator.permissions;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUnderlyingQuery();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    Object.defineProperty(navigator, 'permissions', { value: originalPermissions, configurable: true });
  });

  it('never prompts (getCurrentPosition uncalled) when Permissions API is unsupported', async () => {
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useNearbyServiceProvidersIfGranted());

    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.available).toBe(false);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(useNearbyServiceProviders).toHaveBeenCalledWith(null);
  });

  it('does not call getCurrentPosition when permission state is "prompt"', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'prompt' });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useNearbyServiceProvidersIfGranted());

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('does not call getCurrentPosition when permission state is "denied"', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'denied' });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useNearbyServiceProvidersIfGranted());

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('resolves position silently and feeds coords into useNearbyServiceProviders when granted', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'granted' });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 31.5, longitude: 34.45 } } as GeolocationPosition);
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useNearbyServiceProvidersIfGranted());

    await waitFor(() => expect(result.current.available).toBe(true));
    expect(useNearbyServiceProviders).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 31.5, lng: 34.45, radius: 10, limit: 8 }),
    );
  });

  it('falls back to unavailable if getCurrentPosition itself errors despite granted permission', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'granted' });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
      error?.({} as GeolocationPositionError);
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useNearbyServiceProvidersIfGranted());

    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.available).toBe(false);
  });

  it('does not throw and reports unavailable if permissions.query() rejects', async () => {
    const query = vi.fn().mockRejectedValue(new Error('not allowed'));
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useNearbyServiceProvidersIfGranted());

    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.available).toBe(false);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
