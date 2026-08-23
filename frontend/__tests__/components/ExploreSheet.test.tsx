/**
 * __tests__/components/ExploreSheet.test.tsx
 *
 * Direct coverage for the sheet BottomNav's "استكشاف" tab opens (see
 * that file's own doc for the IA rationale). Covers:
 *  - not rendered while closed
 *  - all five destinations render with the correct hrefs once open
 *  - clicking a destination calls onOpenChange(false) (closes the sheet)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ExploreSheet } from '@/components/layout/ExploreSheet';

describe('ExploreSheet', () => {
  it('renders nothing while closed', () => {
    render(<ExploreSheet open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('استكشاف')).not.toBeInTheDocument();
    expect(screen.queryByText('بحث شامل')).not.toBeInTheDocument();
  });

  it('renders all six links with the correct hrefs once open', () => {
    render(<ExploreSheet open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByRole('link', { name: /بحث شامل/ }).getAttribute('href')).toBe('/search');
    expect(screen.getByRole('link', { name: /^الإعلانات/ }).getAttribute('href')).toBe('/search?type=ads');
    expect(screen.getByRole('link', { name: /المنتجات/ }).getAttribute('href')).toBe('/products');
    expect(screen.getByRole('link', { name: /الخدمات/ }).getAttribute('href')).toBe('/services');
    expect(screen.getByRole('link', { name: /^المتاجر/ }).getAttribute('href')).toBe('/stores');
    expect(screen.getByRole('link', { name: /مقدمو الخدمة/ }).getAttribute('href')).toBe('/service-providers');
  });

  it('calls onOpenChange(false) when a destination is tapped, so the sheet closes on navigation', async () => {
    const onOpenChange = vi.fn();
    const user = setupUser();
    render(<ExploreSheet open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('link', { name: /الخدمات/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
