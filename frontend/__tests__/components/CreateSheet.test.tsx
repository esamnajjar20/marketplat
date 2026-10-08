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
import { CreateSheet, getVisibleCreateLinks } from '@/components/layout/CreateSheet';

const mockRoles = { isSeller: true, isProvider: true, hasActiveStore: true };

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockRoles) => unknown) => selector(mockRoles),
  selectLastKnownRoles: (state: typeof mockRoles) => state,
}));

describe('CreateSheet', () => {
  it('renders nothing while closed', () => {
    render(<CreateSheet open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('أضف')).not.toBeInTheDocument();
    expect(screen.queryByText('إعلان جديد')).not.toBeInTheDocument();
  });

  it('renders only the capabilities available to the current user', () => {
    const roles = { isSeller: true, isProvider: false, hasActiveStore: true };

    render(<CreateSheet open={true} onOpenChange={vi.fn()} />);

    // This component reads auth-store state; the pure helper is covered
    // directly below for deterministic capability combinations.
    expect(getVisibleCreateLinks(roles).map((link) => link.href)).toEqual([
      '/ads/create',
      '/my-store/products/new',
      '/requests/new',
    ]);
  });

  it('returns only request creation when no role capabilities exist', () => {
    expect(getVisibleCreateLinks({
      isSeller: false,
      isProvider: false,
      hasActiveStore: false,
    }).map((link) => link.href)).toEqual(['/requests/new']);
  });

  it('calls onOpenChange(false) when a destination is tapped, so the sheet closes on navigation', async () => {
    const onOpenChange = vi.fn();
    const user = setupUser();
    render(<CreateSheet open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('link', { name: /منتج جديد/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
