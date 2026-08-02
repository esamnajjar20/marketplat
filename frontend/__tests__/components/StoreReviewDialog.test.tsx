/**
 * __tests__/components/StoreReviewDialog.test.tsx
 *
 * Coverage targets:
 *  - Renders nothing when open=false
 *  - Renders the store name and title when open=true
 *  - Submit button is disabled until a star is picked (score < 1)
 *  - Clicking the Nth star sets the score to N (submit becomes enabled)
 *  - Clicking submit calls createReview.mutate with the chosen score
 *    and the trimmed comment (or undefined when blank)
 *  - Cancel button calls onOpenChange(false) without submitting
 *  - Submit button shows a pending label and is disabled while the
 *    mutation is in flight
 *  - The character counter reflects the comment's current length
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreReviewDialog } from '@/components/stores/StoreReviewDialog';
import { useCreateStoreReview } from '@/hooks/mutations/useStoreReviewMutations';

vi.mock('@/hooks/mutations/useStoreReviewMutations', () => ({
  useCreateStoreReview: vi.fn(),
}));

const mockMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (useCreateStoreReview as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: mockMutate, isPending: false,
  });
});

describe('StoreReviewDialog', () => {
  it('renders nothing when open=false', () => {
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجري" open={false} onOpenChange={vi.fn()} />
    );
    expect(screen.queryByText('تقييم المتجر')).not.toBeInTheDocument();
  });

  it('renders the title and store name when open=true', () => {
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجر أبو محمد" open={true} onOpenChange={vi.fn()} />
    );
    expect(screen.getByText('تقييم المتجر')).toBeInTheDocument();
    expect(screen.getByText('متجر أبو محمد')).toBeInTheDocument();
  });

  it('disables the submit button before any star is picked', () => {
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجري" open={true} onOpenChange={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'إرسال التقييم' })).toBeDisabled();
  });

  it('enables the submit button after picking a star', async () => {
    const user = userEvent.setup();
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجري" open={true} onOpenChange={vi.fn()} />
    );

    await user.click(screen.getByLabelText('3 نجوم'));
    expect(screen.getByRole('button', { name: 'إرسال التقييم' })).not.toBeDisabled();
  });

  it('submits the picked score and the trimmed comment', async () => {
    const user = userEvent.setup();
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجري" open={true} onOpenChange={vi.fn()} />
    );

    await user.click(screen.getByLabelText('4 نجوم'));
    await user.type(screen.getByLabelText('تعليق (اختياري)'), '  تجربة رائعة  ');
    await user.click(screen.getByRole('button', { name: 'إرسال التقييم' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { score: 4, comment: 'تجربة رائعة' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('submits comment: undefined when the comment field is left blank', async () => {
    const user = userEvent.setup();
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجري" open={true} onOpenChange={vi.fn()} />
    );

    await user.click(screen.getByLabelText('5 نجوم'));
    await user.click(screen.getByRole('button', { name: 'إرسال التقييم' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { score: 5, comment: undefined },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('does not submit when clicking submit with no star picked (button is disabled)', async () => {
    const user = userEvent.setup();
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجري" open={true} onOpenChange={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: 'إرسال التقييم' }));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls onOpenChange(false) when Cancel is clicked, without submitting', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجري" open={true} onOpenChange={onOpenChange} />
    );

    await user.click(screen.getByLabelText('5 نجوم'));
    await user.click(screen.getByRole('button', { name: 'إلغاء' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows a pending label and disables submit while the mutation is in flight', () => {
    (useCreateStoreReview as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate, isPending: true,
    });
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجري" open={true} onOpenChange={vi.fn()} />
    );

    const button = screen.getByRole('button', { name: 'جارٍ الإرسال…' });
    expect(button).toBeDisabled();
  });

  it('updates the character counter as the comment is typed', async () => {
    const user = userEvent.setup();
    render(
      <StoreReviewDialog storeId="store-1" storeName="متجري" open={true} onOpenChange={vi.fn()} />
    );

    expect(screen.getByText('0/500')).toBeInTheDocument();
    await user.type(screen.getByLabelText('تعليق (اختياري)'), 'مرحبا');
    expect(screen.getByText('5/500')).toBeInTheDocument();
  });
});
