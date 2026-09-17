import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      variant="list"
      title="عمليات البحث"
      description="نجهّز المحتوى…"
    />
  );
}
