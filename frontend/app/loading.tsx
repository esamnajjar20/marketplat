/**
 * Root route loading — shared minimal chrome for any unmatched segment.
 */
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function RootLoading() {
  return (
    <PageLoadingState
      variant="minimal"
      title="جارٍ فتح الصفحة"
      description="لحظة من فضلك…"
    />
  );
}
