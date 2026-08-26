/**
 * CollectionForm — create/edit dialog validation + submit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { CollectionForm } from '@/components/stores/CollectionForm';

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();

vi.mock('@/hooks/mutations/useCollectionMutations', () => ({
  useCreateCollection: () => ({
    mutate: mockCreateMutate,
    isPending: false,
  }),
  useUpdateCollection: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
  }),
}));

describe('CollectionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows create title when no collection is passed', () => {
    render(<CollectionForm open onOpenChange={vi.fn()} />);
    expect(screen.getByText('مجموعة جديدة')).toBeInTheDocument();
  });

  it('disables submit while the name is shorter than 2 characters', () => {
    render(<CollectionForm open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'إنشاء المجموعة' })).toBeDisabled();
  });

  it('rejects non-http image URLs after a valid name', async () => {
    const user = setupUser();
    render(<CollectionForm open onOpenChange={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('مثال: تشكيلة الصيف'), 'مجموعة صيف');
    await user.type(screen.getByPlaceholderText('https://...'), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'إنشاء المجموعة' }));

    expect(mockCreateMutate).not.toHaveBeenCalled();
    expect(await screen.findByText(/http/i)).toBeInTheDocument();
  });

  it('submits create payload with trimmed name and closes dialog', async () => {
    const user = setupUser();
    const onOpenChange = vi.fn();
    mockCreateMutate.mockImplementation((_payload, opts) => {
      opts?.onSuccess?.();
    });

    render(<CollectionForm open onOpenChange={onOpenChange} />);

    await user.type(screen.getByPlaceholderText('مثال: تشكيلة الصيف'), '  مجموعة صيف  ');
    await user.click(screen.getByRole('button', { name: 'إنشاء المجموعة' }));

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalled());
    expect(mockCreateMutate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'مجموعة صيف' }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('pre-fills and uses update mutation in edit mode', async () => {
    const user = setupUser();
    mockUpdateMutate.mockImplementation((_payload, opts) => {
      opts?.onSuccess?.();
    });

    render(
      <CollectionForm
        open
        onOpenChange={vi.fn()}
        collection={{
          id: 'c1',
          name: 'قديمة',
          description: 'وصف',
          imageUrl: null,
          slug: 'old',
          isActive: true,
          storeId: 's1',
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
          _count: { products: 0 },
        } as any}
      />,
    );

    expect(screen.getByText('تعديل المجموعة')).toBeInTheDocument();
    expect(screen.getByDisplayValue('قديمة')).toBeInTheDocument();

    const name = screen.getByDisplayValue('قديمة');
    await user.clear(name);
    await user.type(name, 'محدّثة');
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalled());
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });
});
