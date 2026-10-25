/**
 * __tests__/components/EditAdForm.test.tsx
 *
 * EditAdForm is a one-line wrapper: <AdForm mode="edit" ad={ad} />.
 * AdForm's own validation/submit logic is already covered exhaustively
 * in AdForm.test.tsx — this file only pins down that the wrapper
 * passes the correct mode and forwards the ad for pre-filling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditAdForm } from '@/components/ads/EditAdForm';
import { useCategories } from '@/hooks/queries/useCategories';
import { useCreateAd, useUpdateAd, useAddAdImages, useRemoveAdImage, useReorderAdImages } from '@/hooks/mutations/useAdMutations';
import type { Ad } from '@/types/ad.types';

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

const existingAd: Ad = {
  id: 'ad-1',
  title: 'إعلان قديم للتعديل',
  description: 'وصف الإعلان القديم بما يكفي من الأحرف للمرور من التحقق',
  price: '500',
  isNegotiable: true,
  condition: 'USED',
  city: 'غزة',
  images: ['https://cdn.example.com/a.jpg'],
  status: 'ACTIVE',
  views: 10,
  isFeatured: false,
  isPinned: false,
  userId: 'user-1',
  sellerProfileId: 'sp-1',
  categoryId: 'cat-1',
  createdAt: new Date().toISOString(),
} as Ad;

describe('EditAdForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (useCategories as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });
    (useCreateAd as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), isPending: false });
    (useUpdateAd as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), isPending: false });
    (useAddAdImages as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    (useRemoveAdImage as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    (useReorderAdImages as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  });

  it('renders AdForm in edit mode with the "حفظ التعديلات" submit label', () => {
    render(<EditAdForm ad={existingAd} />);
    expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).toBeInTheDocument();
  });

  it('pre-fills the form fields from the given ad', () => {
    render(<EditAdForm ad={existingAd} />);
    expect(screen.getByLabelText(/عنوان الإعلان/)).toHaveValue(existingAd.title);
    expect(screen.getByLabelText(/الوصف/)).toHaveValue(existingAd.description);
  });
});
