/**
 * SectionHeader — shared Home section heading.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeader } from '@/components/home/SectionHeader';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('SectionHeader', () => {
  it('renders eyebrow and title', () => {
    render(<SectionHeader eyebrow="استكشف" title="إعلانات مميزة" />);
    expect(screen.getByText('استكشف')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'إعلانات مميزة' })).toBeInTheDocument();
  });

  it('renders optional CTA link', () => {
    render(
      <SectionHeader
        eyebrow="قريب"
        title="خدمات"
        cta={{ href: '/services', label: 'عرض الكل' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'عرض الكل' });
    expect(link).toHaveAttribute('href', '/services');
  });

  it('renders optional badge', () => {
    render(
      <SectionHeader eyebrow="x" title="y" badge={<span>📍 قريب منك</span>} />,
    );
    expect(screen.getByText('📍 قريب منك')).toBeInTheDocument();
  });
});
