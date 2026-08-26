import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditProductCategoryButton } from '@/components/admin/EditProductCategoryButton';
import { EditServiceCategoryButton } from '@/components/admin/EditServiceCategoryButton';
vi.mock('@/components/admin/EditEntityCategoryDialog', () => ({
  EditEntityCategoryDialog: (p: any) => <div data-testid="edit" data-title={p.dialogTitle} data-prefix={p.slugFallbackPrefix} />,
}));
vi.mock('@/hooks/mutations/useProductCategoryMutations', () => ({ useUpdateProductCategory: vi.fn() }));
vi.mock('@/hooks/mutations/useServiceCategoryMutations', () => ({ useUpdateServiceCategory: vi.fn() }));
describe('Edit category buttons', () => {
  it('product', () => {
    render(<EditProductCategoryButton category={{ id: 'c1' } as any} />);
    expect(screen.getByTestId('edit')).toHaveAttribute('data-prefix', 'product-category');
  });
  it('service', () => {
    render(<EditServiceCategoryButton category={{ id: 'c2' } as any} />);
    expect(screen.getByTestId('edit')).toHaveAttribute('data-prefix', 'service-category');
  });
});
