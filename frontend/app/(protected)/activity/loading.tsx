import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function Loading() {
  return (
    <PageLoadingState
      variant="list"
      title="النشاط"
      description="نجهّز المحتوى…"
    />
  );
}
