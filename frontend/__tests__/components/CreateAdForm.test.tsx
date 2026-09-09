/**
 * __tests__/components/CreateAdForm.test.tsx
 *
 * CreateAdForm is a one-line wrapper: <AdForm mode="create" />.
 * AdForm's own validation/submit logic is already covered exhaustively
 * in AdForm.test.tsx — this file only pins down that the wrapper
 * passes the correct mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreateAdForm } from '@/components/ads/CreateAdForm';
import { useCategories } from '@/hooks/queries/useCategories';
import { useCreateAd, useUpdateAd, useAddAdImages, useRemoveAdImage, useReorderAdImages } from '@/hooks/mutations/useAdMutations';
import { useMyStore } from '@/hooks/queries/useStores';

vi.mock('@/hooks/queries/useCategories', () => ({
  useCategories: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdMutations', () => ({
  useCreateAd: vi.fn(),
  useUpdateAd: vi.fn(),
  useAddAdImages: vi.fn(),
  useRemoveAdImage: vi.fn(),
  useReorderAdImages: vi.fn(),
}));

vi.mock('@/components/shared/forms/ImageUpload', () => ({
  ImageUpload: () => <div data-testid="image-upload" />,
}));

// AdPublisherPicker (rendered in create mode) reads useMyStore() (react-
// query) — unmocked it throws for lack of a QueryClientProvider.
vi.mock('@/hooks/queries/useStores', () => ({
  useMyStore: vi.fn(() => ({ data: null, isLoading: false })),
}));

describe('CreateAdForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, isLoading: false });
    (useCategories as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });
    (useCreateAd as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), isPending: false });
    (useUpdateAd as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), isPending: false });
    (useAddAdImages as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    (useRemoveAdImage as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    (useReorderAdImages as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  });

  it('renders AdForm in create mode as a multi-step publish wizard', () => {
    render(<CreateAdForm />);
    // Create mode is a wizard — the final "نشر الإعلان" submit only appears
    // on the last step. Pin create-mode via the wizard chrome instead.
    expect(screen.getByLabelText('خطوات نشر الإعلان')).toBeInTheDocument();
    expect(screen.getByText(/الخطوة 1 من/)).toBeInTheDocument();
  });

  it('renders empty title/description fields (no ad to pre-fill from)', () => {
    render(<CreateAdForm />);
    expect(screen.getByLabelText(/عنوان الإعلان/)).toHaveValue('');
    expect(screen.getByLabelText(/الوصف/)).toHaveValue('');
  });
});
