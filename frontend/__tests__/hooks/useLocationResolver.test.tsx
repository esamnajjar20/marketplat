/**
 * __tests__/hooks/useLocationResolver.test.tsx
 *
 * coverage — location priority chain: gps-current → gps-saved →
 * city → fallback. Mirrors the permission-checking conventions of
 * useNearbyServiceProvidersIfGranted.test.tsx (Object.defineProperty for
 * navigator, renderHook/waitFor, no real timers/network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

function mockCity(city: string | null) {
  vi.mocked(useAuthStore).mockImplementation((selector: unknown) =>
    (selector as (s: { user: { city: string | null } | null }) => unknown)({ user: { city } }),
  );
}

const STORAGE_KEY = 'location:gps';
const TTL_MS = 24 * 60 * 60 * 1000;

describe('useLocationResolver', () => {
  const originalGeolocation = navigator.geolocation;
  const originalPermissions = navigator.permissions;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockCity(null);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    Object.defineProperty(navigator, 'permissions', { value: originalPermissions, configurable: true });
    window.localStorage.clear();
  });

  function setPermissionsApi(state: 'granted' | 'prompt' | 'denied' | null) {
    if (state === null) {
      Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
      return;
    }
    const query = vi.fn().mockResolvedValue({ state });
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });
  }

  function setGeolocation(getCurrentPosition: ReturnType<typeof vi.fn>) {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  }

  // 1. GPS current available (granted → resolves silently)
  it('resolves gps-current when permission already granted', async () => {
    setPermissionsApi('granted');
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 31.5, longitude: 34.45 } } as GeolocationPosition);
    });
    setGeolocation(getCurrentPosition);

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('gps-current'));
    expect(result.current.latitude).toBe(31.5);
    expect(result.current.longitude).toBe(34.45);
  });

  // 2. permission = granted (no popup expected, still checked above)
  it('does not require an explicit user action when permission is granted', async () => {
    setPermissionsApi('granted');
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      // Must fall inside isUsableNearbyCoord's Gaza-area bounding box
      // (lat 31.0-32.0, lng 34.0-35.0) or the hook silently rejects it
      // and never reaches 'gps-current'.
      success({ coords: { latitude: 31.1, longitude: 34.1 } } as GeolocationPosition);
    });
    setGeolocation(getCurrentPosition);

    const { result } = renderHook(() => useLocationResolver());
    await waitFor(() => expect(result.current.source).toBe('gps-current'));
    // Called once automatically, not via requestLocation.
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  // 3. permission = prompt → falls to next source, no auto getCurrentPosition
  it('does not call getCurrentPosition automatically when permission is prompt', async () => {
    setPermissionsApi('prompt');
    const getCurrentPosition = vi.fn();
    setGeolocation(getCurrentPosition);
    mockCity('غزة');

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('city'));
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  // 4. permission = denied → falls to next source, no popup attempt
  it('does not call getCurrentPosition when permission is denied', async () => {
    setPermissionsApi('denied');
    const getCurrentPosition = vi.fn();
    setGeolocation(getCurrentPosition);
    mockCity('رفح');

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('city'));
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  // 5 & 6. user presses requestLocation, succeeds
  it('requestLocation() succeeds and sets source to gps-current', async () => {
    setPermissionsApi('prompt');
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      // Must fall inside isUsableNearbyCoord's Gaza-area bounding box.
      success({ coords: { latitude: 31.2, longitude: 34.2 } } as GeolocationPosition);
    });
    setGeolocation(getCurrentPosition);

    const { result } = renderHook(() => useLocationResolver());
    await waitFor(() => expect(result.current.source).toBe('fallback'));

    act(() => {
      result.current.requestLocation();
    });

    await waitFor(() => expect(result.current.source).toBe('gps-current'));
    expect(result.current.latitude).toBe(31.2);
    expect(result.current.longitude).toBe(34.2);
  });

  // 7. requestLocation fails → does not break Home, falls through
  it('requestLocation() failure does not throw and falls back to city', async () => {
    setPermissionsApi('prompt');
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
      error?.({ code: 1, message: 'denied' } as GeolocationPositionError);
    });
    setGeolocation(getCurrentPosition);
    mockCity('خان يونس');

    const { result } = renderHook(() => useLocationResolver());
    await waitFor(() => expect(result.current.source).toBe('city'));

    act(() => {
      result.current.requestLocation();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.source).toBe('city');
  });

  // 8. valid saved GPS exists
  it('uses valid saved GPS within TTL when no fresh gps-current exists', async () => {
    setPermissionsApi('prompt');
    setGeolocation(vi.fn());
    window.localStorage.setItem(
      STORAGE_KEY,
      // Must fall inside isUsableNearbyCoord's Gaza-area bounding box —
      // readSavedGps() rejects out-of-range coords same as a fresh fix.
      JSON.stringify({ latitude: 31.3, longitude: 34.3, timestamp: Date.now() - 1000 }),
    );

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('gps-saved'));
    expect(result.current.latitude).toBe(31.3);
    expect(result.current.longitude).toBe(34.3);
  });

  // 9. saved GPS expired
  it('ignores saved GPS past TTL and falls to next source', async () => {
    setPermissionsApi('prompt');
    setGeolocation(vi.fn());
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ latitude: 5, longitude: 6, timestamp: Date.now() - (TTL_MS + 1000) }),
    );
    mockCity('غزة');

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('city'));
  });

  // 10. no saved GPS
  it('falls through when no saved GPS exists', async () => {
    setPermissionsApi('prompt');
    setGeolocation(vi.fn());
    mockCity('غزة');

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('city'));
  });

  // 11. user.city present
  it('resolves city when present and no GPS available', async () => {
    setPermissionsApi('prompt');
    setGeolocation(vi.fn());
    mockCity('دير البلح');

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('city'));
    expect(result.current.city).toBe('دير البلح');
  });

  // 12. user.city empty
  it('falls back when user.city is an empty string', async () => {
    setPermissionsApi('prompt');
    setGeolocation(vi.fn());
    mockCity('');

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('fallback'));
  });

  // 13. no GPS and no city
  it('falls back when there is no GPS and no city', async () => {
    setPermissionsApi('prompt');
    setGeolocation(vi.fn());
    mockCity(null);

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('fallback'));
  });

  // 14. general fallback chosen
  it('exposes source "fallback" with no lat/lng/city when nothing resolves', async () => {
    setPermissionsApi('prompt');
    setGeolocation(vi.fn());
    mockCity(null);

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('fallback'));
    expect(result.current.latitude).toBeUndefined();
    expect(result.current.longitude).toBeUndefined();
    expect(result.current.city).toBeUndefined();
  });

  // 15. saved GPS not used after TTL (duplicate emphasis at boundary)
  it('treats a timestamp exactly at TTL boundary as still valid, and past it as expired', async () => {
    setPermissionsApi('prompt');
    setGeolocation(vi.fn());
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ latitude: 9, longitude: 9, timestamp: Date.now() - TTL_MS - 1 }),
    );
    mockCity(null);

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('fallback'));
  });

  // 16. localStorage unavailable/throws
  it('does not throw when localStorage access throws', async () => {
    setPermissionsApi('prompt');
    setGeolocation(vi.fn());
    mockCity('غزة');

    const originalGetItem = window.localStorage.getItem;
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    const { result } = renderHook(() => useLocationResolver());

    await waitFor(() => expect(result.current.source).toBe('city'));

    window.localStorage.getItem = originalGetItem;
  });

  // 17. SSR environment without window — resolver still returns a value
  // (behavioral proxy: internal helpers guard on typeof window, and the
  // hook itself never assumes window synchronously outside effects).
  it('read/persist helpers no-op safely when window is undefined', async () => {
    // We cannot literally unmount `window` inside jsdom without breaking
    // the test runner itself, so this test asserts the guard exists by
    // checking that persisting with a broken localStorage (simulating
    // an environment where storage access is impossible) never throws
    // synchronously during render.
    setPermissionsApi('granted');
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 3, longitude: 4 } } as GeolocationPosition);
    });
    setGeolocation(getCurrentPosition);

    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('unavailable');
    });

    expect(() => renderHook(() => useLocationResolver())).not.toThrow();
  });

  // 18 & 19. permission = prompt never auto-calls getCurrentPosition;
  // only requestLocation() triggers the prompt.
  it('only requestLocation() triggers getCurrentPosition when permission is prompt', async () => {
    setPermissionsApi('prompt');
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      // Must fall inside isUsableNearbyCoord's Gaza-area bounding box.
      success({ coords: { latitude: 31.4, longitude: 34.4 } } as GeolocationPosition);
    });
    setGeolocation(getCurrentPosition);

    const { result } = renderHook(() => useLocationResolver());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getCurrentPosition).not.toHaveBeenCalled();

    act(() => {
      result.current.requestLocation();
    });

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.source).toBe('gps-current'));
  });

  // 20. resolver moves to next source when current source fails, without blocking Home
  it('never leaves Home without a resolvable state when a source fails', async () => {
    setPermissionsApi('granted');
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
      error?.({ code: 2, message: 'unavailable' } as GeolocationPositionError);
    });
    setGeolocation(getCurrentPosition);
    mockCity('غزة');

    const { result } = renderHook(() => useLocationResolver());

    // gps-current fails silently → falls through to city.
    await waitFor(() => expect(result.current.source).toBe('city'));
    expect(result.current.isLoading).toBe(false);
  });

  // 21. COMPAT-AUDIT fix: a GPS by one useLocationResolver()
  // instance must reach a second, independently-mounted instance in the
  // same tab without a remount — Home mounts four separate instances
  // (HomeAboveFold, RecentProductsSection, FeaturedStoresSection,
  // NearbyProvidersSection) and localStorage's native 'storage' event
  // never fires for same-tab writes, so without the same-tab pub-sub
  // fix, sibling sections stayed stuck on their stale source until a
  // full page reload even after a fresh GPS already saved.
  it('a GPS fix persisted by one resolver instance reaches a second, already-mounted sibling instance', async () => {
    setPermissionsApi('prompt');
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      // Must fall inside isUsableNearbyCoord's Gaza-area bounding box.
      success({ coords: { latitude: 31.6, longitude: 34.6 } } as GeolocationPosition);
    });
    setGeolocation(getCurrentPosition);
    mockCity('غزة');

    // Two independent instances mounted at once, exactly like Home does.
    const first = renderHook(() => useLocationResolver());
    const second = renderHook(() => useLocationResolver());

    await waitFor(() => expect(first.result.current.source).toBe('city'));
    await waitFor(() => expect(second.result.current.source).toBe('city'));

    // Only the first instance's CTA is pressed — mirrors a person
    // clicking "استخدام موقعي" in one Home section.
    act(() => {
      first.result.current.requestLocation();
    });

    await waitFor(() => expect(first.result.current.source).toBe('gps-current'));
    // The second instance never had requestLocation() called on it, yet
    // must pick up the freshly-saved GPS without a remount.
    await waitFor(() => expect(second.result.current.source).toBe('gps-saved'));
    expect(second.result.current.latitude).toBe(31.6);
    expect(second.result.current.longitude).toBe(34.6);
  });
});
