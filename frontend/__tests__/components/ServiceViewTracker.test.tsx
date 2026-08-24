/**
 * __tests__/components/ServiceViewTracker.test.tsx
 *
 * PR4A (recommendation view signals): ServiceViewTracker is a small
 * render-nothing client component (same shape as PageViewTracker.tsx)
 * mounted on the Server Component /services/[id] detail page to fire
 * SERVICE_VIEW once per listing load — the SERVICE_LISTING counterpart
 * of AD_VIEW's effect in AdDetailSection.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ServiceViewTracker } from '@/components/services/ServiceViewTracker';
import { track } from '@/lib/analytics';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

describe('ServiceViewTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing', () => {
    const { container } = render(
      <ServiceViewTracker serviceListingId="listing-1" categoryId="cat-1" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('fires SERVICE_VIEW once with the listing id and categoryId', () => {
    render(<ServiceViewTracker serviceListingId="listing-1" categoryId="cat-1" />);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('SERVICE_VIEW', {
      serviceListingId: 'listing-1',
      categoryId: 'cat-1',
    });
  });

  it('still fires when categoryId is not provided', () => {
    render(<ServiceViewTracker serviceListingId="listing-1" />);

    expect(track).toHaveBeenCalledWith('SERVICE_VIEW', {
      serviceListingId: 'listing-1',
      categoryId: undefined,
    });
  });

  it('does not re-fire on an unrelated re-render with the same id/categoryId (duplicate-render protection)', () => {
    const { rerender } = render(
      <ServiceViewTracker serviceListingId="listing-1" categoryId="cat-1" />
    );
    expect(track).toHaveBeenCalledTimes(1);

    rerender(<ServiceViewTracker serviceListingId="listing-1" categoryId="cat-1" />);

    expect(track).toHaveBeenCalledTimes(1);
  });

  it('fires again when navigating client-side to a different listing (id changes)', () => {
    const { rerender } = render(
      <ServiceViewTracker serviceListingId="listing-1" categoryId="cat-1" />
    );
    expect(track).toHaveBeenCalledTimes(1);

    rerender(<ServiceViewTracker serviceListingId="listing-2" categoryId="cat-2" />);

    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('SERVICE_VIEW', {
      serviceListingId: 'listing-2',
      categoryId: 'cat-2',
    });
  });
});
