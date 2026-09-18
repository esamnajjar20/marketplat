/**
 * تحميل الصفحات العامة — هيكل بطاقات مفهوم بدل شريط فقط.
 */
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export default function PublicLoading() {
  return (
    <PageLoadingState
      variant="cards"
      title="جارٍ التحميل"
      description="نجهّز الإعلانات والمحتوى…"
    />
  );
}
