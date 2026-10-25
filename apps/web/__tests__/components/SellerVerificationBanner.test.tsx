/**
 * __tests__/components/SellerVerificationBanner.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SellerVerificationBanner } from '@/components/sellers/SellerVerificationBanner';
import { useMySellerProfile } from '@/hooks/queries/useSellers';

vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(),
}));

describe('SellerVerificationBanner', () => {
  beforeEach(() => {
    vi.mocked(useMySellerProfile).mockReturnValue({
      data: null,
      isSuccess: false,
    } as never);
  });

  it('returns null when verified', () => {
    vi.mocked(useMySellerProfile).mockReturnValue({
      data: { verified: true, verificationStatus: 'APPROVED' },
      isSuccess: true,
    } as never);
    const { container } = render(<SellerVerificationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows pending review message', () => {
    vi.mocked(useMySellerProfile).mockReturnValue({
      data: { verified: false, verificationStatus: 'PENDING' },
      isSuccess: true,
    } as never);
    render(<SellerVerificationBanner />);
    expect(screen.getByText(/قيد المراجعة/)).toBeInTheDocument();
  });

  it('shows CTA when not verified and not pending', () => {
    vi.mocked(useMySellerProfile).mockReturnValue({
      data: { verified: false, verificationStatus: 'NONE' },
      isSuccess: true,
    } as never);
    render(<SellerVerificationBanner />);
    // banner with verification prompt
    expect(document.body.textContent).toMatch(/توثيق|تحقق|verified|طلب/i);
  });
});
