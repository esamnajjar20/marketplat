/**
 * __tests__/components/AdForm.test.tsx
 *
 * Coverage for components/ads/AdForm.tsx — the single form powering
 * both CreateAdForm and EditAdForm (thin wrappers passing mode="create"
 * / mode="edit"), so testing AdForm directly with both modes covers
 * all three files.
 *
 * Highest-value branches:
 *  - images are required on create but NOT on edit (an ad with
 *    existing images shouldn't be forced to re-upload)
 *  - edit mode builds a payload WITHOUT `images` (I-04: image changes
 *    go through separate add/remove endpoints, not the PATCH body)
 *  - on submit, the removed-vs-original image diff is computed
 *    correctly and only the actually-removed URLs are sent to
 *    removeImage; newly added files go through addImages
 *  - price is parsed to a number when provided, and omitted (not 0 or
 *    NaN) when left blank
 *  - FIX BUG-07: image reconciliation (remove/add) is now awaited
 *    BEFORE updateAd — the mutation that actually navigates away — is
 *    called at all, and a failed image step must block updateAd
 *    entirely rather than navigating past a half-applied edit
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdForm } from '@/components/ads/AdForm';
import { useCategories } from '@/hooks/queries/useCategories';
import { useCreateAd, useUpdateAd, useAddAdImages, useRemoveAdImage } from '@/hooks/mutations/useAdMutations';
import type { Ad } from '@/types/ad.types';

vi.mock('@/hooks/queries/useCategories', () => ({
  useCategories: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdMutations', () => ({
  useCreateAd: vi.fn(),
  useUpdateAd: vi.fn(),
  useAddAdImages: vi.fn(),
  useRemoveAdImage: vi.fn(),
}));

// ImageUpload has its own dedicated test suite (ImageUpload.test.tsx) —
// stub it here to isolate AdForm's own validation/submit logic from
// ImageUpload's internal file-picker behavior.
vi.mock('@/components/shared/forms/ImageUpload', () => ({
  ImageUpload: ({ existingUrls, onRemoveExisting }: any) => (
    <div data-testid="image-upload">
      {existingUrls?.map((url: string) => (
        <button key={url} onClick={() => onRemoveExisting?.(url)}>
          Remove {url}
        </button>
      ))}
    </div>
  ),
}));

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockAddImagesMutate = vi.fn();
const mockAddImagesMutateAsync = vi.fn();
const mockRemoveImageMutate = vi.fn();
const mockRemoveImageMutateAsync = vi.fn();

const existingAd: Ad = {
  id: 'ad-1',
  title: 'إعلان قديم للتعديل',
  description: 'وصف الإعلان القديم بما يكفي من الأحرف للمرور من التحقق',
  price: '500',
  isNegotiable: true,
  condition: 'USED',
  city: 'غزة',
  images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  status: 'ACTIVE',
  views: 10,
  isFeatured: false,
  isPinned: false,
  userId: 'user-1',
  sellerProfileId: 'sp-1',
  categoryId: 'cat-1',
  createdAt: new Date().toISOString(),
} as Ad;

describe('AdForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (useCategories as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });
    (useCreateAd as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockCreateMutate, isPending: false,
    });
    (useUpdateAd as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockUpdateMutate, isPending: false,
    });
    (useAddAdImages as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockAddImagesMutate,
      mutateAsync: mockAddImagesMutateAsync.mockResolvedValue(undefined),
      isPending: false,
    });
    (useRemoveAdImage as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockRemoveImageMutate,
      mutateAsync: mockRemoveImageMutateAsync.mockResolvedValue(undefined),
      isPending: false,
    });
  });

  async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/عنوان الإعلان/), 'إعلان تجريبي جديد');
    await user.type(
      screen.getByLabelText(/الوصف/),
      'هذا وصف تجريبي طويل بما فيه الكفاية لاجتياز التحقق من طول العشرين حرفاً',
    );
    // The city field is a Radix Select (role="combobox"); its options
    // only mount in the DOM once the trigger is opened, so
    // selectOptions can't act on it directly — open it, then click.
    await user.click(screen.getByLabelText(/المدينة/));
    await user.click(await screen.findByRole('option', { name: 'غزة' }));
  }

  // AdForm's isFormIncomplete guard (title≥5, description≥20, city set)
  // keeps the submit button disabled for every one of these scenarios
  // by design, so a plain click on it would be a no-op — Enter in the
  // last-touched field submits the <form> the same way it would for a
  // real user, exercising validate()'s error paths instead.
  describe('validation', () => {
    it('requires a title of at least 5 characters', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="create" />);

      await user.type(screen.getByLabelText(/عنوان الإعلان/), 'قصير{Enter}');

      expect(screen.getByText('العنوان قصير جداً (5 أحرف على الأقل)')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires a description of at least 20 characters', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="create" />);

      const titleInput = screen.getByLabelText(/عنوان الإعلان/);
      await user.type(titleInput, 'عنوان صالح للإعلان');
      // The description field is a <textarea>: Enter there inserts a
      // newline instead of submitting, unlike a plain <input> — so type
      // it in full first, then submit via Enter back in the title field.
      await user.type(screen.getByLabelText(/الوصف/), 'قصير جداً');
      await user.type(titleInput, '{Enter}');

      expect(screen.getByText('الوصف قصير جداً (20 حرفاً على الأقل)')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires a city', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="create" />);

      const titleInput = screen.getByLabelText(/عنوان الإعلان/);
      await user.type(titleInput, 'عنوان صالح للإعلان');
      // Same textarea caveat as above: fill it in full first (no
      // trailing Enter there), then submit via Enter in the title field.
      await user.type(
        screen.getByLabelText(/الوصف/),
        'هذا وصف تجريبي طويل بما فيه الكفاية لاجتياز التحقق من طول العشرين حرفاً',
      );
      await user.type(titleInput, '{Enter}');

      expect(screen.getByText('المدينة مطلوبة')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires at least one image in create mode when there are no files and no existing images', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="create" />);

      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: 'نشر الإعلان' }));

      expect(screen.getByText('أضف صورة واحدة على الأقل')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('does NOT require an image in edit mode when the ad already has existing images', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="edit" ad={existingAd} />);

      // Fields are pre-filled from `ad` — just submit directly.
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      expect(screen.queryByText('أضف صورة واحدة على الأقل')).not.toBeInTheDocument();
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
    });
  });

  describe('create mode submission', () => {
    it('builds the full create payload with trimmed title/description and optional fields', async () => {
      const user = userEvent.setup();
      // AdForm only requires ad to be undefined for its *default* state;
      // passing an ad with images while mode="create" exercises the
      // create payload-building branch past the image-required check,
      // since the check only looks at values.images/.existingImages
      // lengths, not at `mode` alone.
      render(<AdForm mode="create" ad={{ ...existingAd, categoryId: null }} />);

      const titleInput = screen.getByLabelText(/عنوان الإعلان/) as HTMLInputElement;
      await user.clear(titleInput);
      await user.type(titleInput, '  عنوان بمسافات زائدة  ');

      await user.click(screen.getByRole('button', { name: 'نشر الإعلان' }));

      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'عنوان بمسافات زائدة',
          city: existingAd.city,
          isNegotiable: existingAd.isNegotiable,
          images: [],
        }),
      );
    });

    it('omits condition and categoryId from the payload when left unset', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="create" ad={{ ...existingAd, condition: null, categoryId: null }} />);

      await user.click(screen.getByRole('button', { name: 'نشر الإعلان' }));

      const [payload] = mockCreateMutate.mock.calls[0];
      expect(payload.condition).toBeUndefined();
      expect(payload.categoryId).toBeUndefined();
    });

    it('parses the price field to a number when provided', async () => {
      const user = userEvent.setup();
      // Edit mode conveniently starts with existing images already
      // populated, letting us reach past the image-required branch to
      // assert on price parsing in the submitted payload.
      render(<AdForm mode="edit" ad={{ ...existingAd, price: null }} />);

      const priceInput = screen.getByRole('spinbutton') as HTMLInputElement;
      await user.clear(priceInput);
      await user.type(priceInput, '750.50');
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ price: 750.5 }),
      ));
    });

    it('omits price entirely (not 0, not NaN) when the price field is left blank', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="edit" ad={{ ...existingAd, price: null }} />);

      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload.price).toBeUndefined();
    });
  });

  describe('edit mode submission — image reconciliation (I-04)', () => {
    it('builds the PATCH payload WITHOUT an images field', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="edit" ad={existingAd} />);

      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload).not.toHaveProperty('images');
    });

    it('calls removeImage.mutateAsync only for URLs the user actually removed', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="edit" ad={existingAd} />);

      // Remove one of the two existing images via the stubbed ImageUpload.
      await user.click(screen.getByText(`Remove ${existingAd.images[0]}`));
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockRemoveImageMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockRemoveImageMutateAsync).toHaveBeenCalledWith({
        id: existingAd.id,
        imageUrl: existingAd.images[0],
      });
      // The image that was NOT removed must not trigger a removeImage call.
      expect(mockRemoveImageMutateAsync).not.toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: existingAd.images[1] }),
      );
    });

    it('does not call removeImage at all when no existing images were removed', async () => {
      const user = userEvent.setup();
      render(<AdForm mode="edit" ad={existingAd} />);
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      expect(mockRemoveImageMutateAsync).not.toHaveBeenCalled();
    });

    // FIX BUG-07: this is the actual bug from the audit report — image
    // reconciliation used to fire without awaiting inside updateAd's
    // onSuccess, so it raced the redirect that same onSuccess triggers.
    // These pin down the fix: image mutations resolve BEFORE updateAd
    // is ever called, and a failed image step blocks updateAd entirely.
    describe('sequencing (FIX BUG-07)', () => {
      it('awaits removeImage before calling updateAd at all', async () => {
        const callOrder: string[] = [];
        mockRemoveImageMutateAsync.mockImplementation(async () => {
          callOrder.push('removeImage:start');
          await Promise.resolve();
          callOrder.push('removeImage:end');
        });
        mockUpdateMutate.mockImplementation(() => callOrder.push('updateAd'));

        const user = userEvent.setup();
        render(<AdForm mode="edit" ad={existingAd} />);
        await user.click(screen.getByText(`Remove ${existingAd.images[0]}`));
        await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

        await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
        expect(callOrder).toEqual(['removeImage:start', 'removeImage:end', 'updateAd']);
      });

      it('never calls addImages when no new files were queued', async () => {
        const user = userEvent.setup();
        render(<AdForm mode="edit" ad={existingAd} />);
        await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

        await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
        expect(mockAddImagesMutateAsync).not.toHaveBeenCalled();
      });

      it('does NOT call updateAd when removeImage fails, so a failed image step cannot navigate the user away from a half-applied edit', async () => {
        mockRemoveImageMutateAsync.mockRejectedValue(new Error('network error'));

        const user = userEvent.setup();
        render(<AdForm mode="edit" ad={existingAd} />);
        await user.click(screen.getByText(`Remove ${existingAd.images[0]}`));
        await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

        await waitFor(() => expect(mockRemoveImageMutateAsync).toHaveBeenCalledTimes(1));
        expect(mockUpdateMutate).not.toHaveBeenCalled();
      });

      it('re-enables the submit button after a failed image step instead of leaving it stuck loading', async () => {
        mockRemoveImageMutateAsync.mockRejectedValue(new Error('network error'));

        const user = userEvent.setup();
        render(<AdForm mode="edit" ad={existingAd} />);
        await user.click(screen.getByText(`Remove ${existingAd.images[0]}`));
        await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).not.toBeDisabled(),
        );
      });
    });
  });

  describe('pending state', () => {
    it('disables submit and shows the loading label when any underlying mutation is pending', () => {
      (useAddAdImages as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockAddImagesMutate, isPending: true,
      });
      render(<AdForm mode="edit" ad={existingAd} />);

      expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
    });

    it('shows "نشر الإعلان" in create mode and "حفظ التعديلات" in edit mode when idle', () => {
      const { rerender } = render(<AdForm mode="create" />);
      expect(screen.getByRole('button', { name: 'نشر الإعلان' })).toBeInTheDocument();

      rerender(<AdForm mode="edit" ad={existingAd} />);
      expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).toBeInTheDocument();
    });
  });

  describe('pre-filled values in edit mode', () => {
    it('pre-fills the form fields from the given ad', () => {
      render(<AdForm mode="edit" ad={existingAd} />);

      expect(screen.getByLabelText(/عنوان الإعلان/)).toHaveValue(existingAd.title);
      expect(screen.getByLabelText(/الوصف/)).toHaveValue(existingAd.description);
      expect(screen.getByRole('spinbutton')).toHaveValue(500);
    });
  });
});
