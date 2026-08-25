/**
 * __tests__/components/PromotionForm.test.tsx
 *
 * Coverage targets:
 *  - requires productId, title, discountValue, startsAt, endsAt
 *  - rejects a PERCENTAGE discountValue over 100 client-side (mirrors
 *    backend's promotions.validation.ts createPromotionSchema)
 *  - rejects endsAt <= startsAt
 *  - live price preview updates when a product + discount are chosen
 *  - submit payload sends discountValue as a number and startsAt/
 *    endsAt as ISO strings, omitting maxUses when left blank
 *  - closes and resets on successful create
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { PromotionForm } from '@/components/stores/PromotionForm';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useCreatePromotion } from '@/hooks/mutations/usePromotionMutations';

vi.mock('@/hooks/queries/useProducts', () => ({
  useMyProducts: vi.fn(),
}));

vi.mock('@/hooks/mutations/usePromotionMutations', () => ({
  useCreatePromotion: vi.fn(),
}));

const mockCreateMutate = vi.fn();

const mockProduct = {
  id: 'product-1',
  name: 'خلاط كهربائي',
  price: '150',
};

function getField(label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return screen.getByLabelText(new RegExp(`^${escaped}`));
}

async function selectProduct(user: ReturnType<typeof setupUser>) {
  await user.click(getField('المنتج'));
  await user.click(await screen.findByRole('option', { name: 'خلاط كهربائي' }));
}

function submitForm(container: HTMLElement) {
  // DialogContent portals into document.body — prefer the live form in
  // the document when the container-scoped query misses it.
  const form =
    container.querySelector('form') ??
    document.querySelector('form');
  if (!form) throw new Error('submitForm: no <form> found');
  fireEvent.submit(form);
}

/** datetime-local inputs live inside a portaled Dialog — query document. */
function dateField(id: string): HTMLInputElement {
  const el =
    document.getElementById(id) ??
    document.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) throw new Error(`dateField: #${id} not found in document`);
  return el as HTMLInputElement;
}

describe('PromotionForm', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
    (useMyProducts as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [mockProduct], meta: { totalPages: 1 } },
    });
    (useCreatePromotion as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockCreateMutate,
      isPending: false,
    });
  });

  describe('validation', () => {
    it('requires a product', async () => {
      const user = setupUser();
      const { container } = render(<PromotionForm open onOpenChange={vi.fn()} />);

      await user.type(getField('اسم العرض'), 'خصم الصيف');
      await user.type(getField('قيمة الخصم'), '15');
      fireEvent.change(dateField('promo-startsAt'), { target: { value: '2026-08-19T00:00' } });
      fireEvent.change(dateField('promo-endsAt'), { target: { value: '2026-08-25T00:00' } });
      submitForm(container);

      expect(await screen.findByRole('alert')).toHaveTextContent('اختر المنتج');
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('rejects a percentage discount over 100', async () => {
      const user = setupUser();
      const { container } = render(<PromotionForm open onOpenChange={vi.fn()} />);

      await selectProduct(user);
      await user.type(getField('اسم العرض'), 'خصم الصيف');
      await user.type(getField('قيمة الخصم'), '150');
      fireEvent.change(dateField('promo-startsAt'), { target: { value: '2026-08-19T00:00' } });
      fireEvent.change(dateField('promo-endsAt'), { target: { value: '2026-08-25T00:00' } });
      submitForm(container);

      expect(await screen.findByRole('alert')).toHaveTextContent('لا يمكن أن تتجاوز 100');
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it('rejects endsAt before or equal to startsAt', async () => {
      const user = setupUser();
      const { container } = render(<PromotionForm open onOpenChange={vi.fn()} />);

      await selectProduct(user);
      await user.type(getField('اسم العرض'), 'خصم الصيف');
      await user.type(getField('قيمة الخصم'), '15');
      fireEvent.change(dateField('promo-startsAt'), { target: { value: '2026-08-25T00:00' } });
      fireEvent.change(dateField('promo-endsAt'), { target: { value: '2026-08-19T00:00' } });
      submitForm(container);

      expect(await screen.findByRole('alert')).toHaveTextContent('بعد تاريخ البداية');
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });
  });

  describe('price preview', () => {
    it('shows the discounted price once a product and percentage discount are chosen', async () => {
      const user = setupUser();
      render(<PromotionForm open onOpenChange={vi.fn()} />);

      await selectProduct(user);
      await user.type(getField('قيمة الخصم'), '20');

      // 150 - 20% = 120
      expect(await screen.findByText(/120/)).toBeInTheDocument();
    });
  });

  describe('submit', () => {
    it('sends a well-formed payload and closes on success', async () => {
      const user = setupUser();
      const onOpenChange = vi.fn();
      const { container } = render(<PromotionForm open onOpenChange={onOpenChange} />);

      await selectProduct(user);
      await user.type(getField('اسم العرض'), 'خصم الصيف');
      await user.type(getField('قيمة الخصم'), '15');
      fireEvent.change(dateField('promo-startsAt'), { target: { value: '2026-08-19T00:00' } });
      fireEvent.change(dateField('promo-endsAt'), { target: { value: '2026-08-25T00:00' } });
      submitForm(container);

      expect(mockCreateMutate).toHaveBeenCalledTimes(1);
      const [payload, handlers] = mockCreateMutate.mock.calls[0];
      expect(payload.productId).toBe('product-1');
      expect(payload.title).toBe('خصم الصيف');
      expect(payload.discountType).toBe('PERCENTAGE');
      expect(payload.discountValue).toBe(15);
      expect(payload.maxUses).toBeUndefined();
      expect(new Date(payload.startsAt).toISOString()).toBe(payload.startsAt);
      expect(new Date(payload.endsAt).toISOString()).toBe(payload.endsAt);

      handlers.onSuccess();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('includes maxUses as a number when provided', async () => {
      const user = setupUser();
      const { container } = render(<PromotionForm open onOpenChange={vi.fn()} />);

      await selectProduct(user);
      await user.type(getField('اسم العرض'), 'خصم الصيف');
      await user.type(getField('قيمة الخصم'), '15');
      fireEvent.change(dateField('promo-startsAt'), { target: { value: '2026-08-19T00:00' } });
      fireEvent.change(dateField('promo-endsAt'), { target: { value: '2026-08-25T00:00' } });
      await user.type(getField('الحد الأقصى للاستخدام'), '100');
      submitForm(container);

      const [payload] = mockCreateMutate.mock.calls[0];
      expect(payload.maxUses).toBe(100);
    });
  });
});
