/**
 * __tests__/components/ProtectedHeader.test.tsx
 *
 * ProtectedHeader is pure static markup (no conditional logic, unlike
 * PublicHeader) — renders on every authenticated page (dashboard,
 * my-ads, settings, etc.). This also pins down the ROUTES.adCreate
 * link: the component previously referenced the nonexistent
 * ROUTES.createAd (real key is ROUTES.adCreate), a build-breaking
 * TypeScript error caught while writing this suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectedHeader } from '@/components/layout/ProtectedHeader';
import { ROUTES } from '@/lib/constants';

vi.mock('@/components/layout/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

describe('ProtectedHeader', () => {
  it('renders the logo linking to the home route', () => {
    render(<ProtectedHeader />);

    const homeLink = screen.getAllByRole('link').find((a) => a.getAttribute('href') === ROUTES.home);
    expect(homeLink).toBeDefined();
  });

  it('renders a "نشر إعلان" button linking to the real ad-create route', () => {
    render(<ProtectedHeader />);

    const createLink = screen.getByText('+ نشر إعلان').closest('a');
    expect(createLink).toHaveAttribute('href', ROUTES.adCreate);
  });

  it('renders the UserMenu', () => {
    render(<ProtectedHeader />);
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });
});
