'use client';

/**
 * FEAT-REPORT-USER-STORE: reporting a user profile had no route, no
 * mutation, and no button anywhere — only ads could be reported before
 * this. Follows ReportAdButton.tsx's thin-wrapper pattern over the
 * shared ReportButton dialog.
 */
import { ReportButton } from '@/components/shared/ReportButton';
import { useReportUser } from '@/hooks/mutations/useReportMutations';

interface Props {
  userId: string;
}

export function ReportUserButton({ userId }: Props) {
  const reportUser = useReportUser(userId);
  return (
    <ReportButton
      triggerLabel="الإبلاغ عن هذا المستخدم"
      dialogTitle="الإبلاغ عن المستخدم"
      mutation={reportUser}
    />
  );
}
