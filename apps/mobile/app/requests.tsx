import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { pushOnce } from '@/lib/navigation';
import { fetchOpenRequests, type MarketplaceRequest } from '@/features/requests/requests.api';
import {
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Notice,
  PageShell,
  PrimaryButton,
  SectionCard,
} from '@/components/ui';
import { spacing, typography } from '@/theme/tokens';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { DOMAIN_STATUS_LABELS } from '@marketplat/contracts';

const typeLabel = DOMAIN_STATUS_LABELS.requestType;

const requestKeyExtractor = (item: MarketplaceRequest) => item.id;
const RequestSeparator = () => <View style={{ height: spacing.md }} />;

export default function RequestsScreen() {
  const { colors } = useAppTheme();

  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [cityApplied, setCityApplied] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    const timer = setTimeout(() => {
      setQApplied(q.trim());
      setCityApplied(city.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [q, city]);

  const list = usePaginatedList<MarketplaceRequest>({
    key: `${qApplied}|${cityApplied}|${type}|${sort}`,
    pageSize: 20,
    fetchPage: async (page, signal) => {
      const result = await fetchOpenRequests({
        page,
        limit: 20,
        q: qApplied,
        city: cityApplied,
        type: type || undefined,
        sort,
        signal,
      });
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
    },
    getItemKey: (item) => item.id,
    mapError: (error) => error instanceof Error && error.message ? error.message : 'تعذر تحميل الطلبات.',
  });

  const retryInitial = useCallback(() => void list.retry(), [list.retry]);
  const retryMore = useCallback(() => void list.retry(), [list.retry]);

  return (
    <PageShell title="طلبات السوق" scroll={false}>
      <AppFlashList
        refreshControl={<BrandRefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} />}
        data={list.items}
        keyExtractor={requestKeyExtractor}
        contentContainerStyle={{ paddingBottom: spacing.x4l, paddingHorizontal: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <PrimaryButton label="+ إنشاء طلب جديد" onPress={() => pushOnce('/request-create')} />
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {(
                [
                  ['', 'الكل'],
                  ['SERVICE', 'خدمات'],
                  ['PRODUCT', 'منتجات'],
                  ['RENTAL', 'تأجير'],
                ] as const
              ).map(([value, label]) => (
                <Chip key={value || 'all'} label={label} selected={type === value} onPress={() => setType(value)} />
              ))}
            </View>
            <Field label="بحث" value={q} onChangeText={setQ} placeholder="ما الذي يحتاجه صاحب الطلب؟" />
            <Field label="المدينة" value={city} onChangeText={setCity} placeholder="كل المدن" />
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {(
                [
                  ['newest', 'الأحدث'],
                  ['expiring', 'قريب الانتهاء'],
                  ['budget_high', 'أعلى ميزانية'],
                  ['fewest_offers', 'أقل عروض'],
                ] as const
              ).map(([value, label]) => (
                <Chip key={value} label={label} selected={sort === value} onPress={() => setSort(value)} />
              ))}
            </View>
            {list.loading && list.items.length === 0 ? <LoadingState message="جاري تحميل الطلبات…" /> : null}
            {list.error && list.items.length === 0 ? <ErrorState title="تعذر تحميل الطلبات" description={list.error} onAction={retryInitial} /> : null}
            {list.error && list.items.length > 0 ? <ErrorState title="تعذر تحديث الطلبات" description={list.error} onAction={retryInitial} /> : null}
          </View>
        }
        ListEmptyComponent={
          !list.loading && !list.error ? (
            <EmptyState title="لا توجد طلبات" description="جرّب تغيير الفلاتر أو أنشئ طلبًا جديدًا." />
          ) : undefined
        }
        renderItem={({ item }) => (
          <SectionCard onPress={() => pushOnce(`/requests/${encodeURIComponent(item.id)}`)}>
            <Text style={{ textAlign: 'right', ...typography.bodyStrong, color: colors.ink }}>
              {item.title}
            </Text>
            <Text style={{ textAlign: 'right', ...typography.caption, color: colors.muted }}>
              {[typeLabel[item.type] || item.type, item.city, item.status].filter(Boolean).join(' · ')}
            </Text>
            {typeof item._count?.offers === 'number' ? (
              <Text style={{ textAlign: 'right', ...typography.caption, color: colors.brand }}>
                {item._count.offers} عرض
              </Text>
            ) : null}
          </SectionCard>
        )}
        ItemSeparatorComponent={RequestSeparator}
        ListFooterComponent={
          list.items.length > 0 ? (
            <View style={{ gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xl }}>
              {list.loadMoreError ? <ErrorState title="تعذر تحميل بقية الطلبات" description={list.loadMoreError} onAction={retryMore} /> : null}
              {list.hasNextPage ? (
                <PrimaryButton
                  label={list.loadingMore ? 'جارٍ تحميل المزيد…' : list.loadMoreError ? 'إعادة المحاولة' : 'تحميل المزيد'}
                  busy={list.loadingMore}
                  disabled={list.loadingMore}
                  variant="secondary"
                  onPress={() => void (list.loadMoreError ? list.retry() : list.loadMore())}
                />
              ) : null}
              <Notice tone="muted">
                {list.totalCount > list.items.length
                  ? `تعرض ${list.items.length} من أصل ${list.totalCount} طلب مفتوح`
                  : `${list.totalCount || list.items.length} طلب مفتوح`}
              </Notice>
            </View>
          ) : undefined
        }
      />
    </PageShell>
  );
}
