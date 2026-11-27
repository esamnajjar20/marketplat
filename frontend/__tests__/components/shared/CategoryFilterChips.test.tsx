import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CategoryFilterChips } from '@/components/shared/filters/CategoryFilterChips';

describe('CategoryFilterChips', () => {
  it('reuses FilterChipGroup for all and category options', () => {
    const onSelect = vi.fn();
    render(
      <CategoryFilterChips
        categories={[{ id: 'tools', nameAr: 'أدوات' }]}
        activeId="tools"
        onSelect={onSelect}
        ariaLabel="تصنيفات المنتجات"
      />,
    );

    expect(screen.getByRole('group', { name: 'تصنيفات المنتجات' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'أدوات' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'الكل' })).toHaveClass('min-h-[var(--touch-target)]');
    fireEvent.click(screen.getByRole('button', { name: 'الكل' }));
    expect(onSelect).toHaveBeenCalledWith('');
  });
});
