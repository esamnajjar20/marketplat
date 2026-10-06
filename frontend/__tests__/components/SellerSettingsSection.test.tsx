/**
 * __tests__/components/SellerSettingsSection.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers 's core branch:
 * a 404 (no seller profile yet) must render BecomeSellerCard, while
 * any OTHER error status must render a distinct "failed to load,
 * retry" message rather than misleadingly suggesting the account
 * needs to become a seller again. Also covers loading and the
 * success path rendering MySellerProfileCard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SellerSettingsSection } from '@/components/sellers/SellerSettingsSection';
import { useMySellerProfile } from '@/hooks/queries/useSellers';

vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(),
}));

vi.mock('@/components/sellers/BecomeSellerCard', () => ({
  BecomeSellerCard: () => <div data-testid="become-seller-card" />,
}));

vi.mock('@/components/sellers/MySellerProfileCard', () => ({
  MySellerProfileCard: ({ profile }: { profile: { displayName: string } }) => (
    <div data-testid="profile-card">{profile.displayName}</div>
  ),
}));

const mockRefetch = vi.fn();

function mockProfile(overrides: Record<string, unknown> = {}) {
  (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('SellerSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile();
  });

  it('shows a spinner while loading', () => {
    mockProfile({ isLoading: true });
    render(<SellerSettingsSection />);

    expect(screen.queryByTestId('become-seller-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-card')).not.toBeInTheDocument();
  });

  it('renders BecomeSellerCard on a 404 (no seller profile yet)', () => {
    mockProfile({ isError: true, error: { statusCode: 404 } });
    render(<SellerSettingsSection />);

    expect(screen.getByTestId('become-seller-card')).toBeInTheDocument();
  });

  it('renders BecomeSellerCard when there is simply no profile data (no error)', () => {
    mockProfile({ data: undefined, isError: false });
    render(<SellerSettingsSection />);

    expect(screen.getByTestId('become-seller-card')).toBeInTheDocument();
  });

  it('renders a distinct retry message (not BecomeSellerCard) for a non-404 error (UX-FIX P1-5)', async () => {
    mockProfile({ isError: true, error: { statusCode: 500 } });
    const user = setupUser();
    render(<SellerSettingsSection />);

    expect(screen.queryByTestId('become-seller-card')).not.toBeInTheDocument();
    expect(screen.getByText('تعذّر تحميل بيانات البائع. يرجى المحاولة مرة أخرى.')).toBeInTheDocument();

    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('renders the profile card when the fetch succeeds', () => {
    mockProfile({ data: { displayName: 'متجر الأمل' }, isError: false });
    render(<SellerSettingsSection />);

    expect(screen.getByTestId('profile-card')).toHaveTextContent('متجر الأمل');
  });
});
