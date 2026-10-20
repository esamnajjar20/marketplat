import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

/** Route-specific skeleton content, rendered by the shared loading system. */
export default function Loading() {
  return (
    <PageLoadingState
      variant="cards"
      title="جارٍ تحميل الأقساط"
      description="نجهّز بيانات الأقساط…"
    />
  );
}
