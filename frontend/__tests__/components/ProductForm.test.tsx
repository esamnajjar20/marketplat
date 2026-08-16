/**
 * __tests__/components/ProductForm.test.tsx
 *
 * Previously uncovered (0%), largest single file in the coverage gap
 * (~404 lines). Powers both create and edit product flows. Structurally
 * mirrors AdForm (already tested) — same edit-mode image reconciliation
 * pattern (diff existingImages against an original snapshot, await
 * remove/add before the field PATCH) — but with two real differences
 * pinned down here instead of assumed:
 *
 *  - unlike AdForm, ProductForm's "at least one image" rule is NOT
 *    temporarily disabled — it's live in both create and edit mode
 *  - ProductForm's cancel button calls history.back() directly with no
 *    confirm-discard dialog (AdForm has one; ProductForm does not)
 *
 * Other high-value branches:
 *  - discountPrice must be less than price
 *  - wholesalePrice and wholesaleMinQty must be given together or not at all
 *  - edit mode builds a payload WITHOUT `images` (image changes go
 *    through addImages/removeImage, not the PATCH body)
 *  - removeImage is only called for URLs actually removed, in the
 *    zero-image "add-before-remove" order when removal would otherwise
 *    momentarily drop the product to zero images
 *  - a failed image step blocks update.mutate entirely
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ProductForm } from '@/components/stores/ProductForm';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import {
  useCreateProduct,
  useUpdateProduct,
  useAddProductImages,
  useRemoveProductImage,
  useReorderProductImages,
} from '@/hooks/mutations/useProductMutations';
import type { Product } from '@/types/product.types';

vi.mock('@/hooks/queries/useProductCategories', () => ({
  useProductCategories: vi.fn(),
}));

vi.mock('@/hooks/mutations/useProductMutations', () => ({
  useCreateProduct: vi.fn(),
  useUpdateProduct: vi.fn(),
  useAddProductImages: vi.fn(),
  useRemoveProductImage: vi.fn(),
  useReorderProductImages: vi.fn(),
}));

// ImageUpload has its own dedicated test suite — stub it here so
// ProductForm's own validation/submit logic is isolated from
// ImageUpload's internal file-picker behavior (same convention as
// AdForm.test.tsx).
vi.mock('@/components/shared/forms/ImageUpload', () => ({
  ImageUpload: ({ existingUrls, onRemoveExisting }: any) => (
    <div data-testid="image-upload">
      {existingUrls?.map((url: string) => (
        // type="button": this stub renders inside ProductForm's real
        // <form> — a button with no explicit type defaults to
        // type="submit" and would double-fire handleSubmit.
        <button key={url} type="button" onClick={() => onRemoveExisting?.(url)}>
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
const mockReorderImagesMutate = vi.fn();
const mockReorderImagesMutateAsync = vi.fn();

const existingProduct: Product = {
  id: 'product-1',
  storeId: 'store-1',
  categoryId: 'cat-1',
  name: 'منتج قديم للتعديل',
  description: 'وصف تجريبي للمنتج القديم بما يكفي من الأحرف',
  images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  price: '100',
  wholesalePrice: null,
  wholesaleMinQty: null,
  discountPrice: null,
  availability: 'IN_STOCK',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
} as Product;

describe('ProductForm', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    (useProductCategories as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: 'cat-1', nameAr: 'إلكترونيات' }],
    });
    (useCreateProduct as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockCreateMutate, isPending: false,
    });
    (useUpdateProduct as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockUpdateMutate, isPending: false,
    });
    (useAddProductImages as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockAddImagesMutate,
      mutateAsync: mockAddImagesMutateAsync.mockResolvedValue(undefined),
      isPending: false,
    });
    (useRemoveProductImage as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockRemoveImageMutate,
      mutateAsync: mockRemoveImageMutateAsync.mockResolvedValue(undefined),
      isPending: false,
    });
    (useReorderProductImages as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockReorderImagesMutate,
      mutateAsync: mockReorderImagesMutateAsync.mockResolvedValue(undefined),
      isPending: false,
    });
  });

  // FormField renders required fields as
  // <label>اسم المنتج<span aria-hidden>*</span><span class="sr-only">(required)</span></label>
  // — getByLabelText matches against the label's full textContent, so an
  // exact string like 'اسم المنتج' never matches once the required
  // decoration is appended. Match by prefix instead.
  function getField(label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return screen.getByLabelText(new RegExp(`^${escaped}`));
  }

  async function selectCategory(user: ReturnType<typeof setupUser>) {
    await user.click(getField('الفئة'));
    await user.click(await screen.findByRole('option', { name: 'إلكترونيات' }));
  }

  async function fillRequiredFields(user: ReturnType<typeof setupUser>) {
    await selectCategory(user);
    await user.type(getField('اسم المنتج'), 'منتج تجريبي جديد');
    await user.type(
      getField('الوصف'),
      'هذا وصف تجريبي طويل بما فيه الكفاية لاجتياز التحقق',
    );
    await user.type(getField('السعر (₪)'), '50');
  }

  // isFormIncomplete keeps the submit button disabled for every
  // validation scenario below by definition, so submit the <form>
  // directly rather than clicking a disabled button.
  function submitForm(container: HTMLElement) {
    const form = container.querySelector('form');
    if (!form) throw new Error('submitForm: no <form> found in container');
    fireEvent.submit(form);
  }

  describe('validation', () => {
    it('requires a category', async () => {
      const user = setupUser();
      const { container } = render(<ProductForm mode="create" />);

      await user.type(getField('اسم المنتج'), 'منتج تجريبي جديد');
      await user.type(getField('الوصف'), 'وصف تجريبي طويل بما فيه الكفاية');
      await user.type(getField('السعر (₪)'), '50');
      submitForm(container);

      // The Select's own placeholder text is identical to the validation
      // error message, so getByText matches both — scope to the actual
      // error element (role="alert") instead.
      expect(screen.getByRole('alert')).toHaveTextContent('اختر فئة المنتج');
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires a name of at least 2 characters', async () => {
      const user = setupUser();
      const { container } = render(<ProductForm mode="create" />);

      await selectCategory(user);
      await user.type(getField('اسم المنتج'), 'ا');
      submitForm(container);

      expect(screen.getByText('اسم المنتج قصير جداً')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires a description of at least 10 characters', async () => {
      const user = setupUser();
      const { container } = render(<ProductForm mode="create" />);

      await selectCategory(user);
      await user.type(getField('اسم المنتج'), 'منتج صالح');
      await user.type(getField('الوصف'), 'قصير');
      submitForm(container);

      expect(screen.getByText('الوصف قصير جداً (10 أحرف على الأقل)')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires a valid positive price', async () => {
      const user = setupUser();
      const { container } = render(<ProductForm mode="create" />);

      await selectCategory(user);
      await user.type(getField('اسم المنتج'), 'منتج صالح');
      await user.type(getField('الوصف'), 'وصف تجريبي طويل بما فيه الكفاية');
      submitForm(container);

      expect(screen.getByText('أدخل سعراً صحيحاً')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires discountPrice to be less than price', async () => {
      const user = setupUser();
      const { container } = render(<ProductForm mode="create" />);

      await fillRequiredFields(user);
      await user.type(getField('سعر بعد الخصم (اختياري)'), '999');
      submitForm(container);

      expect(
        screen.getByText('يجب أن يكون سعر الخصم أقل من السعر الأصلي'),
      ).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires wholesalePrice and wholesaleMinQty together — price without qty', async () => {
      const user = setupUser();
      const { container } = render(<ProductForm mode="create" />);

      await fillRequiredFields(user);
      await user.type(getField('سعر الجملة (اختياري)'), '30');
      submitForm(container);

      expect(
        screen.getByText('أدخل سعر الجملة والحد الأدنى للكمية معاً'),
      ).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('requires wholesalePrice and wholesaleMinQty together — qty without price', async () => {
      const user = setupUser();
      const { container } = render(<ProductForm mode="create" />);

      await fillRequiredFields(user);
      await user.type(getField('الحد الأدنى للكمية (للجملة)'), '10');
      submitForm(container);

      expect(
        screen.getByText('أدخل سعر الجملة والحد الأدنى للكمية معاً'),
      ).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    // Unlike AdForm, this rule is NOT temporarily disabled here.
    it('requires at least one image in create mode', async () => {
      const user = setupUser();
      const { container } = render(<ProductForm mode="create" />);

      await fillRequiredFields(user);
      submitForm(container);

      expect(screen.getByText('أضف صورة واحدة على الأقل')).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('does not require an image in edit mode when the product already has existing images', async () => {
      render(<ProductForm mode="edit" product={existingProduct} />);

      await setupUser().click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      expect(screen.queryByText('أضف صورة واحدة على الأقل')).not.toBeInTheDocument();
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
    });

    it('requires an image in edit mode if all existing images are removed and none re-added', async () => {
      const user = setupUser();
      const { container } = render(<ProductForm mode="edit" product={existingProduct} />);

      await user.click(screen.getByText(`Remove ${existingProduct.images[0]}`));
      await user.click(screen.getByText(`Remove ${existingProduct.images[1]}`));
      submitForm(container);

      expect(screen.getByText('أضف صورة واحدة على الأقل')).toBeInTheDocument();
      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });
  });

  describe('create mode submission', () => {
    it('trims the name/description before submitting (via edit mode, past the image gate)', async () => {
      const user = setupUser();
      render(<ProductForm mode="edit" product={existingProduct} />);

      const nameInput = getField('اسم المنتج') as HTMLInputElement;
      await user.clear(nameInput);
      await user.type(nameInput, '  منتج بمسافات زائدة  ');
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload.name).toBe('منتج بمسافات زائدة');
    });

    it('parses numeric fields correctly and omits unset optional fields', async () => {
      const user = setupUser();
      // Edit mode starts with existing images already populated,
      // letting us reach past the image-required branch to assert on
      // payload shape without needing to stub file uploads.
      render(<ProductForm mode="edit" product={{ ...existingProduct, discountPrice: null, wholesalePrice: null, wholesaleMinQty: null }} />);

      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload.discountPrice).toBeNull();
      expect(payload.wholesalePrice).toBeNull();
      expect(payload.wholesaleMinQty).toBeNull();
      expect(payload.price).toBe(100);
      expect(payload.availability).toBe('IN_STOCK');
    });

    it('parses discountPrice/wholesalePrice/wholesaleMinQty when provided', async () => {
      const user = setupUser();
      render(<ProductForm mode="edit" product={existingProduct} />);

      await user.clear(getField('سعر بعد الخصم (اختياري)'));
      await user.type(getField('سعر بعد الخصم (اختياري)'), '80');
      await user.type(getField('سعر الجملة (اختياري)'), '60');
      await user.type(getField('الحد الأدنى للكمية (للجملة)'), '5');
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload.discountPrice).toBe(80);
      expect(payload.wholesalePrice).toBe(60);
      expect(payload.wholesaleMinQty).toBe(5);
    });
  });

  describe('edit mode submission — image reconciliation', () => {
    it('builds the PATCH payload WITHOUT an images field', async () => {
      const user = setupUser();
      render(<ProductForm mode="edit" product={existingProduct} />);

      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      const [payload] = mockUpdateMutate.mock.calls[0];
      expect(payload).not.toHaveProperty('images');
    });

    it('calls removeImage.mutateAsync only for URLs the user actually removed', async () => {
      const user = setupUser();
      render(<ProductForm mode="edit" product={existingProduct} />);

      await user.click(screen.getByText(`Remove ${existingProduct.images[0]}`));
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockRemoveImageMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockRemoveImageMutateAsync).toHaveBeenCalledWith({
        id: existingProduct.id,
        imageUrl: existingProduct.images[0],
      });
      expect(mockRemoveImageMutateAsync).not.toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: existingProduct.images[1] }),
      );
    });

    it('does not call removeImage at all when no existing images were removed', async () => {
      const user = setupUser();
      render(<ProductForm mode="edit" product={existingProduct} />);
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      expect(mockRemoveImageMutateAsync).not.toHaveBeenCalled();
    });

    it('awaits removeImage before calling update.mutate at all', async () => {
      const callOrder: string[] = [];
      mockRemoveImageMutateAsync.mockImplementation(async () => {
        callOrder.push('removeImage:start');
        await Promise.resolve();
        callOrder.push('removeImage:end');
      });
      mockUpdateMutate.mockImplementation(() => callOrder.push('update'));

      const user = setupUser();
      render(<ProductForm mode="edit" product={existingProduct} />);
      await user.click(screen.getByText(`Remove ${existingProduct.images[0]}`));
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));
      expect(callOrder).toEqual(['removeImage:start', 'removeImage:end', 'update']);
    });

    it('does NOT call update.mutate when removeImage fails, so a failed image step cannot navigate past a half-applied edit', async () => {
      mockRemoveImageMutateAsync.mockRejectedValue(new Error('network error'));

      const user = setupUser();
      render(<ProductForm mode="edit" product={existingProduct} />);
      await user.click(screen.getByText(`Remove ${existingProduct.images[0]}`));
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() => expect(mockRemoveImageMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });

    it('re-enables the submit button after a failed image step instead of leaving it stuck loading', async () => {
      mockRemoveImageMutateAsync.mockRejectedValue(new Error('network error'));

      const user = setupUser();
      render(<ProductForm mode="edit" product={existingProduct} />);
      await user.click(screen.getByText(`Remove ${existingProduct.images[0]}`));
      await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).not.toBeDisabled(),
      );
    });

    it('requires a replacement image before removing the last existing image (cannot reach zero images)', async () => {
      const singleImageProduct = { ...existingProduct, images: [existingProduct.images[0]] };
      const user = setupUser();
      const { container } = render(<ProductForm mode="edit" product={singleImageProduct} />);

      // Removing the only existing image with nothing staged to
      // replace it hits the same "at least one image" guard as create
      // mode — submit should be blocked, not silently drop to zero.
      await user.click(screen.getByText(`Remove ${singleImageProduct.images[0]}`));
      submitForm(container);

      expect(screen.getByText('أضف صورة واحدة على الأقل')).toBeInTheDocument();
      expect(mockUpdateMutate).not.toHaveBeenCalled();
      expect(mockRemoveImageMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('pending state', () => {
    it('disables submit and shows the loading label when any underlying mutation is pending', () => {
      (useAddProductImages as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockAddImagesMutate, isPending: true,
      });
      render(<ProductForm mode="edit" product={existingProduct} />);

      expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
    });

    it('shows "إضافة المنتج" in create mode and "حفظ التعديلات" in edit mode when idle', () => {
      const { rerender } = render(<ProductForm mode="create" />);
      expect(screen.getByRole('button', { name: 'إضافة المنتج' })).toBeInTheDocument();

      rerender(<ProductForm mode="edit" product={existingProduct} />);
      expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).toBeInTheDocument();
    });
  });

  describe('pre-filled values in edit mode', () => {
    it('pre-fills the form fields from the given product', () => {
      render(<ProductForm mode="edit" product={existingProduct} />);

      expect(getField('اسم المنتج')).toHaveValue(existingProduct.name);
      expect(getField('الوصف')).toHaveValue(existingProduct.description);
      expect(getField('السعر (₪)')).toHaveValue(100);
    });
  });

  describe('cancel', () => {
    // Unlike AdForm, ProductForm has no discard-confirmation dialog —
    // it calls history.back() directly and unconditionally.
    it('navigates back immediately on cancel, with no confirm dialog', async () => {
      const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
      const user = setupUser();
      render(<ProductForm mode="create" />);

      await user.type(getField('اسم المنتج'), 'منتج جديد');
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(backSpy).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('تجاهل التغييرات؟')).not.toBeInTheDocument();
      backSpy.mockRestore();
    });
  });
});
