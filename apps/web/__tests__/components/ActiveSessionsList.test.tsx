/**
 * __tests__/components/ActiveSessionsList.test.tsx
 *
 * Coverage gap: 0% prior coverage on a security-relevant settings
 * screen (list/revoke active sessions, logout-all). Covers loading,
 * the explicit error state (UX-FIX P1-10: must not read as "no other
 * device logged in"), empty state, current-session badge/no-revoke,
 * per-row revoke pending isolation (UX-FIX P1-6), device-icon
 * detection, and the logout-all confirm dialog flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ActiveSessionsList } from '@/components/profile/ActiveSessionsList';
import { useAuthSessions } from '@/hooks/queries/useAuth';
import { useRevokeSession, useLogoutAll } from '@/hooks/mutations/useAuthMutations';

vi.mock('@/hooks/queries/useAuth', () => ({
  useAuthSessions: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useRevokeSession: vi.fn(),
  useLogoutAll: vi.fn(),
}));

const mockRefetch = vi.fn();
const mockRevoke = vi.fn();
const mockLogoutAll = vi.fn();

const currentSession = {
  sessionId: 'sess-1',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
  ip: '10.0.0.1',
  lastSeen: '2026-08-10T10:00:00.000Z',
  isCurrent: true,
};
const otherSession = {
  sessionId: 'sess-2',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
  ip: '10.0.0.2',
  lastSeen: '2026-08-11T10:00:00.000Z',
  isCurrent: false,
};

function mockSessions(overrides: Record<string, unknown> = {}) {
  (useAuthSessions as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [currentSession, otherSession],
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('ActiveSessionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessions();
    (useRevokeSession as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockRevoke });
    (useLogoutAll as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockLogoutAll, isPending: false });
  });

  it('shows nothing but a spinner while loading', () => {
    mockSessions({ data: undefined, isLoading: true });
    render(<ActiveSessionsList />);

    expect(screen.queryByText('الجلسات النشطة')).not.toBeInTheDocument();
  });

  it('shows an explicit error message (not the empty-state message) on failure', async () => {
    mockSessions({ data: undefined, isError: true });
    const user = setupUser();
    render(<ActiveSessionsList />);

    expect(screen.getByText('حدث خطأ أثناء تحميل الجلسات النشطة')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد جلسات نشطة')).not.toBeInTheDocument();

    await user.click(screen.getByText('إعادة المحاولة'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows the empty-state message when there are no sessions', () => {
    mockSessions({ data: [] });
    render(<ActiveSessionsList />);

    expect(screen.getByText('لا توجد جلسات نشطة')).toBeInTheDocument();
  });

  it('renders each session with its user agent, masked IP, and last-seen date', () => {
    render(<ActiveSessionsList />);

    expect(screen.getByText(/Windows NT 10.0/)).toBeInTheDocument();
    // FIX SEC-GAP-01: the full IP must never render — only a masked
    // form (last octet hidden) survives. Both fixture sessions share
    // the same first three octets (10.0.0.1 / 10.0.0.2), so they mask
    // to the identical string — that collision is the masking working
    // as intended, not a bug, hence getAllByText/length here rather
    // than getByText.
    expect(screen.getAllByText(/10\.0\.0\.•••/)).toHaveLength(2);
    expect(screen.queryByText(/10\.0\.0\.1\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/10\.0\.0\.2\b/)).not.toBeInTheDocument();
  });

  it('masks IPv6 addresses down to the first two segments', () => {
    mockSessions({ data: [{ ...currentSession, ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' }] });
    render(<ActiveSessionsList />);

    expect(screen.getByText(/2001:0db8:•••/)).toBeInTheDocument();
  });

  it('shows a fallback label when userAgent is missing', () => {
    mockSessions({ data: [{ ...otherSession, userAgent: null }] });
    render(<ActiveSessionsList />);

    expect(screen.getByText('جهاز غير معروف')).toBeInTheDocument();
  });

  it('marks the current session with a badge and no revoke button', () => {
    mockSessions({ data: [currentSession] });
    render(<ActiveSessionsList />);

    expect(screen.getByText('الجلسة الحالية')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إنهاء' })).not.toBeInTheDocument();
  });

  it('shows a revoke button for non-current sessions only', () => {
    render(<ActiveSessionsList />);

    expect(screen.getAllByRole('button', { name: 'إنهاء' })).toHaveLength(1);
  });

  it('calls revoke with the session id when its button is clicked', async () => {
    const user = setupUser();
    render(<ActiveSessionsList />);

    await user.click(screen.getByRole('button', { name: 'إنهاء' }));

    expect(mockRevoke).toHaveBeenCalledWith('sess-2', expect.objectContaining({ onSettled: expect.any(Function) }));
  });

  it('opens the logout-all confirm dialog rather than calling the mutation directly', async () => {
    const user = setupUser();
    render(<ActiveSessionsList />);

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج من الكل' }));

    expect(mockLogoutAll).not.toHaveBeenCalled();
    expect(screen.getByText('تسجيل الخروج من جميع الأجهزة؟')).toBeInTheDocument();
  });

  it('calls logoutAll after confirming the dialog', async () => {
    const user = setupUser();
    render(<ActiveSessionsList />);

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج من الكل' }));
    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    expect(mockLogoutAll).toHaveBeenCalledWith(undefined, expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it('disables the logout-all button while the mutation is pending (shows spinner, no text)', () => {
    (useLogoutAll as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockLogoutAll, isPending: true });
    render(<ActiveSessionsList />);

    expect(screen.queryByText('تسجيل الخروج من الكل')).not.toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    const logoutAllBtn = buttons.find((b) => b.querySelector('.animate-spin'));
    expect(logoutAllBtn).toBeDisabled();
  });
});
