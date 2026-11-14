import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useCallback, useState } from 'react';
import { View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { Spinner, Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';

import { pushOnce } from '@/lib/navigation';
import { fetchServiceProviders, type ProviderSummary } from '@/features/services/providers.api';
import { spacing } from '@/theme/tokens';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { toPaginatedResponse } from '@/lib/pagination';
import { RatingStars } from '@/components/ui/RatingStars';
import { AppFlashList } from '@/components/ui/AppFlashList';

const providerKey = (item: ProviderSummary) => item.id;

/** صف مقدم خدمة — memo حتى لا يُعاد رسمه عند تغيّر حالة الشاشة (تحميل/خطأ/فلتر). */
const ProviderRow = memo(function ProviderRow({ provider: p }: { provider: ProviderSummary }) {
  const { colors } = useAppTheme();
  const onPress = useCallback(() => pushOnce({ pathname: '/service-providers/[id]', params: { id: p.id } }), [p.id]);
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
            <SectionCard>
              <Text tone="ink" strong size={18}>
                {p.businessName || p.sellerProfile?.displayName || 'مقدم خدمة'}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }} numberOfLines={3}>
                {p.description || 'لا يوجد وصف.'}
              </Text>
              <RatingStars score={p.sellerProfile?.averageRating} count={p.sellerProfile?.totalRatings} />
              <Text tone="muted" size={13}>
                مناطق الخدمة: {p.serviceAreaCities?.join('، ') || 'غير محددة'}
              </Text>
              <Text tone="brand" strong>عرض الملف والخدمات ←</Text>
            </SectionCard>
          </Pressable>
  );
});

export default function ServiceProvidersScreen() {
  const { colors } = useAppTheme();

  const [city, setCity] = useState('');
  const [appliedCity, setAppliedCity] = useState('');
  const list = usePaginatedList<ProviderSummary>({
    key: `service-providers:${appliedCity}`,
    pageSize: 30,
    fetchPage: async (page) => toPaginatedResponse(await fetchServiceProviders({ city: appliedCity, page, limit: 30 })),
    getItemKey: (item) => item.id,
    mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل مقدمي الخدمات.'),
  });
  const { items, loading, refreshing, loadingMore, error, loadMoreError, hasNextPage, refresh, retry, loadMore } = list;
  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);
  const onRetry = useCallback(() => { void retry(); }, [retry]);
  const onLoadMore = useCallback(() => { void loadMore(); }, [loadMore]);
  const renderItem = useCallback(({ item }: { item: ProviderSummary }) => <ProviderRow provider={item} />, []);

  return (
    <PageShell title="مقدمو الخدمات" scroll={false}>
      <AppFlashList
        keyboardShouldPersistTaps="handled"
        data={items}
        keyExtractor={providerKey}
        refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Field label="تصفية حسب المدينة" value={city} onChangeText={setCity} placeholder="اسم المدينة" />
            <PrimaryButton label="تطبيق الفلتر" onPress={() => setAppliedCity(city.trim())} />
            {loading && items.length === 0 ? <Spinner color={colors.brand} /> : null}
            {error && items.length === 0 ? (
              <>
                <Notice>{error}</Notice>
                <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={onRetry} />
              </>
            ) : null}
            {!loading && items.length > 0 ? (
              <Text tone="muted">{items.length} مقدم خدمة معروض</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? <Notice tone="muted">لا توجد ملفات مقدمي خدمات مطابقة.</Notice> : undefined
        }
        renderItem={renderItem}
        ItemSeparatorComponent={ListGapMd}
        ListFooterComponent={
          <View style={{ gap: spacing.sm }}>
            {(loadMoreError || (error && items.length > 0)) ? <Notice>{loadMoreError ?? error}</Notice> : null}
            {hasNextPage ? (
              <PrimaryButton
                label={loadingMore ? 'جارٍ تحميل المزيد…' : 'تحميل المزيد'}
                variant="secondary"
                busy={loadingMore}
                onPress={onLoadMore}
              />
            ) : null}
          </View>
        }
      />
    </PageShell>
  );
}
