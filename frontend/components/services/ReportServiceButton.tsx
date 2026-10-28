'use client';

import { ReportButton } from '@/components/shared/ReportButton';
import { useReportService } from '@/hooks/mutations/useReportMutations';

export function ReportServiceButton({ serviceListingId }: { serviceListingId: string }) {
  const mutation = useReportService(serviceListingId);
  return (
    <ReportButton
      triggerLabel="الإبلاغ عن هذه الخدمة"
      dialogTitle="الإبلاغ عن الخدمة"
      mutation={mutation}
    />
  );
}
