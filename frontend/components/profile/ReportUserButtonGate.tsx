'use client';

/**
 * FEAT-REPORT-USER-STORE: PublicProfileHeader is a server component (it
 * has no 'use client'), but knowing "is this my own profile" requires
 * the client-side auth store. This is the small client boundary that
 * does just that check and renders ReportUserButton only when the
 * viewer is signed in and looking at someone else's profile — a
 * lighter-weight mirror of the self-report guard reportsService already
 * enforces server-side (see reports.service.ts's submitReport).
 */
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ReportUserButton } from '@/components/profile/ReportUserButton';

interface Props {
  targetUserId: string;
}

export function ReportUserButtonGate({ targetUserId }: Props) {
  const currentUser = useAuthStore(selectUser);

  if (!currentUser || currentUser.id === targetUserId) return null;

  return (
    <div className="pt-1">
      <ReportUserButton userId={targetUserId} />
    </div>
  );
}
