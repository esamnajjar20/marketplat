import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function PublicLoading() {
  return (
    <PageLoadingState
      variant="cards"
      title="جارٍ التحميل"
      description="نجهّز المحتوى…"
    />
  );
}
