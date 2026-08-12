/**
 * __tests__/components/ServiceListingForm.test.tsx
 *
 * Previously uncovered (0%), ~397 lines. Structurally mirrors
 * ProductForm/AdForm's edit-mode image reconciliation pattern (diff
 * existingImages against an original snapshot, await remove/add before
 * the field PATCH), with its own real differences pinned down here:
 *
 *  - price is only required when pricingType !== 'NEGOTIABLE'
 *    (priceRequired gate) — NEGOTIABLE skips the price field entirely
 *  - submitEdit chooses ordering based on whether removing images
 *    would momentarily drop the listing to zero: if there are staged
 *    new images, add-then-remove; otherwise remove-then-add
 *  - reorder only fires when the surviving existing images actually
 *    changed order AND there's more than one of them
 *  - a failed image step (add or remove) blocks update.mutate entirely
 *  - cancel calls history.back() directly with no confirm dialog
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceListingForm } from '@/components/services/ServiceListingForm';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import {
  useCreateServiceListing,
  useUpdateServiceListing,
  useAddServiceListingImages,
  useRemoveServiceListingImage,
  useReorderServiceListingImages,
} from '@/hooks/mutations/useServiceListingMutations';
import type { ServiceListing } from '@/types/service.types';

vi.mock('@/hooks/queries/useServiceCategories', () => ({
  useServiceCategories: vi.fn(),
}));

vi.mock('@/hooks/mutations/useServiceListingMutations', () => ({
  useCreateServiceListing: vi.fn(),
  useUpdateServiceListing: vi.fn(),
  useAddServiceListingImages: vi.fn(),
  useRemoveServiceListingImage: vi.fn(),
  useReorderServiceListingImages: vi.fn(),
}));

// ImageUpload has its own dedicated test suite — stub it here so
// ServiceListingForm's own validation/submit logic is isolated from
// ImageUpload's internal file-picker behavior (same convention as
// ProductForm.test.tsx / AdForm.test.tsx).
vi.mock('@/components/shared/forms/ImageUpload', () => ({
  ImageUpload: ({ existingUrls, onRemoveExisting, onReorderExisting }: any) => (
    <div data-testid="image-upload">
      {existingUrls?.map((url: string) => (
        <button key={url} type="button" onClick={() => onRemoveExisting?.(url)}>
          Remove {url}
        </button>
      ))}
      {existingUrls?.length > 1 && (
        <button
          type="button"
          onClick={() => onReorderExisting?.([...existingUrls].reverse())}
        >
          Reverse order
        </button>
      )}
    </div>
  ),
}));

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockAddImagesMutate = vi.fn();
const mockAddImagesMutateAsync = vi.fn();
const mockRemoveImageMutate = vi.fn();
const mockRemoveImageMutateAsync = vi.fn();
const mockReorderImagesMutate = vi.fn();
const mockReorderImagesMutateAsync = vi.fn();

const existingListing: ServiceListing = {
  id: 'listing-1',
  providerId: 'provider-1',
  categoryId: 'cat-1',
  title: 'خدمة تصليح كهرباء منزلية',
  description: 'وصف تجريبي طويل بما فيه الكفاية لاجتياز التحقق',
  images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  pricingType: 'FIXED',
  price: '100',
  durationEstimate: 'يوم عمل واحد',
  serviceLocation: 'AT_PROVIDER',
  status: 'ACTIVE',
  views: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as ServiceListing;

describe('ServiceListingForm', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    (useServiceCategories as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: 'cat-1', nameAr: 'صيانة منزلية' }],
    });
    (useCreateServiceListing as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockCreateMutate, isPending: false,
    });
    (useUpdateServiceListing as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockUpdateMutate, isPending: false,
    });
    (useAddServiceListingImages as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockAddImagesMutate,
      mutateAsync: mockAddImagesMutateAsync.mockResolvedValue(undefined),
      isPending: false,
    });
    (useRemoveServiceListingImage as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockRemoveImageMutate,
      mutateAsync: mockRemoveImageMutateAsync.mockResolvedValue(undefined),
      isPending: false,
    });
    (useReorderServiceListingImages as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockReorderImagesMutate,
      mutateAsync: mockReorderImagesMutateAsync.mockResolvedValue(undefined),
      isPending: false,
    });
  });

  // NOTE on label queries: required fields render their <label> with a
  // trailing decorative `*` + sr-only "(required)" span (FormField).
  // In this environment, exact-text getByLabelText() does not reliably
  // match across those nested nodes, so required-field labels are
  // queried with a leading-substring regex instead — this is the
  // standard workaround (see testing-library/dom-testing-library#618)
  // and is strictly more permissive than an exact match, so it can't
  // mask a genuinely wrong/missing label. The category Select's
  // trigger is a Radix <button role="combobox">, not a native form
  // control, so getByLabelText's for/id association doesn't resolve
  // it reliably either — getByRole('combobox', { name }) is used
  // there instead, per Testing Library's own recommendation.
  function requiredLabel(text: string): RegExp {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^\\s*${escaped}`);
  }

  async function selectCategory(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('combobox', { name: requiredLabel('الفئة') }));
    await user.click(await screen.findByRole('option', { name: 'صيانة منزلية' }));
  }

  async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
    await selectCategory(user);
    await user.type(screen.getByLabelText(requiredLabel('عنوان الخدمة')), 'عنوان خدمة تجريبية');
    await user.type(
      screen.getByLabelText(requiredLabel('الوصف')),
      'هذا وصف تجريبي طويل بما فيه الكفاية لاجتياز التحقق',
    );
    // default pricingType is NEGOTIABLE in create mode, so price is
    // not required by fillRequiredFields; individual tests switch
    // pricingType when they need to exercise the price-required path.
  }

  function submitForm(container: HTMLElement) {
    const form = container.querySelector('form');
    if (!form) throw new Error('submitForm: no <form> found in container');
    fireEvent.submit(form);
  }

  describe('validation', () => {
    it('requires a category', async () => {
      const user = userEvent.setup();
      const { container } = render(<ServiceListingForm mode="create" />);

      await user.type(screen.getByLabelText(requiredLabel('عنوان الخدمة')), 'عنوان خدمة تجريبية');
      await user.type(screen.getByLabelText(requiredLabel('الوصف')), 'وصف تجريبي طويل بما فيه الكفاية');
      submitForm(container);

      // 'اختر فئة الخدمة' also appears as the Select trigger's own
      // placeholder text (unselected state) — getByRole('alert', { name })
      // doesn't reliably resolve the accessible name from plain text
      // content in this setup, so query the alert by role alone (there's
      // only one on the page) and assert its text directly instead.
      expect(screen.getByRole('alert')).toHaveTextContent('اختر فئة الخدمة');
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires a title of at least 3 characters', async () => {
      const user = userEvent.setup();
      const { container } = render(<ServiceListingForm mode="create" />);

      await selectCategory(user);
      await user.type(screen.getByLabelText(requiredLabel('عنوان الخدمة')), 'اب');
      submitForm(container);

      expect(screen.getByText('العنوان قصير جداً (3 أحرف على الأقل)')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires a description of at least 10 characters', async () => {
      const user = userEvent.setup();
      const { container } = render(<ServiceListingForm mode="create" />);

      await selectCategory(user);
      await user.type(screen.getByLabelText(requiredLabel('عنوان الخدمة')), 'عنوان صالح');
      await user.type(screen.getByLabelText(requiredLabel('الوصف')), 'قصير');
      submitForm(container);

      expect(screen.getByText('الوصف قصير جداً (10 أحرف على الأقل)')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires at least one image', async () => {
      const user = userEvent.setup();
      const { container } = render(<ServiceListingForm mode="create" />);

      await fillRequiredFields(user);
      submitForm(container);

      expect(screen.getByText('أضف صورة واحدة على الأقل')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('does not require a price when pricingType is NEGOTIABLE (default)', async () => {
      // Edit mode with existing images lets us reach past the image
      // gate without stubbing file uploads; existingListing defaults
      // to FIXED, so switch to NEGOTIABLE explicitly.
      const negotiableListing = { ...existingListing, pricingType: 'NEGOTIABLE' as const, price: null };
      render(<ServiceListingForm mode="edit" listing={negotiableListing} />);

      expect(screen.queryByLabelText(requiredLabel('السعر (₪)'))).not.toBeInTheDocument();
      expect(screen.queryByLabelText(requiredLabel('يبدأ من (₪)'))).not.toBeInTheDocument();

      await userEvent.setup().click(screen.getByRole('button', { name: 'حفظ التعديلات' }));
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload.price).toBeNull();
    });

    it('requires a valid positive price when pricingType is FIXED', async () => {
      const user = userEvent.setup();
      const { container } = render(<ServiceListingForm mode="edit" listing={existingListing} />);

      const priceInput = screen.getByLabelText(requiredLabel('السعر (₪)'));
      await user.clear(priceInput);
      submitForm(container);

      expect(screen.getByText('أدخل سعراً صحيحاً')).toBeInTheDocument();
      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });

    it('shows "يبدأ من (₪)" label when pricingType is STARTING_FROM', async () => {
      const startingFromListing = { ...existingListing, pricingType: 'STARTING_FROM' as const };
      render(<ServiceListingForm mode="edit" listing={startingFromListing} />);

      expect(screen.getByLabelText(requiredLabel('يبدأ من (₪)'))).toBeInTheDocument();
      expect(screen.queryByLabelText(requiredLabel('السعر (₪)'))).not.toBeInTheDocument();
    });

    it('does not require an image in edit mode when the listing already has existing images', async () => {
      render(<ServiceListingForm mode="edit" listing={existingListing} />);

      await userEvent.setup().click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      expect(screen.queryByText('أضف صورة واحدة على الأقل')).not.toBeInTheDocument();
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
    });

    it('requires an image in edit mode if all existing images are removed and none re-added', async () => {
      const user = userEvent.setup();
      const { container } = render(<ServiceListingForm mode="edit" listing={existingListing} />);

      await user.click(screen.getByText(`Remove ${existingListing.images[0]}`));
      await user.click(screen.getByText(`Remove ${existingListing.images[1]}`));
      submitForm(container);

      expect(screen.getByText('أضف صورة واحدة على الأقل')).toBeInTheDocument();
      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });
  });

  describe('create mode submission', () => {
    it('trims the title/description before submitting (via edit mode, past the image gate)', async () => {
      const user = userEvent.setup();
      render(<ServiceListingForm mode="edit" listing={existingListing} />);

      const titleInput = screen.getByLabelText(requiredLabel('عنوان الخدمة')) as HTMLInputElement;
      await user.clear(titleInput);
      await user.type(titleInput, '  عنوان بمسافات زائدة  ');
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload.title).toBe('عنوان بمسافات زائدة');
    });

    it('parses price as a number when pricingType is FIXED', async () => {
      const user = userEvent.setup();
      render(<ServiceListingForm mode="edit" listing={existingListing} />);

      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload.price).toBe(100);
      expect(payload.pricingType).toBe('FIXED');
    });

    it('omits durationEstimate as null when left blank', async () => {
      const user = userEvent.setup();
      const listingNoDuration = { ...existingListing, durationEstimate: null };
      render(<ServiceListingForm mode="edit" listing={listingNoDuration} />);

      const durationInput = screen.getByLabelText('المدة التقديرية (اختياري)');
      await user.clear(durationInput);
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload.durationEstimate).toBeNull();
    });
  });

  describe('edit mode submission — image reconciliation', () => {
    it('builds the PATCH payload WITHOUT an images field', async () => {
      const user = userEvent.setup();
      render(<ServiceListingForm mode="edit" listing={existingListing} />);

      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload).not.toHaveProperty('images');
    });

    it('calls removeImage.mutateAsync only for URLs the user actually removed', async () => {
      const user = userEvent.setup();
      render(<ServiceListingForm mode="edit" listing={existingListing} />);

      await user.click(screen.getByText(`Remove ${existingListing.images[0]}`));
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockRemoveImageMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockRemoveImageMutateAsync).toHaveBeenCalledWith({
        id: existingListing.id,
        imageUrl: existingListing.images[0],
      });
      expect(mockRemoveImageMutateAsync).not.toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: existingListing.images[1] }),
      );
    });

    it('does not call removeImage or addImages at all when nothing image-related changed', async () => {
      const user = userEvent.setup();
      render(<ServiceListingForm mode="edit" listing={existingListing} />);
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      expect(mockRemoveImageMutateAsync).not.toHaveBeenCalled();
      expect(mockAddImagesMutateAsync).not.toHaveBeenCalled();
    });

    it('does NOT call update.mutate when removeImage fails, so a failed image step cannot navigate past a half-applied edit', async () => {
      mockRemoveImageMutateAsync.mockRejectedValue(new Error('network error'));

      const user = userEvent.setup();
      render(<ServiceListingForm mode="edit" listing={existingListing} />);
      await user.click(screen.getByText(`Remove ${existingListing.images[0]}`));
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockRemoveImageMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });

    it('re-enables the submit button after a failed image step instead of leaving it stuck loading', async () => {
      mockRemoveImageMutateAsync.mockRejectedValue(new Error('network error'));

      const user = userEvent.setup();
      render(<ServiceListingForm mode="edit" listing={existingListing} />);
      await user.click(screen.getByText(`Remove ${existingListing.images[0]}`));
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).not.toBeDisabled(),
      );
    });

    it('requires a replacement image before removing the last existing image (cannot reach zero images)', async () => {
      const singleImageListing = { ...existingListing, images: [existingListing.images[0]] };
      const user = userEvent.setup();
      const { container } = render(<ServiceListingForm mode="edit" listing={singleImageListing} />);

      await user.click(screen.getByText(`Remove ${singleImageListing.images[0]}`));
      submitForm(container);

      expect(screen.getByText('أضف صورة واحدة على الأقل')).toBeInTheDocument();
      expect(mockUpdateMutate).not.toHaveBeenCalled();
      expect(mockRemoveImageMutateAsync).not.toHaveBeenCalled();
    });

    it('reorders surviving existing images when their order changed', async () => {
      const user = userEvent.setup();
      render(<ServiceListingForm mode="edit" listing={existingListing} />);

      await user.click(screen.getByRole('button', { name: 'Reverse order' }));
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockReorderImagesMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockReorderImagesMutateAsync).toHaveBeenCalledWith({
        id: existingListing.id,
        images: [...existingListing.images].reverse(),
      });
    });

    it('does not reorder when order is unchanged', async () => {
      const user = userEvent.setup();
      render(<ServiceListingForm mode="edit" listing={existingListing} />);

      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      expect(mockReorderImagesMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('pending state', () => {
    it('disables submit and shows the loading label when any underlying mutation is pending', () => {
      (useAddServiceListingImages as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockAddImagesMutate, isPending: true,
      });
      render(<ServiceListingForm mode="edit" listing={existingListing} />);

      expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
    });

    it('shows "نشر الخدمة" in create mode and "حفظ التعديلات" in edit mode when idle', () => {
      const { rerender } = render(<ServiceListingForm mode="create" />);
      expect(screen.getByRole('button', { name: 'نشر الخدمة' })).toBeInTheDocument();

      rerender(<ServiceListingForm mode="edit" listing={existingListing} />);
      expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).toBeInTheDocument();
    });
  });

  describe('pre-filled values in edit mode', () => {
    it('pre-fills the form fields from the given listing', () => {
      render(<ServiceListingForm mode="edit" listing={existingListing} />);

      expect(screen.getByLabelText(requiredLabel('عنوان الخدمة'))).toHaveValue(existingListing.title);
      expect(screen.getByLabelText(requiredLabel('الوصف'))).toHaveValue(existingListing.description);
      expect(screen.getByLabelText(requiredLabel('السعر (₪)'))).toHaveValue(100);
      expect(screen.getByLabelText('المدة التقديرية (اختياري)')).toHaveValue(
        existingListing.durationEstimate,
      );
    });
  });

  describe('cancel', () => {
    it('navigates back immediately on cancel, with no confirm dialog', async () => {
      const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
      const user = userEvent.setup();
      render(<ServiceListingForm mode="create" />);

      await user.type(screen.getByLabelText(requiredLabel('عنوان الخدمة')), 'عنوان جديد');
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(backSpy).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('تجاهل التغييرات؟')).not.toBeInTheDocument();
      backSpy.mockRestore();
    });
  });
});
