import { View } from 'react-native';
import { spacing } from '@/theme/tokens';
import type { PaginatedListState } from '@/hooks/usePaginatedList';
import { PrimaryButton } from './Button';
import { EmptyState, ErrorState, Notice, SkeletonList, Spinner } from './Feedback';

type ListLike = Pick<
  PaginatedListState<unknown>,
  'items' | 'loading' | 'error' | 'loadingMore' | 'loadMoreError' | 'hasNextPage' | 'refresh' | 'loadMore' | 'retry'
>;

/**
 * مصدر واحد لحالات القوائم المُرقَّمة (تحميل أولي / خطأ / فراغ).
 * يُمرَّر إلى `ListEmptyComponent` فتظهر الحالة الصحيحة فقط عندما تكون القائمة فارغة،
 * بدل أن تبني كل شاشة نسختها الخاصة من Spinner + Notice + زر إعادة محاولة.
 */
export function ListEmpty({
  list,
  loadingMessage = 'جاري التحميل…',
  errorTitle = 'تعذر تحميل القائمة',
  emptyTitle,
  emptyDescription,
  actionLabel,
  onAction,
}: {
  list: ListLike;
  loadingMessage?: string;
  errorTitle?: string;
  emptyTitle: string;
  emptyDescription?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (list.loading) return <SkeletonList message={loadingMessage} />;
  if (list.error) return <ErrorState title={errorTitle} description={list.error} onAction={() => void list.retry()} />;
  return <EmptyState title={emptyTitle} description={emptyDescription} actionLabel={actionLabel} onAction={onAction} />;
}

/** فشل التحديث بينما توجد بيانات معروضة: تنبيه مضغوط مع إعادة المحاولة بدل حجب القائمة. */
export function ListStaleError({ list }: { list: ListLike }) {
  if (!list.error || list.items.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Notice>{list.error}</Notice>
      <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.retry()} />
    </View>
  );
}

/** تذييل موحّد: مؤشر تحميل، أو خطأ مع إعادة محاولة، أو زر «تحميل المزيد». */
export function PaginatedFooter({ list, moreLabel = 'تحميل المزيد' }: { list: ListLike; moreLabel?: string }) {
  if (list.loadingMore) {
    return (
      <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
        <Spinner />
      </View>
    );
  }
  if (list.loadMoreError) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Notice>{list.loadMoreError}</Notice>
        <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.retry()} />
      </View>
    );
  }
  if (list.hasNextPage) {
    return <PrimaryButton label={moreLabel} variant="secondary" onPress={() => void list.loadMore()} />;
  }
  return null;
}
