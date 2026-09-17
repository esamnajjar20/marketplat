import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function RequestDetailLoading() {
  return (
    <PageLoadingState
      variant="detail"
      title="تفاصيل الطلب"
      description="نجهّز الصفحة…"
    />
  );
}
