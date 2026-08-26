/**
 * EditEntityCategoryDialog — shared edit dialog for product/service categories.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { EditEntityCategoryDialog } from '@/components/admin/EditEntityCategoryDialog';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockMutate = vi.fn();
const category = {
  id: 'cat-1',
  name: 'Furniture',
  nameAr: 'أثاث',
  icon: 'sofa',
};

function renderDialog() {
  return render(
    <EditEntityCategoryDialog
      category={category}
      useUpdateCategory={() => ({ mutate: mockMutate, isPending: false })}
      slugFallbackPrefix="product-category"
      dialogTitle="تعديل فئة المنتج"
      namePlaceholderAr="عربي"
      namePlaceholderEn="English"
      iconPlaceholder="icon"
    />,
  );
}

describe('EditEntityCategoryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens with prefilled values', async () => {
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('تعديل فئة المنتج')).toBeInTheDocument();
    expect(screen.getByDisplayValue('أثاث')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Furniture')).toBeInTheDocument();
  });

  it('toasts when Arabic name is cleared', async () => {
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole('button'));
    await user.clear(screen.getByDisplayValue('أثاث'));
    await user.click(screen.getByRole('button', { name: /حفظ|تعديل/i }));
    expect(toast.error).toHaveBeenCalledWith('الاسم بالعربي مطلوب');
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('closes without mutating when nothing changed', async () => {
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button', { name: /حفظ|تعديل/i }));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('sends only changed fields in the patch', async () => {
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole('button'));
    const ar = screen.getByDisplayValue('أثاث');
    await user.clear(ar);
    await user.type(ar, 'أثاث منزلي');
    await user.click(screen.getByRole('button', { name: /حفظ|تعديل/i }));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ nameAr: 'أثاث منزلي' }),
      expect.any(Object),
    );
  });
});
