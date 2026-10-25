import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';
import { LOADING_COPY } from '@/lib/loadingCopy';

export default function Loading() {
  return (
    <PageLoadingState
      variant="detail"
      title={LOADING_COPY.page}
      description="نجهّز تفاصيل الإعلان…"
    />
  );
}
