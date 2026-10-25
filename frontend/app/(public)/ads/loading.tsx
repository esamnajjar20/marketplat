import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';
import { LOADING_COPY } from '@/lib/loadingCopy';

export default function Loading() {
  return (
    <PageLoadingState
      variant="browse"
      title={LOADING_COPY.page}
      description="لحظة من فضلك…"
    />
  );
}
