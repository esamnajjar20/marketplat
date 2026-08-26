/**
 * ProfileStoreSummary — public profile store card.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileStoreSummary } from '@/components/profile/ProfileStoreSummary';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/shared/ui/SafeImage', () => ({
  SafeImage: () => <span data-testid="img" />,
}));

const store = {
  id: 'store-1',
  name: 'متجري',
  city: 'غزة',
  plan: 'FEATURED' as const,
  logoUrl: null,
  coverImageUrl: null,
  _count: { products: 5, followers: 12 },
};

describe('ProfileStoreSummary', () => {
  it('renders name, counts, and featured badge', () => {
    render(<ProfileStoreSummary store={store as any} />);
    expect(screen.getByText('متجري')).toBeInTheDocument();
    expect(screen.getByText(/5 منتج/)).toBeInTheDocument();
    expect(screen.getByText(/12 متابع/)).toBeInTheDocument();
    expect(screen.getByText('مميز')).toBeInTheDocument();
  });

  it('links to the store detail page', () => {
    render(<ProfileStoreSummary store={store as any} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('store-1');
  });

  it('hides featured badge for free plan', () => {
    render(
      <ProfileStoreSummary store={{ ...store, plan: 'FREE' } as any} />,
    );
    expect(screen.queryByText('مميز')).not.toBeInTheDocument();
  });
});
