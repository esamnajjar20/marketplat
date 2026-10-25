/**
 * __tests__/hooks/useSilentCoordinates.test.tsx
 *
 * Same "never prompt" contract as useNearbyServiceProvidersIfGranted
 * (see that hook's own test file for the precedent this mirrors):
 * getCurrentPosition must only ever be called when the Permissions
 * API already reports 'granted'. Unlike that hook, this one has no
 * available/isChecking distinction — it just returns coords or null.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSilentCoordinates } from '@/hooks/useSilentCoordinates';

describe('useSilentCoordinates', () => {
  const originalGeolocation = navigator.geolocation;
  const originalPermissions = navigator.permissions;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    Object.defineProperty(navigator, 'permissions', { value: originalPermissions, configurable: true });
  });

  it('returns null and never prompts when the Permissions API is unsupported', async () => {
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useSilentCoordinates());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('returns null and never calls getCurrentPosition when permission is only "prompt"', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'prompt' });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useSilentCoordinates());

    await waitFor(() => expect(query).toHaveBeenCalled());
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('resolves coordinates silently when permission is already "granted"', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'granted' });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 31.5, longitude: 34.45 } } as GeolocationPosition);
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useSilentCoordinates());

    await waitFor(() => expect(result.current).toEqual({ lat: 31.5, lng: 34.45 }));
  });

  it('stays null if getCurrentPosition itself errors despite granted permission', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'granted' });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
      error?.({} as GeolocationPositionError);
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useSilentCoordinates());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
  });

  it('does not throw and stays null if permissions.query() rejects', async () => {
    const query = vi.fn().mockRejectedValue(new Error('not allowed'));
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    const { result } = renderHook(() => useSilentCoordinates());

    await waitFor(() => expect(query).toHaveBeenCalled());
    expect(result.current).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
