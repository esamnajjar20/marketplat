/**
 * __tests__/components/UserMenu.test.tsx
 *
 * UserMenu's real logic: renders nothing when there's no user, shows
 * an admin-only link conditionally, and wires the logout mutation's
 * pending state into the menu item's label/disabled state. The dropdown
 * itself is a real Radix DropdownMenu (portal-rendered, closed until the
 * trigger is clicked) — tests open it via userEvent + findBy* (async)
 * rather than assuming content is present on initial render.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserMenu } from '@/components/layout/UserMenu';
import { useAuthStore } from '@/store/auth.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectIsAdmin: (s: { user?: { role?: string } }) => s.user?.role === 'ADMIN',
}));

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useLogout: vi.fn(),
}));

const mockUseAuthStore = vi.mocked(useAuthStore);
const mockUseLogout = vi.mocked(useLogout);

const regularUser = { id: 'u1', name: 'أحمد محمد', email: 'ahmad@example.com', role: 'USER' };
const adminUser = { id: 'u2', name: 'سارة', email: 'sara@example.com', role: 'ADMIN' };

const mockLogoutMutate = vi.fn();

function mockState(user: typeof regularUser | null) {
  mockUseAuthStore.mockImplementation((selector) => selector({ user } as never));
}

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLogout.mockReturnValue({
      mutate: mockLogoutMutate,
      isPending: false,
    } as never);
  });

  it('renders nothing when there is no authenticated user', () => {
    mockState(null);
    const { container } = render(<UserMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the user\'s initial as the trigger avatar', () => {
    mockState(regularUser);
    render(<UserMenu />);
    expect(screen.getByRole('button', { name: 'قائمة المستخدم' })).toHaveTextContent('أ');
  });

  it('shows the user name and email, and regular links, but no admin link for a non-admin user', async () => {
    mockState(regularUser);
    render(<UserMenu />);

    await userEvent.click(screen.getByRole('button', { name: 'قائمة المستخدم' }));

    expect(await screen.findByText('أحمد محمد')).toBeInTheDocument();
    expect(screen.getByText('ahmad@example.com')).toBeInTheDocument();
    expect(screen.getByText('لوحة التحكم')).toBeInTheDocument();
    expect(screen.getByText('إعلاناتي')).toBeInTheDocument();
    expect(screen.getByText('المفضلة')).toBeInTheDocument();
    expect(screen.getByText('الإعدادات')).toBeInTheDocument();
    expect(screen.queryByText('لوحة الإدارة')).not.toBeInTheDocument();
  });

  it('shows the admin dashboard link for an admin user', async () => {
    mockState(adminUser);
    render(<UserMenu />);

    await userEvent.click(screen.getByRole('button', { name: 'قائمة المستخدم' }));

    expect(await screen.findByText('لوحة الإدارة')).toBeInTheDocument();
  });

  it('calls logout when the logout item is clicked', async () => {
    mockState(regularUser);
    render(<UserMenu />);

    await userEvent.click(screen.getByRole('button', { name: 'قائمة المستخدم' }));
    const logoutItem = await screen.findByText('تسجيل الخروج');
    await userEvent.click(logoutItem);

    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it('shows a pending label and disables the logout item while logging out', async () => {
    mockState(regularUser);
    mockUseLogout.mockReturnValue({
      mutate: mockLogoutMutate,
      isPending: true,
    } as never);
    render(<UserMenu />);

    await userEvent.click(screen.getByRole('button', { name: 'قائمة المستخدم' }));

    expect(await screen.findByText('جارٍ تسجيل الخروج…')).toBeInTheDocument();
    expect(screen.queryByText('تسجيل الخروج')).not.toBeInTheDocument();
  });
});
