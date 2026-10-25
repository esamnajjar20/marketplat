import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

/** Route-specific skeleton content, rendered by the shared loading system. */
export default function Loading() {
  return (
    <PageLoadingState
      variant="list"
      title="جارٍ تحميل قائمة المتابعة"
      description="نجهّز الحسابات التي يتابعها هذا المستخدم…"
    />
  );
}
