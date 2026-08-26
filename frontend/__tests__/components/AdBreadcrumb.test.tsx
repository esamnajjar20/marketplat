import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdBreadcrumb } from '@/components/ads/AdBreadcrumb';
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('@/components/ads/AdDetail', () => ({ useCategoryHref: (id?: string) => (id ? `/categories/${id}` : null) }));
describe('AdBreadcrumb', () => {
  it('with category', () => {
    render(<AdBreadcrumb ad={{ id: 'a1', title: 'دراجة', category: { id: 'c1', nameAr: 'مركبات' } } as any} />);
    expect(screen.getByText('الرئيسية')).toBeInTheDocument();
    expect(screen.getByText('مركبات')).toBeInTheDocument();
    expect(screen.getByText('دراجة')).toBeInTheDocument();
  });
  it('without category', () => {
    render(<AdBreadcrumb ad={{ id: 'a1', title: 'بدون' } as any} />);
    expect(screen.getByText('بدون')).toBeInTheDocument();
  });
});
