/**
 * __tests__/components/QuickActions.test.tsx
 *
 * SELLER-GATE: "نشر إعلان جديد"/"إعلاناتي" require a SellerProfile
 * server-side (ads.service.ts's createAd) — the component now reads
 * useMySellerProfile() and renders either the full seller action set
 * or a single "أنشئ حساب بائع" CTA in their place. Mocked the same way
 * UserMenu.test.tsx/ProtectedHeader.test.tsx mock this hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuickActions } from '@/components/profile/QuickActions';
import { useMySellerProfile } from '@/hooks/queries/useSellers';

vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(),
}));

describe('QuickActions', () => {
  describe('seller (has a SellerProfile)', () => {
    beforeEach(() => {
      vi.mocked(useMySellerProfile).mockReturnValue({
        data: { id: 'seller-1' }, isSuccess: true,
      } as never);
    });

    it('renders all five quick action links', () => {
      render(<QuickActions />);

      expect(screen.getByText('نشر إعلان جديد')).toBeInTheDocument();
      expect(screen.getByText('إعلاناتي')).toBeInTheDocument();
      expect(screen.getByText('طلباتي')).toBeInTheDocument();
      expect(screen.getByText('المفضلة')).toBeInTheDocument();
      expect(screen.getByText('الإعدادات')).toBeInTheDocument();
    });

    it('links "المفضلة" to /favorites', () => {
      render(<QuickActions />);

      expect(screen.getByText('المفضلة').closest('a')).toHaveAttribute('href', '/favorites');
    });

    it('renders the primary action ("نشر إعلان جديد") with primary styling, distinct from the rest', () => {
      render(<QuickActions />);

      const primaryLink = screen.getByText('نشر إعلان جديد').closest('a');
      const secondaryLink = screen.getByText('إعلاناتي').closest('a');

      expect(primaryLink?.className).toMatch(/bg-primary/);
      expect(secondaryLink?.className).not.toMatch(/bg-primary text-primary-foreground/);
    });

    it('renders exactly five links', () => {
      render(<QuickActions />);

      expect(screen.getAllByRole('link')).toHaveLength(5);
    });
  });

  describe('non-seller (no SellerProfile)', () => {
    beforeEach(() => {
      vi.mocked(useMySellerProfile).mockReturnValue({
        data: undefined, isSuccess: true,
      } as never);
    });

    it('hides نشر إعلان جديد/إعلاناتي and shows the seller-signup CTA instead', () => {
      render(<QuickActions />);

      expect(screen.queryByText('نشر إعلان جديد')).not.toBeInTheDocument();
      expect(screen.queryByText('إعلاناتي')).not.toBeInTheDocument();
      const cta = screen.getByText('أنشئ حساب بائع').closest('a');
      expect(cta).toHaveAttribute('href', '/settings/seller');
      expect(cta?.className).toMatch(/bg-primary/);
    });

    it('still renders the three role-agnostic actions', () => {
      render(<QuickActions />);

      expect(screen.getByText('طلباتي')).toBeInTheDocument();
      expect(screen.getByText('المفضلة')).toBeInTheDocument();
      expect(screen.getByText('الإعدادات')).toBeInTheDocument();
    });

    it('renders exactly four links (CTA + three role-agnostic)', () => {
      render(<QuickActions />);

      expect(screen.getAllByRole('link')).toHaveLength(4);
    });
  });

  describe('loading (query not yet resolved)', () => {
    it('renders nothing until sellerLoaded resolves, avoiding a flash of the wrong action set', () => {
      vi.mocked(useMySellerProfile).mockReturnValue({
        data: undefined, isSuccess: false,
      } as never);
      const { container } = render(<QuickActions />);

      expect(container).toBeEmptyDOMElement();
    });
  });
});
