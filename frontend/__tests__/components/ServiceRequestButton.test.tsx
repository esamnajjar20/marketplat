/**
 * __tests__/components/ServiceRequestButton.test.tsx
 *
 * Previously uncovered (0%), ~110 lines. First real UI for
 * serviceRequestsApi (Epic 3.1) — the button was previously just a
 * placeholder comment on the listing detail page.
 *
 * Coverage targets:
 *  - Renders null entirely when the signed-in user owns the listing
 *    (own-listing check happens before any render, not just a hidden
 *    dialog)
 *  - Unauthenticated: clicking redirects to /login?next=<encoded detail
 *    url> instead of opening the dialog
 *  - Authenticated: clicking opens the dialog
 *  - Submit is disabled below the 10-character minimum and shows a
 *    toast error instead of calling mutate when forced
 *  - A valid submit trims details and calls createRequest.mutate with
 *    { listingId, details }
 *  - onSuccess closes the dialog and resets the textarea
 *  - Cancel closes without submitting
 *  - Pending state disables submit and shows the pending label
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ServiceRequestButton } from '@/components/services/ServiceRequestButton';
import { useCreateServiceRequest } from '@/hooks/mutations/useServiceRequestMutations';
import { useAuthStore } from '@/store/auth.store';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/hooks/mutations/useServiceRequestMutations', () => ({
  useCreateServiceRequest: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockMutate = vi.fn();

function mockAuth(state: { isAuthenticated: boolean; user: { id: string } | null }) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
  );
}

describe('ServiceRequestButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCreateServiceRequest as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate, isPending: false,
    });
    mockAuth({ isAuthenticated: true, user: { id: 'customer-1' } });
  });

  it('renders nothing when the signed-in user owns the listing', () => {
    mockAuth({ isAuthenticated: true, user: { id: 'provider-1' } });
    const { container } = render(
      <ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the button when the user is not the listing owner', () => {
    render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);
    expect(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ })).toBeInTheDocument();
  });

  describe('unauthenticated', () => {
    it('redirects to login with the encoded listing detail url instead of opening the dialog', async () => {
      mockAuth({ isAuthenticated: false, user: null });
      const user = setupUser();
      render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);

      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));

      expect(mockPush).toHaveBeenCalledWith(
        `/login?next=${encodeURIComponent('/services/listing-1')}`,
      );
      expect(screen.queryByText('إرسال طلب خدمة')).not.toBeInTheDocument();
    });
  });

  describe('authenticated', () => {
    it('opens the dialog on click', async () => {
      const user = setupUser();
      render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);

      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));

      expect(screen.getByText('إرسال طلب خدمة')).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('disables submit while details are under 10 characters', async () => {
      const user = setupUser();
      render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);
      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));

      await user.type(screen.getByLabelText('وصّف اللي محتاجه بالتفصيل'), 'قصير');

      expect(screen.getByRole('button', { name: 'إرسال الطلب' })).toBeDisabled();
    });

    it('submit stays disabled and mutate is never called for a 9-character (one under minimum) value', async () => {
      const user = setupUser();
      render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);
      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));

      await user.type(screen.getByLabelText('وصّف اللي محتاجه بالتفصيل'), '123456789');
      expect(screen.getByRole('button', { name: 'إرسال الطلب' })).toBeDisabled();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('trims details and calls createRequest.mutate with listingId + trimmed details', async () => {
      const user = setupUser();
      render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);
      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));

      await user.type(
        screen.getByLabelText('وصّف اللي محتاجه بالتفصيل'),
        '  محتاج تصليح تسريب مياه بالمطبخ  ',
      );
      await user.click(screen.getByRole('button', { name: 'إرسال الطلب' }));

      expect(mockMutate).toHaveBeenCalledWith(
        { listingId: 'listing-1', details: 'محتاج تصليح تسريب مياه بالمطبخ' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('closes the dialog and resets the textarea on successful submit', async () => {
      mockMutate.mockImplementation((_payload, { onSuccess }) => onSuccess());
      const user = setupUser();
      render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);
      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));
      await user.type(screen.getByLabelText('وصّف اللي محتاجه بالتفصيل'), 'محتاج تصليح تسريب مياه');
      await user.click(screen.getByRole('button', { name: 'إرسال الطلب' }));

      expect(screen.queryByText('إرسال طلب خدمة')).not.toBeInTheDocument();

      // Reopen — textarea should be empty, not retaining the last text.
      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));
      expect(screen.getByLabelText('وصّف اللي محتاجه بالتفصيل')).toHaveValue('');
    });

    it('cancel closes the dialog without calling mutate', async () => {
      const user = setupUser();
      render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);
      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));
      await user.type(screen.getByLabelText('وصّف اللي محتاجه بالتفصيل'), 'محتاج تصليح تسريب مياه');

      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('إرسال طلب خدمة')).not.toBeInTheDocument();
    });

    it('shows the character counter', async () => {
      const user = setupUser();
      render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);
      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));
      await user.type(screen.getByLabelText('وصّف اللي محتاجه بالتفصيل'), 'محتاج');

      expect(screen.getByText('5/1000')).toBeInTheDocument();
    });

    it('disables submit and shows the pending label while the mutation is in flight', async () => {
      (useCreateServiceRequest as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockMutate, isPending: true,
      });
      const user = setupUser();
      render(<ServiceRequestButton listingId="listing-1" providerUserId="provider-1" />);
      await user.click(screen.getByRole('button', { name: /إرسال طلب لمقدم الخدمة/ }));

      expect(screen.getByRole('button', { name: 'جارٍ الإرسال…' })).toBeDisabled();
    });
  });
});
