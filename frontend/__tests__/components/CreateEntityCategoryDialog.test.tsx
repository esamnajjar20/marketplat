/**
 * CreateEntityCategoryDialog — shared create dialog for product/service categories.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { CreateEntityCategoryDialog } from '@/components/admin/CreateEntityCategoryDialog';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockMutate = vi.fn();

function renderDialog(isPending = false) {
  return render(
    <CreateEntityCategoryDialog
      useCreateCategory={() => ({ mutate: mockMutate, isPending })}
      slugFallbackPrefix="product-category"
      entityLabel="فئة منتج جديدة"
      namePlaceholderAr="مثال: أثاث"
      namePlaceholderEn="e.g. Furniture"
      iconPlaceholder="sofa"
    />,
  );
}

describe('CreateEntityCategoryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the dialog from the trigger button', async () => {
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /فئة منتج جديدة/ }));
    expect(screen.getByText('إنشاء فئة منتج جديدة')).toBeInTheDocument();
  });

  it('toasts when Arabic name is missing', async () => {
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /فئة منتج جديدة/ }));
    await user.click(screen.getByRole('button', { name: 'إنشاء' }));
    expect(toast.error).toHaveBeenCalledWith('الاسم بالعربي مطلوب');
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('toasts when English name is missing', async () => {
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /فئة منتج جديدة/ }));
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0]!, 'أثاث');
    await user.click(screen.getByRole('button', { name: 'إنشاء' }));
    expect(toast.error).toHaveBeenCalledWith('الاسم بالإنجليزي مطلوب');
  });

  it('submits payload with slugified english name', async () => {
    const user = setupUser();
    mockMutate.mockImplementation((_payload, opts) => opts?.onSuccess?.());
    renderDialog();
    await user.click(screen.getByRole('button', { name: /فئة منتج جديدة/ }));
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0]!, 'أثاث');
    await user.type(inputs[1]!, 'Furniture');
    await user.click(screen.getByRole('button', { name: 'إنشاء' }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Furniture',
        nameAr: 'أثاث',
        slug: expect.any(String),
      }),
      expect.any(Object),
    );
  });
});
