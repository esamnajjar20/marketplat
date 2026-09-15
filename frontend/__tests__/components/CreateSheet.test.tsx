/**
 * __tests__/components/CreateSheet.test.tsx
 *
 * Direct coverage for the sheet BottomNav's "أضف" button opens (see
 * that file's own doc for the rationale). Covers:
 *  - not rendered while closed
 *  - all four create destinations render with the correct hrefs once open
 *  - clicking a destination calls onOpenChange(false) (closes the sheet)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { CreateSheet } from '@/components/layout/CreateSheet';

describe('CreateSheet', () => {
  it('renders nothing while closed', () => {
    render(<CreateSheet open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('أضف')).not.toBeInTheDocument();
    expect(screen.queryByText('إعلان جديد')).not.toBeInTheDocument();
  });

  it('renders all four links with the correct hrefs once open', () => {
    render(<CreateSheet open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByRole('link', { name: /إعلان جديد/ }).getAttribute('href')).toBe('/ads/create');
    expect(screen.getByRole('link', { name: /منتج جديد/ }).getAttribute('href')).toBe('/my-store/products/new');
    expect(screen.getByRole('link', { name: /خدمة جديدة/ }).getAttribute('href')).toBe('/my-services/new');
    // FEAT-CREATE-BROADCAST-01: "طلب خدمة" — سوق الطلبات.
    expect(screen.getByRole('link', { name: /طلب خدمة/ }).getAttribute('href')).toBe('/service-broadcasts/new');
  });

  it('calls onOpenChange(false) when a destination is tapped, so the sheet closes on navigation', async () => {
    const onOpenChange = vi.fn();
    const user = setupUser();
    render(<CreateSheet open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('link', { name: /منتج جديد/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
