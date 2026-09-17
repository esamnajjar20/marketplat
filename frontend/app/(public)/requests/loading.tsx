import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function RequestsLoading() {
  return (
    <PageLoadingState
      variant="list"
      title="سوق الطلبات"
      description="نجلب الطلبات المفتوحة…"
    />
  );
}
