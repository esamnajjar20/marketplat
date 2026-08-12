/**
 * __tests__/components/SellerProfileAds.test.tsx
 *
 * Coverage gap: 0% prior coverage. Trivial props-driven grid — covers
 * the empty state and rendering one AdCard per ad.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SellerProfileAds } from '@/components/sellers/SellerProfileAds';
import type { AdListItem } from '@/types/ad.types';

vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad }: { ad: { id: string; title: string } }) => <div data-testid={`adcard-${ad.id}`}>{ad.title}</div>,
}));

const ads = [
  { id: 'ad-1', title: 'غسالة ملابس' },
  { id: 'ad-2', title: 'مكيف هواء' },
] as unknown as AdListItem[];

describe('SellerProfileAds', () => {
  it('shows the empty state when the seller has no ads', () => {
    render(<SellerProfileAds ads={[]} />);

    expect(screen.getByText('لا توجد إعلانات')).toBeInTheDocument();
  });

  it('renders an AdCard for each ad', () => {
    render(<SellerProfileAds ads={ads} />);

    expect(screen.getByTestId('adcard-ad-1')).toBeInTheDocument();
    expect(screen.getByTestId('adcard-ad-2')).toBeInTheDocument();
  });
});
