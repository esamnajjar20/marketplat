import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function ProtectedLoading() {
  return (
    <PageLoadingState
      variant="list"
      title="جارٍ التحميل"
      description="نجهّز صفحتك…"
    />
  );
}
