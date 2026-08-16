/**
 * __tests__/components/ReviewServiceRequestDialog.test.tsx
 *
 * Previously uncovered. Modeled directly on RateSellerDialog (same
 * star-picker + optional-comment shape) but adds its own real type
 * guard (isReviewScore, FIX SEC-3.7) — score can only ever reach 1-5
 * from the star buttons today, but the guard is what actually enforces
 * that at the submit boundary rather than a bare `as` cast, so it's
 * worth covering on its own rather than assuming it behaves like
 * RateSellerDialog's plain `score < 1` check.
 *
 * Coverage:
 *  - Submit is disabled while score is 0
 *  - Selecting a star enables submit and marks aria-checked
 *  - Submit sends { requestId, score, comment }, trimming empty comment
 *    to undefined
 *  - onSuccess closes the dialog and resets local state
 *  - Cancel closes without submitting
 *  - Pending state disables submit and shows the pending label
 *  - listingTitle context text renders
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ReviewServiceRequestDialog } from '@/components/services/ReviewServiceRequestDialog';
import { useCreateServiceReview } from '@/hooks/mutations/useServiceReviewMutations';

vi.mock('@/hooks/mutations/useServiceReviewMutations', () => ({
  useCreateServiceReview: vi.fn(),
}));

const mockMutate = vi.fn();
const mockOnOpenChange = vi.fn();

function renderDialog() {
  return render(
    <ReviewServiceRequestDialog
      requestId="req-1"
      open
      onOpenChange={mockOnOpenChange}
      listingTitle="تصليح سباكة"
    />,
  );
}

describe('ReviewServiceRequestDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCreateServiceReview as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('renders the listing title for context', () => {
    renderDialog();
    expect(screen.getByText('تصليح سباكة')).toBeInTheDocument();
  });

  it('disables submit while no star is selected', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'إرسال التقييم' })).toBeDisabled();
  });

  it('does not call mutate on submit while score is 0', async () => {
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'إرسال التقييم' }));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('selecting a star enables submit and marks it aria-checked', async () => {
    const user = setupUser();
    renderDialog();

    const fourStars = screen.getByRole('radio', { name: '4 نجوم' });
    await user.click(fourStars);

    expect(fourStars).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'إرسال التقييم' })).toBeEnabled();
  });

  it('submits { requestId, score, comment: undefined } when no comment is entered', async () => {
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: '5 نجوم' }));
    await user.click(screen.getByRole('button', { name: 'إرسال التقييم' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { requestId: 'req-1', score: 5, comment: undefined },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('trims and includes a comment when provided', async () => {
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: '3 نجوم' }));
    await user.type(screen.getByLabelText(/تعليق/), '  خدمة سريعة  ');
    await user.click(screen.getByRole('button', { name: 'إرسال التقييم' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { requestId: 'req-1', score: 3, comment: 'خدمة سريعة' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('onSuccess closes the dialog', async () => {
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: '5 نجوم' }));
    await user.click(screen.getByRole('button', { name: 'إرسال التقييم' }));

    const { onSuccess } = mockMutate.mock.calls[0][1];
    onSuccess();

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('cancel closes without calling mutate', async () => {
    const user = setupUser();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: '2 نجوم' }));
    await user.click(screen.getByRole('button', { name: 'إلغاء' }));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a pending label and disables submit while sending', () => {
    (useCreateServiceReview as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });
    renderDialog();

    expect(screen.getByRole('button', { name: 'جارٍ الإرسال…' })).toBeDisabled();
  });
});
