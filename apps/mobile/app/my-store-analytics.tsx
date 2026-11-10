import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { EmptyState, ErrorState, LoadingState, PageShell, SectionCard, SectionHeader } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontSizes, radius, spacing } from '@/theme/tokens';
import { formatNumber } from '@/lib/formatters';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyStoreAnalytics, type StoreAnalytics } from '@/features/commerce/commerce.api';

const fmt = (n: number) => formatNumber(n || 0);

export default function MyStoreAnalyticsScreen() {
  const { colors } = useAppTheme();
  const { getAccessToken, user, isRestoring } = useAuth();
  const hasLoaded = useRef(false);
  const [data, setData] = useState<StoreAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (isRestoring) return;
      const token = getAccessToken();
      if (!token) {
        setLoading(false);
        setError('انتهت الجلسة أو لم تكتمل استعادتها. سجّل الدخول مجددًا.');
        return;
      }
      if (refresh) setRefreshing(true);
      else if (!hasLoaded.current) setLoading(true);
      setError(null);
      try {
        setData(await fetchMyStoreAnalytics(token));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'تعذر تحميل الإحصاءات.');
      } finally {
        hasLoaded.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getAccessToken, isRestoring],
  );

  useEffect(() => {
    void load();
  }, [load]);

  let body;
  if (isRestoring || loading) {
    body = <LoadingState message={isRestoring ? 'جارٍ استعادة الجلسة…' : 'جاري تحميل الإحصاءات…'} />;
  } else if (!user) {
    body = (
      <EmptyState
        title="إحصاءات المتجر"
        description="سجّل الدخول لعرض إحصاءات متجرك."
        actionLabel="تسجيل الدخول"
        onAction={() => router.push('/login')}
      />
    );
  } else if (error) {
    body = <ErrorState description={error} onAction={() => void load()} />;
  } else if (data) {
    const metrics = [
      { label: 'الزيارات', value: data.views, icon: '◉' },
      { label: 'المتابعون', value: data.followers, icon: '♡' },
      { label: 'منتجات نشطة', value: data.activeProducts, icon: '◇' },
      { label: 'عروض نشطة', value: data.activePromotions, icon: '٪' },
      { label: 'متابعون جدد · 7 أيام', value: data.newFollowers7d, icon: '↗' },
      { label: 'متابعون جدد · 30 يومًا', value: data.newFollowers30d, icon: '↗' },
      { label: 'استخدامات العروض', value: data.promotionUses, icon: '✓' },
    ];
    body = (
      <>
        <Text style={{ fontSize: fontSizes[13], color: colors.muted, textAlign: 'right', lineHeight: 21 }}>
          ملخص أداء متجرك بناءً على البيانات المتاحة حاليًا. الأرقام لا تشمل المبيعات أو الإيرادات.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {metrics.map((item) => (
            <SectionCard
              key={item.label}
              style={{ width: '48%', flexGrow: 1, minHeight: 124, alignItems: 'flex-end', justifyContent: 'space-between' }}
            >
              <Text style={{ fontSize: fontSizes[20], color: colors.brand }}>{item.icon}</Text>
              <Text style={{ fontSize: fontSizes[25], fontWeight: '700', color: colors.ink }}>{fmt(item.value)}</Text>
              <Text style={{ fontSize: fontSizes[12], color: colors.muted, textAlign: 'right' }}>{item.label}</Text>
            </SectionCard>
          ))}
        </View>
        <SectionHeader title="المنتجات الأكثر مشاهدة" />
        {data.topProducts.length === 0 ? (
          <EmptyState title="لا توجد بيانات بعد" description="لا توجد بيانات مشاهدة كافية بعد." />
        ) : (
          data.topProducts.map((p) => (
            <SectionCard
              key={p.id}
              accessibilityLabel={`عرض المنتج ${p.name}`}
              onPress={() => router.push(`/products/${encodeURIComponent(p.id)}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              {p.image ? (
                <AppImage uri={p.image} style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.border }} />
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.brandSoft }} />
              )}
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text numberOfLines={2} style={{ fontSize: fontSizes[14], fontWeight: '700', color: colors.ink, textAlign: 'right' }}>
                  {p.name}
                </Text>
                <Text style={{ fontSize: fontSizes[12], color: colors.muted, textAlign: 'right' }}>{fmt(p.views)} مشاهدة</Text>
              </View>
              <Text style={{ fontSize: fontSizes[12], color: colors.brand, fontWeight: '700' }}>عرض</Text>
            </SectionCard>
          ))
        )}
      </>
    );
  } else {
    body = null;
  }

  return (
    <PageShell
      title="إحصاءات المتجر"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.brand}
          colors={[colors.brand]}
        />
      }
    >
      {body}
    </PageShell>
  );
}
