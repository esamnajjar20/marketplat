/**
 * __tests__/components/ReportUserButtonGate.test.tsx
 *
 * Previously uncovered. The component's own comment describes it as a
 * client-side mirror of a server-side guard (reports.service.ts's
 * submitReport rejects self-reports) — a regression here either shows
 * "report this user" on the viewer's own profile (confusing, and a
 * guaranteed-to-fail action since the backend rejects it anyway), or
 * hides it for a signed-out viewer looking at someone else's profile
 * when it should be visible there too... actually the reverse: a
 * signed-out viewer should see nothing at all (ReportButton's own auth
 * gate handles authenticated-but-blocked; this gate's job is purely
 * "is there even a viewer, and is it a different person").
 *
 * Coverage:
 *  - No signed-in user: renders nothing
 *  - Signed-in user viewing their own profile: renders nothing
 *  - Signed-in user viewing someone else's profile: renders
 *    ReportUserButton with that target's id
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportUserButtonGate } from '@/components/profile/ReportUserButtonGate';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('@/components/profile/ReportUserButton', () => ({
  ReportUserButton: ({ userId }: { userId: string }) => <div>ReportUserButton: {userId}</div>,
}));

function mockCurrentUser(user: { id: string } | null) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { user: { id: string } | null }) => unknown) => selector({ user }),
  );
}

describe('ReportUserButtonGate', () => {
  it('renders nothing when there is no signed-in user', () => {
    mockCurrentUser(null);
    const { container } = render(<ReportUserButtonGate targetUserId="user-2" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when viewing your own profile', () => {
    mockCurrentUser({ id: 'user-1' });
    const { container } = render(<ReportUserButtonGate targetUserId="user-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders ReportUserButton with the target id when viewing someone else', () => {
    mockCurrentUser({ id: 'user-1' });
    render(<ReportUserButtonGate targetUserId="user-2" />);
    expect(screen.getByText('ReportUserButton: user-2')).toBeInTheDocument();
  });
});
