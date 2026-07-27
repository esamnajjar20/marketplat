/**
 * __tests__/components/AdListItem.test.tsx
 *
 * AdListItem is the list-view alternative to the grid AdCard. Real
 * logic: links to the ad detail route, shows a "تم البيع" overlay only
 * when status === 'SOLD', looks up the Arabic condition label (falling
 * back to the raw value for an unrecognized condition), and falls back
 * to a placeholder image when the ad has no images.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdListItem } from '@/components/ads/AdListItem';
import { ROUTES } from '@/lib/constants';
import type { AdListItem as AdListItemType } from '@/types/ad.types';

function makeAd(overrides: Partial<AdListItemType>): AdListItemType {
  return {
    id: 'ad-1',
    title: 'سيارة تويوتا كورولا 2018',
    price: '25000',
    isNegotiable: false,
    condition: 'USED',
    city: 'غزة',
    images: [],
    status: 'ACTIVE',
    views: 120,
    isFeatured: false,
    isPinned: false,
    userId: 'u1',
    sellerProfileId: 'sp-1',
    categoryId: 'c1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    user: { id: 'u1', name: 'بائع', avatarUrl: null, city: 'غزة' },
    category: null,
    ...overrides,
  } as AdListItemType;
}

describe('AdListItem', () => {
  it('links to the ad detail route', () => {
    const ad = makeAd({ id: 'ad-42' });
    render(<AdListItem ad={ad} />);

    const link = screen.getByText(ad.title).closest('a');
    expect(link).toHaveAttribute('href', ROUTES.adDetail('ad-42'));
  });

  it('renders the formatted price (via formatPrice, including the currency symbol)', () => {
    render(<AdListItem ad={makeAd({ price: '25000' })} />);
    // formatPrice uses Intl.NumberFormat('ar-PS'), which may render
    // Eastern Arabic-Indic digits rather than Western ones — asserting
    // on the currency symbol confirms formatPrice ran, without
    // depending on exact digit-glyph output.
    expect(screen.getByText(/₪/)).toBeInTheDocument();
  });

  it('shows a "تم البيع" overlay when status is SOLD', () => {
    render(<AdListItem ad={makeAd({ status: 'SOLD' })} />);
    expect(screen.getByText('تم البيع')).toBeInTheDocument();
  });

  it('does not show the sold overlay for an active ad', () => {
    render(<AdListItem ad={makeAd({ status: 'ACTIVE' })} />);
    expect(screen.queryByText('تم البيع')).not.toBeInTheDocument();
  });

  it('shows the Arabic condition label for a known condition', () => {
    render(<AdListItem ad={makeAd({ condition: 'NEW' })} />);
    expect(screen.getByText('جديد')).toBeInTheDocument();
  });

  it('does not render a condition element when condition is null', () => {
    const { container } = render(<AdListItem ad={makeAd({ condition: null })} />);
    expect(container.textContent).not.toMatch(/جديد|مستعمل|مجدد/);
  });

  it('shows the city', () => {
    render(<AdListItem ad={makeAd({ city: 'رفح' })} />);
    expect(screen.getByText('رفح')).toBeInTheDocument();
  });

  it('shows the view count', () => {
    render(<AdListItem ad={makeAd({ views: 555 })} />);
    expect(screen.getByText('555')).toBeInTheDocument();
  });

  it('applies a custom className to the link wrapper', () => {
    const { container } = render(<AdListItem ad={makeAd({})} className="my-custom-class" />);
    expect(container.querySelector('a')).toHaveClass('my-custom-class');
  });
});
