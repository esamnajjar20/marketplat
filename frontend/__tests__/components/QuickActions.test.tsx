/**
 * __tests__/components/QuickActions.test.tsx
 *
 * Coverage gap: 0% prior coverage. Static dashboard shortcut grid —
 * covers that all five actions render as links with correct labels
 * and hrefs, and that the primary ("نشر إعلان جديد") action is
 * visually distinguished from the rest.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuickActions } from '@/components/profile/QuickActions';

describe('QuickActions', () => {
  it('renders all five quick action links', () => {
    render(<QuickActions />);

    expect(screen.getByText('نشر إعلان جديد')).toBeInTheDocument();
    expect(screen.getByText('إعلاناتي')).toBeInTheDocument();
    expect(screen.getByText('طلباتي')).toBeInTheDocument();
    expect(screen.getByText('المفضلة')).toBeInTheDocument();
    expect(screen.getByText('الإعدادات')).toBeInTheDocument();
  });

  it('links "المفضلة" to /favorites', () => {
    render(<QuickActions />);

    expect(screen.getByText('المفضلة').closest('a')).toHaveAttribute('href', '/favorites');
  });

  it('renders the primary action ("نشر إعلان جديد") with primary styling, distinct from the rest', () => {
    render(<QuickActions />);

    const primaryLink = screen.getByText('نشر إعلان جديد').closest('a');
    const secondaryLink = screen.getByText('إعلاناتي').closest('a');

    expect(primaryLink?.className).toMatch(/bg-primary/);
    expect(secondaryLink?.className).not.toMatch(/bg-primary text-primary-foreground/);
  });

  it('renders exactly five links', () => {
    render(<QuickActions />);

    expect(screen.getAllByRole('link')).toHaveLength(5);
  });
});
