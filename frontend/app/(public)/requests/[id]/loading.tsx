import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function RequestDetailLoading() {
  return (
    <PageLoadingState
      variant="detail"
      title="جارٍ فتح الصفحة"
      description="لحظة من فضلك…"
    />
  );
}
