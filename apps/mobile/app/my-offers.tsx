import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyOffers, type RequestOffer } from '@/features/requests/requests.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { statusLabel } from '@/lib/status-labels';
import { fontSizes, colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';

export default function MyOffersScreen() {
  const { accessToken, user } = useAuth();
  const [items, setItems] = useState<RequestOffer[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const limit = 30;

  const load = useCallback(async (reset = true) => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    if (reset) {
      setLoading(items.length === 0);
      setRefreshing(items.length > 0);
      setError('');
    } else {
      if (loadingMore || loading || page >= totalPages) return;
      setLoadingMore(true);
    }
    const requestedPage = reset ? 1 : page + 1;
    try {
      const result = await fetchMyOffers(accessToken, user?.id, requestedPage, limit);
      setItems((old) => {
        if (reset) return result.items;
        const ids = new Set(old.map((item) => item.id));
        return [...old, ...result.items.filter((item) => !ids.has(item.id))];
      });
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل العروض.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [accessToken, user?.id, items.length, loading, loadingMore, page, totalPages]);

  // The effect resets only when its identity/auth scope changes; load also depends on paging state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void load(true);
  }, [accessToken, user?.id]);

  return (
    <PageShell title="عروضي" scroll={false}>
      <FlatList
        data={!accessToken ? [] : items}
        keyExtractor={(i, index) => i.id || String(index)}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <PrimaryButton label="استعراض الطلبات المفتوحة" onPress={() => router.push('/requests')} />
            {!accessToken ? <Notice>سجّل الدخول لعرض عروضك.</Notice> : null}
            {loading ? <ActivityIndicator color={colors.brand} /> : null}
            {error ? <Notice>{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          accessToken && !loading && !error ? <Notice tone="muted">لم تقدم أي عروض بعد.</Notice> : undefined
        }
        renderItem={({ item: i }) => (
          <Pressable
            onPress={() =>
              i.request?.id && router.push({ pathname: '/requests/[id]', params: { id: i.request.id } })
            }
          >
            <SectionCard>
              <Text style={{ textAlign: 'right', fontSize: fontSizes[17], fontWeight: '900', color: colors.ink }}>
                {i.request?.title || 'عرض على طلب'}
              </Text>
              <Text style={{ textAlign: 'right', fontSize: fontSizes[20], fontWeight: '900', color: colors.brand }}>
                {i.price} ₪
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>{i.message || 'بدون رسالة'}</Text>
              <Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[12] }}>
                الحالة: {statusLabel(i.status || 'PENDING')}
              </Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} /> : page < totalPages ? <PrimaryButton label="تحميل المزيد" variant="secondary" onPress={() => void load(false)} /> : items.length ? <PrimaryButton label="تحديث" variant="secondary" onPress={() => void load(true)} /> : undefined}
        onEndReached={() => { if (!loading && !loadingMore && page < totalPages) void load(false); }}
        onEndReachedThreshold={0.4}
      />
    </PageShell>
  );
}
