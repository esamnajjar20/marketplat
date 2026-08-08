'use client';

/**
 * FIX INTEG-07: the "الإبلاغ عن هذا الإعلان" link in AdDetail.tsx had no
 * onClick — api/reports.api.ts (reportsApi.reportAd) was fully implemented
 * and tested, but nothing in the UI ever called it.
 *
 * FEAT-REPORT-USER-STORE: the dialog/select/textarea markup this file
 * used to own directly was extracted to components/shared/ReportButton.tsx
 * so ReportUserButton and ReportStoreButton don't duplicate it — this is
 * now a thin wrapper binding useReportAd(adId) into that shared dialog.
 * Public API (`<ReportAdButton adId={ad.id} />`) and behavior unchanged.
 */
import { ReportButton } from '@/components/shared/ReportButton';
import { useReportAd } from '@/hooks/mutations/useReportMutations';

interface Props {
  adId: string;
}

export function ReportAdButton({ adId }: Props) {
  const reportAd = useReportAd(adId);
  return (
    <ReportButton
      triggerLabel="الإبلاغ عن هذا الإعلان"
      dialogTitle="الإبلاغ عن الإعلان"
      mutation={reportAd}
    />
  );
}
