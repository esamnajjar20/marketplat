import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function ProtectedRequestsLoading() {
  return (
    <PageLoadingState
      variant="list"
      title="جارٍ التحميل"
      description="نجهّز طلباتك…"
    />
  );
}
