/**
 * __tests__/components/HeroBanner.test.tsx
 *
 * HeroBanner is static marketing markup — no conditional logic. Covers
 * the headline/copy rendering and pins down the "نشر إعلان مجاناً" CTA
 * pointing at the real ROUTES.adCreate route (the same
 * ROUTES.createAd-vs-adCreate mismatch fixed in PublicHeader/
 * ProtectedHeader existed as a risk here too — this confirms
 * HeroBanner was written correctly).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroBanner } from '@/components/home/HeroBanner';
import { ROUTES } from '@/lib/constants';

describe('HeroBanner', () => {
  it('renders the headline and supporting copy', () => {
    render(<HeroBanner />);

    expect(screen.getByRole('heading', { name: 'من أهل غزة، لأهل غزة' })).toBeInTheDocument();
    expect(
      screen.getByText('سيارات، عقارات، إلكترونيات وأكثر — بيع واشترِ من جيرانك، بثقة.'),
    ).toBeInTheDocument();
  });

  it('renders the search bar', () => {
    render(<HeroBanner />);
    expect(screen.getByLabelText('ابحث في الإعلانات')).toBeInTheDocument();
  });

  it('links the CTA to the real ad-create route', () => {
    render(<HeroBanner />);

    const cta = screen.getByText('نشر إعلان مجاناً').closest('a');
    expect(cta).toHaveAttribute('href', ROUTES.adCreate);
  });
});
