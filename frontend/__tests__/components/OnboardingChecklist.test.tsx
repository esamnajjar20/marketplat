/**
 * __tests__/components/OnboardingChecklist.test.tsx
 *
 * Coverage gap: 0% prior coverage (FIX P2-8). Covers the null-while-
 * loading guard, the "collapses to nothing once all steps are done"
 * behavior, per-step done/undone rendering (avatar, seller profile,
 * first ad), the seller-profile-required link for the "first ad"
 * step (with and without an existing seller profile), the isError
 * treated as "not a seller yet" mirroring CreateAdGate, and the
 * singular/plural "خطوة متبقية" copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnboardingChecklist } from '@/components/profile/OnboardingChecklist';
import { useAuthStore } from '@/store/auth.store';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useMyAds } from '@/hooks/queries/useAds';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(),
}));

vi.mock('@/hooks/queries/useAds', () => ({
  useMyAds: vi.fn(),
}));

function mockUser(user: Record<string, unknown> | null) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { user: unknown }) => unknown) => selector({ user }),
  );
}

function mockSeller(overrides: Record<string, unknown> = {}) {
  (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    ...overrides,
  });
}

function mockAds(overrides: Record<string, unknown> = {}) {
  (useMyAds as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [] },
    isLoading: false,
    ...overrides,
  });
}

describe('OnboardingChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser({ avatarUrl: null });
    mockSeller();
    mockAds();
  });

  it('renders nothing while seller profile is loading', () => {
    mockSeller({ isLoading: true });
    const { container } = render(<OnboardingChecklist />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while ads are loading', () => {
    mockAds({ isLoading: true });
    const { container } = render(<OnboardingChecklist />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when all three steps are already complete', () => {
    mockUser({ avatarUrl: 'https://example.com/a.jpg' });
    mockSeller({ data: { id: 'seller-1' }, isError: false });
    mockAds({ data: { items: [{ id: 'ad-1' }] } });
    const { container } = render(<OnboardingChecklist />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows all three incomplete steps for a brand-new user', () => {
    render(<OnboardingChecklist />);

    expect(screen.getAllByText('أضف صورة شخصية').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('أنشئ ملف البائع')).toBeInTheDocument();
    expect(screen.getByText('انشر إعلانك الأول')).toBeInTheDocument();
    expect(screen.getByText(/0 من 3 خطوات مكتملة/)).toBeInTheDocument();
  });

  it('marks the avatar step done (struck through) when the user has an avatar', () => {
    mockUser({ avatarUrl: 'https://example.com/a.jpg' });
    render(<OnboardingChecklist />);

    const label = screen.getByText('أضف صورة شخصية');
    expect(label.className).toMatch(/line-through/);
  });

  it('uses singular "خطوة متبقية" copy when exactly one step remains', () => {
    mockUser({ avatarUrl: 'https://example.com/a.jpg' });
    mockSeller({ data: { id: 'seller-1' }, isError: false });
    render(<OnboardingChecklist />);

    expect(screen.getByText(/2 من 3 خطوات مكتملة/)).toBeInTheDocument();
    expect(screen.getByText(/خطوة أخيرة/)).toBeInTheDocument();
  });

  it('treats a seller-profile fetch error as "not yet a seller" (mirrors CreateAdGate)', () => {
    mockSeller({ data: undefined, isError: true });
    render(<OnboardingChecklist />);

    // Step remains undone/linked, not silently marked done by the error.
    expect(screen.getByText('أنشئ ملف البائع').closest('a')).toBeInTheDocument();
  });

  it('links the "first ad" step straight to ad creation when the user already has a seller profile', () => {
    mockSeller({ data: { id: 'seller-1' }, isError: false });
    render(<OnboardingChecklist />);

    const link = screen.getByText('انشر إعلانك الأول').closest('a');
    expect(link).toHaveAttribute('href', expect.not.stringContaining('from='));
  });

  it('routes the "first ad" step through seller setup with a ?from= redirect when not yet a seller', () => {
    render(<OnboardingChecklist />);

    const link = screen.getByText('انشر إعلانك الأول').closest('a');
    expect(link?.getAttribute('href')).toContain('from=');
  });

  it('marks the "first ad" step done when the user already has at least one ad', () => {
    mockAds({ data: { items: [{ id: 'ad-1' }] } });
    render(<OnboardingChecklist />);

    expect(screen.getByText('انشر إعلانك الأول').className).toMatch(/line-through/);
  });
});
