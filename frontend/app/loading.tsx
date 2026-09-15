/**
 * تحميل جذري أثناء بث Server Components — شريط + رسالة خفيفة.
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
