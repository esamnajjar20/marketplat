/**
 * SLOW-NET detail shell while RSC streams.
 */
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      variant="detail"
      title="جارٍ فتح الصفحة"
      description="لحظة من فضلك…"
    />
  );
}
