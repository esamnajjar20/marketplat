import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TabsBar } from '@/components/shared/ui/TabsBar';

describe('TabsBar', () => {
  const options = [
    { value: 'ads', label: 'الإعلانات', panelId: 'panel-ads' },
    { value: 'products', label: 'المنتجات', panelId: 'panel-products' },
    { value: 'services', label: 'الخدمات', panelId: 'panel-services' },
  ] as const;

  it.each(['underline', 'pills', 'segmented'] as const)(
    'renders accessible tab semantics for the %s variant',
    (variant) => {
      render(
        <TabsBar
          value="products"
          onChange={vi.fn()}
          options={options}
          ariaLabel="نوع المحتوى"
          variant={variant}
          idPrefix="content"
        />,
      );

      const list = screen.getByRole('tablist', { name: 'نوع المحتوى' });
      expect(list).toHaveAttribute('data-tabs-variant', variant);
      expect(screen.getByRole('tab', { name: 'المنتجات' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'المنتجات' })).toHaveAttribute('aria-controls', 'panel-products');
      expect(screen.getByRole('tab', { name: 'الإعلانات' })).toHaveAttribute('tabindex', '-1');
    },
  );

  it('moves focus and selection with RTL arrow navigation', () => {
    const onChange = vi.fn();
    render(
      <div dir="rtl">
        <TabsBar value="ads" onChange={onChange} options={options} ariaLabel="نوع المحتوى" />
      </div>,
    );

    const first = screen.getByRole('tab', { name: 'الإعلانات' });
    fireEvent.keyDown(first, { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith('products');
    expect(screen.getByRole('tab', { name: 'المنتجات' })).toHaveFocus();
  });

  it('skips disabled options during keyboard navigation', () => {
    const onChange = vi.fn();
    const items = [
      { value: 'one', label: 'الأول' },
      { value: 'two', label: 'الثاني', disabled: true },
      { value: 'three', label: 'الثالث' },
    ] as const;
    render(<TabsBar value="one" onChange={onChange} options={items} ariaLabel="الخطوات" />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'الأول' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('three');
    expect(screen.getByRole('tab', { name: 'الثالث' })).toHaveFocus();
  });
});
