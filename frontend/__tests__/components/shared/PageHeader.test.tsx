import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '@/components/shared/layout/PageHeader';

describe('PageHeader', () => {
  it.each(['standard', 'browse', 'account', 'admin', 'detail'] as const)(
    'renders the shared semantic heading structure for the %s variant',
    (variant) => {
      render(
        <PageHeader
          variant={variant}
          title="عنوان الصفحة"
          description="وصف الصفحة"
          actions={<button type="button">إجراء</button>}
          titleId="test-page-title"
        />,
      );

      const header = screen.getByRole('banner');
      expect(header).toHaveAttribute('data-page-header');
      expect(header).toHaveAttribute('data-variant', variant);
      expect(screen.getByRole('heading', { level: 1, name: 'عنوان الصفحة' })).toHaveAttribute('id', 'test-page-title');
      expect(screen.getByText('وصف الصفحة')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'إجراء' })).toBeInTheDocument();
    },
  );

  it('supports icons and linked eyebrow content without changing heading semantics', () => {
    render(
      <PageHeader
        title="المنتجات"
        icon={<span data-testid="page-icon" />}
        eyebrow={<a href="/stores">المتاجر</a>}
      />,
    );

    expect(screen.getByTestId('page-icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: 'المتاجر' })).toHaveAttribute('href', '/stores');
    expect(screen.getByRole('heading', { level: 1, name: 'المنتجات' })).toBeInTheDocument();
  });
});
