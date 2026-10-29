import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyOffers, type RequestOffer } from '@/features/requests/requests.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';

export default function MyOffersScreen() {
  const { accessToken, user } = useAuth();
  const [items, setItems] = useState<RequestOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setItems(await fetchMyOffers(accessToken, user?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل العروض.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell title="عروضي" scroll={false}>
      <FlatList
        data={loading || error || !accessToken ? [] : items}
        keyExtractor={(i, index) => i.id || String(index)}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
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
              <Text style={{ textAlign: 'right', fontSize: 17, fontWeight: '900', color: colors.ink }}>
                {i.request?.title || 'عرض على طلب'}
              </Text>
              <Text style={{ textAlign: 'right', fontSize: 20, fontWeight: '900', color: colors.brand }}>
                {i.price} ₪
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>{i.message || 'بدون رسالة'}</Text>
              <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>
                الحالة: {i.status || 'PENDING'}
              </Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      />
    </PageShell>
  );
}
