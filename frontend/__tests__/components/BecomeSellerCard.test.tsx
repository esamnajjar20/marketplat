/**
 * __tests__/components/BecomeSellerCard.test.tsx
 *
 * previously, completing this form left the user stranded on
 * /settings/seller with no way back to whatever they originally came
 * here to do (most commonly: publish an ad, blocked by CreateAdGate).
 * This covers the new ?from= redirect — read via useSearchParams,
 * validated/normalized through getSafeRedirectPath (already unit-
 * tested in lib/cookies.test.ts), and fired via router.push() only
 * from the mutation's onSuccess.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { BecomeSellerCard } from '@/components/sellers/BecomeSellerCard';
import { useCreateSellerProfile } from '@/hooks/mutations/useSellerMutations';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/hooks/mutations/useSellerMutations', () => ({
  useCreateSellerProfile: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/settings/seller',
}));

const mockCreateProfile = vi.fn();

describe('BecomeSellerCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    (useAuthStore as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'u1', name: 'أحمد' });
    (useCreateSellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockCreateProfile,
      isPending: false,
    });
  });

  async function agreeAndSubmit(user: ReturnType<typeof setupUser>) {
    await user.click(screen.getByLabelText('أوافق على شروط البيع الخاصة بالمنصة'));
    await user.click(screen.getByRole('button', { name: 'إنشاء ملف البائع' }));
  }

  it('disables submit until the terms checkbox is checked', () => {
    render(<BecomeSellerCard />);
    expect(screen.getByRole('button', { name: 'إنشاء ملف البائع' })).toBeDisabled();
  });

  it('shows a validation error and does not submit when terms are unchecked', async () => {
    render(<BecomeSellerCard />);

    // The submit button is disabled while unchecked (see previous
    // test), so exercise validate()'s error path the same way
    // AdForm.test.tsx does: dispatch a real submit event on the form
    // directly rather than relying on a disabled button click.
    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    expect(screen.getByText('يجب الموافقة على شروط البيع للمتابعة')).toBeInTheDocument();
    expect(mockCreateProfile).not.toHaveBeenCalled();
  });

  it('submits with agreedToSellerTerms true and trims optional fields', async () => {
    const user = setupUser();
    render(<BecomeSellerCard />);

    await user.type(screen.getByLabelText('اسم العرض'), '  متجر أحمد  ');
    await agreeAndSubmit(user);

    expect(mockCreateProfile).toHaveBeenCalledWith(
      { displayName: 'متجر أحمد', bio: undefined, agreedToSellerTerms: true },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('does not redirect on success when there is no ?from= param', async () => {
    const user = setupUser();
    render(<BecomeSellerCard />);
    await agreeAndSubmit(user);

    const { onSuccess } = mockCreateProfile.mock.calls[0][1];
    onSuccess();

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects to the ?from= target on success (FIX P0-1)', async () => {
    mockSearchParams = new URLSearchParams('from=/ads/create');
    const user = setupUser();
    render(<BecomeSellerCard />);
    await agreeAndSubmit(user);

    const { onSuccess } = mockCreateProfile.mock.calls[0][1];
    onSuccess();

    expect(mockPush).toHaveBeenCalledWith('/ads/create');
  });

  it('falls back to not redirecting when ?from= is an unsafe absolute URL', async () => {
    mockSearchParams = new URLSearchParams('from=https://evil.example.com');
    const user = setupUser();
    render(<BecomeSellerCard />);
    await agreeAndSubmit(user);

    const { onSuccess } = mockCreateProfile.mock.calls[0][1];
    onSuccess();

    // getSafeRedirectPath falls back to '/dashboard' for an unsafe
    // value — still a same-origin push, never the raw external URL.
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    expect(mockPush).not.toHaveBeenCalledWith('https://evil.example.com');
  });

  it('shows the pending label and disables submit while the mutation is in flight', () => {
    (useCreateSellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockCreateProfile,
      isPending: true,
    });
    render(<BecomeSellerCard />);
    expect(screen.getByRole('button', { name: 'جارٍ الإنشاء…' })).toBeDisabled();
  });
});
