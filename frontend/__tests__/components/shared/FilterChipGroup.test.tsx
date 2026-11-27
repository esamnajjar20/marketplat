import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FilterChipGroup } from '@/components/shared/filters/FilterChipGroup';

describe('FilterChipGroup', () => {
  const options = [
    { value: '', label: 'الكل' },
    { value: 'active', label: 'نشطة' },
  ] as const;

  it('renders selected state and the minimum touch target for pill filters', () => {
    render(
      <FilterChipGroup
        label="حالة الإعلان"
        value="active"
        options={options}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: 'حالة الإعلان' })).toHaveAttribute('data-filter-chip-variant', 'pills');
    expect(screen.getByRole('button', { name: 'نشطة' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'نشطة' })).toHaveClass('min-h-[var(--touch-target)]');
  });

  it('supports underline filters and emits the selected value', () => {
    const onChange = vi.fn();
    render(
      <FilterChipGroup
        label="حالة الطلب"
        value=""
        options={options}
        onChange={onChange}
        variant="underline"
      />,
    );

    expect(screen.getByRole('group', { name: 'حالة الطلب' })).toHaveAttribute('data-filter-chip-variant', 'underline');
    fireEvent.click(screen.getByRole('button', { name: 'نشطة' }));
    expect(onChange).toHaveBeenCalledWith('active');
  });

  it('renders optional option icons accessibly', () => {
    render(
      <FilterChipGroup
        label="نوع الطلب"
        value="service"
        options={[{ value: 'service', label: 'خدمة', icon: <span data-testid="type-icon" /> }]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('type-icon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});
