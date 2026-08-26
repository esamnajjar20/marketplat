/**
 * EditProfileButtonGate — only visible to the profile owner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditProfileButtonGate } from '@/components/profile/EditProfileButtonGate';
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

describe('EditProfileButtonGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when logged out', () => {
    vi.mocked(useAuthStore).mockImplementation((sel: any) =>
      typeof sel === 'function' ? sel({ user: null }) : null,
    );
    const { container } = render(<EditProfileButtonGate targetUserId="u1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when viewing another user profile', () => {
    vi.mocked(useAuthStore).mockImplementation((sel: any) =>
      typeof sel === 'function' ? sel({ user: { id: 'other' } }) : { id: 'other' },
    );
    const { container } = render(<EditProfileButtonGate targetUserId="u1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the edit link for the profile owner', () => {
    vi.mocked(useAuthStore).mockImplementation((sel: any) =>
      typeof sel === 'function' ? sel({ user: { id: 'u1' } }) : { id: 'u1' },
    );
    render(<EditProfileButtonGate targetUserId="u1" />);
    expect(screen.getByText('تعديل الملف الشخصي')).toBeInTheDocument();
  });
});
