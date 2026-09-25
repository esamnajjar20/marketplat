/**
 * SLOW-NET phase1 — route-level loading with card skeleton, not a bare spinner.
 */
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      variant="cards"
      title="جارٍ فتح الصفحة"
      description="لحظة من فضلك…"
    />
  );
}
