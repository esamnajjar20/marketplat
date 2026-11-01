import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyReports, type MyReport } from '@/features/account/social.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, colors, spacing } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';
import { marketListPerf } from '@/lib/listPerformance';
const labels: Record<string, string> = { AD: 'إعلان', USER: 'مستخدم', STORE: 'متجر', PRODUCT: 'منتج', SERVICE_LISTING: 'خدمة', SCAM: 'احتيال', FAKE: 'محتوى مزيف', OFFENSIVE: 'محتوى مسيء', SPAM: 'محتوى مزعج', PENDING: 'قيد المراجعة', REVIEWED: 'تمت المراجعة', RESOLVED: 'تمت المعالجة', DISMISSED: 'أُغلق البلاغ' };
export default function MyReportsScreen() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<MyReport[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const limit = 20;

  const load = useCallback(async (reset = true) => {
    if (!accessToken) { setLoading(false); return; }
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
      const result = await fetchMyReports(accessToken, requestedPage, limit);
      setItems((old) => {
        if (reset) return result.items;
        const ids = new Set(old.map((item) => item.id));
        return [...old, ...result.items.filter((item) => !ids.has(item.id))];
      });
      setPage(result.meta?.page ?? requestedPage);
      setTotalPages(result.meta?.totalPages ?? (result.items.length < limit ? requestedPage : requestedPage + 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل البلاغات.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [accessToken, items.length, loading, loadingMore, page, totalPages]);

  // The effect resets only when its identity/auth scope changes; load also depends on paging state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(true); }, [accessToken]);

  return (
    <PageShell title="بلاغاتي" scroll={false}>
      {!accessToken ? <View style={{ gap: spacing.md }}><Notice>سجّل الدخول لعرض البلاغات التي أرسلتها.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></View> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />}
          ListHeaderComponent={<View style={{ gap: spacing.md }}>{loading ? <ActivityIndicator color={colors.brand} /> : null}{error ? <Notice>{error}</Notice> : null}</View>}
          ListEmptyComponent={!loading && !error ? <Notice tone="muted">لم ترسل أي بلاغ حتى الآن.</Notice> : undefined}
          renderItem={({ item }) => (
            <SectionCard>
              <Text style={{ textAlign: 'right', fontWeight: '900', fontSize: fontSizes[15], lineHeight: 22, color: colors.ink }}>{labels[item.targetType || ''] || item.targetType || 'بلاغ'} · {labels[item.reason || ''] || item.reason || 'سبب غير محدد'}</Text>
              <Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[13], lineHeight: 20 }}>الحالة: {labels[item.status || ''] || item.status || 'غير معروفة'}</Text>
              {item.createdAt ? <Text style={{ textAlign: 'right', color: colors.muted }}>التاريخ: {formatSafeDate(item.createdAt, 'date')}</Text> : null}
              {item.notes ? <Text style={{ textAlign: 'right', color: colors.ink, lineHeight: 22 }}>{item.notes}</Text> : null}
            </SectionCard>
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} /> : page < totalPages ? <PrimaryButton label="تحميل المزيد" variant="secondary" onPress={() => void load(false)} /> : items.length > 0 ? <PrimaryButton label="تحديث" variant="secondary" onPress={() => void load(true)} /> : undefined}
          onEndReached={() => { if (!loading && !loadingMore && page < totalPages) void load(false); }}
          onEndReachedThreshold={0.4}
        />
      )}
    </PageShell>
  );
}
