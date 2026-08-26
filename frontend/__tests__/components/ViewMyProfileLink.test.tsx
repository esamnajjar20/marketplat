/**
 * ViewMyProfileLink — link to own public profile.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewMyProfileLink } from '@/components/profile/ViewMyProfileLink';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('ViewMyProfileLink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when logged out', () => {
    vi.mocked(useAuthStore).mockImplementation((sel: any) =>
      typeof sel === 'function' ? sel({ user: null }) : null,
    );
    const { container } = render(<ViewMyProfileLink />);
    expect(container.firstChild).toBeNull();
  });

  it('links to the current user public profile', () => {
    vi.mocked(useAuthStore).mockImplementation((sel: any) =>
      typeof sel === 'function' ? sel({ user: { id: 'user-42' } }) : { id: 'user-42' },
    );
    render(<ViewMyProfileLink />);
    expect(screen.getByText(/عرض ملفي كما يظهر للآخرين/)).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('user-42');
  });
});
