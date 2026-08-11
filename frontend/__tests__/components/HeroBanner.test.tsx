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

    // HeroBanner renders two parallel layouts (a compact mobile card,
    // sm:hidden, and the full desktop hero, hidden sm:block) — both are
    // present in jsdom since there's no real viewport to hide either via
    // CSS, so the headline and copy each appear twice.
    expect(screen.getAllByRole('heading', { name: 'من أهل غزة، لأهل غزة' }).length).toBe(2);
    expect(
      screen.getAllByText('سيارات، عقارات، إلكترونيات وأكثر — بيع واشترِ من جيرانك، بثقة.').length,
    ).toBe(2);
  });

  it('renders the search bar', () => {
    render(<HeroBanner />);
    expect(screen.getByLabelText('ابحث في الإعلانات')).toBeInTheDocument();
  });

  it('links the CTA to the real ad-create route', () => {
    render(<HeroBanner />);

    // Same mobile/desktop duplication as above — two CTA links, both
    // pointing at the same route.
    const ctas = screen.getAllByText('نشر إعلان مجاناً').map((el) => el.closest('a'));
    expect(ctas.length).toBe(2);
    ctas.forEach((cta) => expect(cta).toHaveAttribute('href', ROUTES.adCreate));
  });
});
