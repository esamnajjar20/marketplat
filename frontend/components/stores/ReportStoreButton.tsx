'use client';

/**
 * FEAT-REPORT-USER-STORE: reporting a store had no route, no mutation,
 * and no button anywhere — only ads could be reported before this.
 * Follows ReportAdButton.tsx's thin-wrapper pattern over the shared
 * ReportButton dialog.
 */
import { ReportButton } from '@/components/shared/ReportButton';
import { useReportStore } from '@/hooks/mutations/useReportMutations';

interface Props {
  storeId: string;
}

export function ReportStoreButton({ storeId }: Props) {
  const reportStore = useReportStore(storeId);
  return (
    <ReportButton
      triggerLabel="الإبلاغ عن هذا المتجر"
      dialogTitle="الإبلاغ عن المتجر"
      mutation={reportStore}
    />
  );
}
