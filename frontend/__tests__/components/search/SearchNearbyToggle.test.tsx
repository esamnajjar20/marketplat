/**
 * __tests__/components/search/SearchNearbyToggle.test.tsx
 *
 * Covers components/search/SearchNearbyToggle.tsx:
 *   - idle state renders the locate button; active state (lat+lng on
 *     URL) renders the clear button instead.
 *   - a successful geolocation call sets lat/lng/radius/sort=distance
 *     and drops page.
 *   - permission denial shows an inline error, without navigating.
 *   - missing `navigator.geolocation` shows the unsupported message.
 *   - clearing removes lat/lng/radius, and only drops sort if it was
 *     'distance' (leaves any other sort value untouched).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchNearbyToggle } from '@/components/search/SearchNearbyToggle';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

function paramsFromPush(callIndex = 0) {
  const url = mockPush.mock.calls[callIndex][0] as string;
  return new URLSearchParams(url.split('?')[1]);
}

describe('SearchNearbyToggle', () => {
  const originalGeolocation = global.navigator.geolocation;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    // Restores the property itself (not just its value) in case a test
    // deleted it outright (see the "unsupported" test below).
    Object.defineProperty(global.navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
      writable: true,
    });
  });

  it('renders the locate button when no lat/lng are on the URL', () => {
    render(<SearchNearbyToggle />);
    expect(screen.getByRole('button', { name: /البحث ضمن 10 كم مني/ })).toBeInTheDocument();
  });

  it('renders the clear button when lat/lng are already on the URL', () => {
    mockSearchParams = new URLSearchParams({ lat: '31.9', lng: '35.2' });
    render(<SearchNearbyToggle />);
    expect(screen.getByRole('button', { name: 'إلغاء البحث القريب' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /البحث ضمن/ })).not.toBeInTheDocument();
  });

  it('sets lat/lng/radius/sort=distance and drops page on a successful locate', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 31.9, longitude: 35.2 } } as GeolocationPosition),
      },
      configurable: true,
    });
    mockSearchParams = new URLSearchParams({ page: '3' });
    const user = userEvent.setup();
    render(<SearchNearbyToggle />);

    await user.click(screen.getByRole('button', { name: /البحث ضمن 10 كم مني/ }));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const params = paramsFromPush();
    expect(params.get('lat')).toBe('31.9');
    expect(params.get('lng')).toBe('35.2');
    expect(params.get('radius')).toBe('10');
    expect(params.get('sort')).toBe('distance');
    expect(params.has('page')).toBe(false);
  });

  it('shows a denial message and does not navigate when permission is denied', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1 } as GeolocationPositionError),
      },
      configurable: true,
    });
    const user = userEvent.setup();
    render(<SearchNearbyToggle />);

    await user.click(screen.getByRole('button', { name: /البحث ضمن 10 كم مني/ }));

    expect(await screen.findByText(/تعذّر الوصول إلى موقعك/)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows an unsupported message when geolocation is unavailable', async () => {
    // The component gates on `'geolocation' in navigator` — setting the
    // property to `undefined` still leaves it present on the object, so
    // the `in` check stays true and getCurrentPosition() is called on
    // undefined. Actually delete the property to simulate an unsupported browser.
    // @ts-expect-error - intentionally deleting a normally-required property for this test
    delete global.navigator.geolocation;
    const user = userEvent.setup();
    render(<SearchNearbyToggle />);

    await user.click(screen.getByRole('button', { name: /البحث ضمن 10 كم مني/ }));

    expect(await screen.findByText('المتصفح لا يدعم تحديد الموقع.')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears lat/lng/radius and the distance sort together, dropping page', async () => {
    mockSearchParams = new URLSearchParams({ lat: '31.9', lng: '35.2', radius: '10', sort: 'distance', page: '2' });
    const user = userEvent.setup();
    render(<SearchNearbyToggle />);

    await user.click(screen.getByRole('button', { name: 'إلغاء البحث القريب' }));

    const params = paramsFromPush();
    expect(params.has('lat')).toBe(false);
    expect(params.has('lng')).toBe(false);
    expect(params.has('radius')).toBe(false);
    expect(params.has('sort')).toBe(false);
    expect(params.has('page')).toBe(false);
  });

  it('leaves a non-distance sort untouched when clearing', async () => {
    mockSearchParams = new URLSearchParams({ lat: '31.9', lng: '35.2', sort: 'newest' });
    const user = userEvent.setup();
    render(<SearchNearbyToggle />);

    await user.click(screen.getByRole('button', { name: 'إلغاء البحث القريب' }));

    const params = paramsFromPush();
    expect(params.get('sort')).toBe('newest');
  });
});
