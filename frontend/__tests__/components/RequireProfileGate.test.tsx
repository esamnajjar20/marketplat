/**
 * __tests__/components/RequireProfileGate.test.tsx
 *
 * Previously uncovered. RequireProfileGate is the shared "does the user
 * have the profile this page needs?" gate behind three money-adjacent
 * creation flows: CreateAdGate (seller profile), CreateProductGate
 * (store), CreateServiceListingGate (service-provider profile). A
 * regression here silently reopens the exact bug its own header comment
 * describes having fixed once already: a user without the right profile
 * either gets stranded with no way forward, or slips past the gate and
 * only discovers the block on a backend 4xx after filling a whole form.
 *
 * Coverage:
 *  - Loading state shows a spinner, renders neither children nor the CTA
 *  - isError (with no data) is read as "no profile yet", not a real
 *    error — same convention the gate's own comment documents for
 *    useMyStore/useMySellerProfile/useMyServiceProvider
 *  - No data (isError false, data undefined) also falls through to the
 *    CTA — covers the "resolved successfully but nothing there" case
 *  - Data present renders children, not the CTA
 *  - The CTA link carries `from` as an encoded ?from= query param onto
 *    setupHref, so the setup page can send the user back afterward
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequireProfileGate } from '@/components/shared/gates/RequireProfileGate';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseProps = {
  setupHref: '/my-store',
  from: '/my-store/products/new',
  title: 'افتح متجرك أولاً',
  description: 'تحتاج إلى فتح متجر قبل أن تتمكن من إضافة منتجات',
  ctaLabel: 'فتح متجر',
};

describe('RequireProfileGate', () => {
  it('shows a loading spinner and renders neither children nor the CTA while loading', () => {
    render(
      <RequireProfileGate query={{ data: undefined, isLoading: true, isError: false }} {...baseProps}>
        <div>محتوى محمي</div>
      </RequireProfileGate>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument();
    expect(screen.queryByText(baseProps.title)).not.toBeInTheDocument();
  });

  it('renders the CTA (not children) when the query errors — read as "no profile yet"', () => {
    render(
      <RequireProfileGate query={{ data: undefined, isLoading: false, isError: true }} {...baseProps}>
        <div>محتوى محمي</div>
      </RequireProfileGate>,
    );

    expect(screen.getByText(baseProps.title)).toBeInTheDocument();
    expect(screen.getByText(baseProps.description)).toBeInTheDocument();
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument();
  });

  it('renders the CTA when the query resolves with no data (not an error, just nothing there)', () => {
    render(
      <RequireProfileGate query={{ data: undefined, isLoading: false, isError: false }} {...baseProps}>
        <div>محتوى محمي</div>
      </RequireProfileGate>,
    );

    expect(screen.getByText(baseProps.title)).toBeInTheDocument();
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument();
  });

  it('renders children (not the CTA) once profile data is present', () => {
    render(
      <RequireProfileGate query={{ data: { id: 'store-1' }, isLoading: false, isError: false }} {...baseProps}>
        <div>محتوى محمي</div>
      </RequireProfileGate>,
    );

    expect(screen.getByText('محتوى محمي')).toBeInTheDocument();
    expect(screen.queryByText(baseProps.title)).not.toBeInTheDocument();
  });

  it('builds the CTA link with setupHref and an encoded ?from= param', () => {
    render(
      <RequireProfileGate query={{ data: undefined, isLoading: false, isError: false }} {...baseProps}>
        <div>محتوى محمي</div>
      </RequireProfileGate>,
    );

    const link = screen.getByRole('link', { name: baseProps.ctaLabel });
    expect(link.getAttribute('href')).toBe(
      `/my-store?from=${encodeURIComponent('/my-store/products/new')}`,
    );
  });
});
