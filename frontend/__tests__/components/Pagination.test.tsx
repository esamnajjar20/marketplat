/**
 * __tests__/components/Pagination.test.tsx
 *
 * Coverage targets for Pagination:
 *  - Returns null when totalPages <= 1
 *  - Renders "السابق" and "التالي" navigation labels
 *  - First page: previous button is disabled (aria-disabled + pointer-events)
 *  - Last page: next button is disabled
 *  - Middle page: both buttons are links
 *  - buildPageUrl: merges searchParams + page correctly
 *  - aria-label on nav, aria-live on page counter
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pagination } from '@/components/shared/ui/Pagination';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('Pagination', () => {
  it('returns null when totalPages is 1', () => {
    const { container } = render(
      <Pagination totalPages={1} currentPage={1} baseUrl="/ads" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when totalPages is 0', () => {
    const { container } = render(
      <Pagination totalPages={0} currentPage={1} baseUrl="/ads" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders navigation landmark with aria-label', () => {
    render(<Pagination totalPages={5} currentPage={3} baseUrl="/ads" />);
    expect(screen.getByRole('navigation', { name: 'التنقل بين الصفحات' })).toBeDefined();
  });

  it('shows current page counter with aria-live', () => {
    render(<Pagination totalPages={5} currentPage={3} baseUrl="/ads" />);
    const counter = screen.getByText('3 / 5');
    expect(counter).toBeDefined();
    expect(counter.getAttribute('aria-live')).toBe('polite');
  });

  it('first page: previous button is disabled and not a link', () => {
    render(<Pagination totalPages={5} currentPage={1} baseUrl="/ads" />);
    const prev = screen.getByText('السابق');
    expect(prev.closest('button')?.getAttribute('aria-disabled')).toBe('true');
    // Should NOT be inside an <a> tag
    expect(prev.closest('a')).toBeNull();
  });

  it('last page: next button is disabled and not a link', () => {
    render(<Pagination totalPages={5} currentPage={5} baseUrl="/ads" />);
    const next = screen.getByText('التالي');
    expect(next.closest('button')?.getAttribute('aria-disabled')).toBe('true');
    expect(next.closest('a')).toBeNull();
  });

  it('middle page: previous button is a link to page-1', () => {
    render(<Pagination totalPages={5} currentPage={3} baseUrl="/ads" />);
    const prev = screen.getByLabelText('الصفحة السابقة');
    expect(prev.getAttribute('href')).toContain('page=2');
  });

  it('middle page: next button is a link to page+1', () => {
    render(<Pagination totalPages={5} currentPage={3} baseUrl="/ads" />);
    const next = screen.getByLabelText('الصفحة التالية');
    expect(next.getAttribute('href')).toContain('page=4');
  });

  it('merges existing searchParams into page URL', () => {
    render(
      <Pagination
        totalPages={5}
        currentPage={2}
        baseUrl="/search"
        searchParams={{ q: 'laptop', city: 'غزة' }}
      />,
    );
    const next = screen.getByLabelText('الصفحة التالية');
    const href = next.getAttribute('href') ?? '';
    expect(href).toContain('q=laptop');
    expect(href).toContain('page=3');
  });

  it('filters undefined searchParams from URL', () => {
    render(
      <Pagination
        totalPages={3}
        currentPage={1}
        baseUrl="/ads"
        searchParams={{ q: undefined, city: 'غزة' }}
      />,
    );
    const next = screen.getByLabelText('الصفحة التالية');
    const href = next.getAttribute('href') ?? '';
    expect(href).not.toContain('q=');
    expect(href).toContain('city=');
  });

  it('2-page: page 1 has active next link', () => {
    render(<Pagination totalPages={2} currentPage={1} baseUrl="/items" />);
    const next = screen.getByLabelText('الصفحة التالية');
    expect(next.getAttribute('href')).toContain('page=2');
  });

  it('page 1 of 2: prev is disabled', () => {
    render(<Pagination totalPages={2} currentPage={1} baseUrl="/items" />);
    const prev = screen.getByText('السابق');
    expect(prev.closest('button')?.getAttribute('disabled')).toBeDefined();
  });

  it('merges into a baseUrl that already has ?tab= instead of adding a second "?" (nested-URL bug)', () => {
    render(
      <Pagination
        totalPages={5}
        currentPage={2}
        baseUrl="/activity?tab=ads"
        searchParams={{ tab: 'ads', status: 'SOLD' }}
      />,
    );
    const href = screen.getByLabelText('الصفحة التالية').getAttribute('href') ?? '';
    expect(href.split('?')).toHaveLength(2);
    expect(href.match(/tab=/g)).toHaveLength(1);
    expect(href).toContain('/activity?');
    expect(href).toContain('tab=ads');
    expect(href).toContain('status=SOLD');
    expect(href).toContain('page=3');
  });

  it('keeps the tab from baseUrl when searchParams does not repeat it', () => {
    render(<Pagination totalPages={3} currentPage={1} baseUrl="/activity?tab=requests" />);
    const href = screen.getByLabelText('الصفحة التالية').getAttribute('href') ?? '';
    expect(href).toBe('/activity?tab=requests&page=2');
  });
});
