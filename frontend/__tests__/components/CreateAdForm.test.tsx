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

describe('CreateAdForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (useCategories as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });
    (useCreateAd as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), isPending: false });
    (useUpdateAd as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), isPending: false });
    (useAddAdImages as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    (useRemoveAdImage as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    (useReorderAdImages as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  });

  it('renders AdForm in create mode with the "نشر الإعلان" submit label', () => {
    render(<CreateAdForm />);
    expect(screen.getByRole('button', { name: 'نشر الإعلان' })).toBeInTheDocument();
  });

  it('renders empty title/description fields (no ad to pre-fill from)', () => {
    render(<CreateAdForm />);
    expect(screen.getByLabelText(/عنوان الإعلان/)).toHaveValue('');
    expect(screen.getByLabelText(/الوصف/)).toHaveValue('');
  });
});
