import { useCallback } from 'react';
import { View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';

import { pushOnce } from '@/lib/navigation';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { EmptyState, ErrorState, LoadingState, PageShell, SectionCard, SectionHeader } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
import { formatNumber } from '@/lib/formatters';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyStoreAnalytics, type StoreAnalytics } from '@/features/commerce/commerce.api';
import { useAsyncResource } from '@/hooks/useAsyncResource';

const fmt = (n: number | string) => typeof n === 'number' ? formatNumber(n || 0) : n;

export default function MyStoreAnalyticsScreen() {
  const { colors } = useAppTheme();
  const { getAccessToken, user, isRestoring } = useAuth();
  // دورة الجلب الموحّدة؛ التحديث بالسحب «ناعم» فيُبقي البيانات ظاهرة.
  const resource = useAsyncResource<StoreAnalytics>(
    async () => {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت الجلسة أو لم تكتمل استعادتها. سجّل الدخول مجددًا.');
      return fetchMyStoreAnalytics(token);
    },
    {
      key: user?.id ?? '',
      manual: isRestoring,
      tag: 'my-store-analytics',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الإحصاءات.'),
    },
  );
  const { data, loading, refreshing, error, reload } = resource;
  const retry = useCallback(() => { void reload(); }, [reload]);
  const pullReload = useCallback(() => { void reload({ soft: true }); }, [reload]);

  let body;
  if (isRestoring || loading) {
    body = <LoadingState message={isRestoring ? 'جارٍ استعادة الجلسة…' : 'جاري تحميل الإحصاءات…'} />;
  } else if (!user) {
    body = (
      <EmptyState
        title="إحصاءات المتجر"
        description="سجّل الدخول لعرض إحصاءات متجرك."
        actionLabel="تسجيل الدخول"
        onAction={() => pushOnce('/login')}
      />
    );
  } else if (error) {
    body = <ErrorState description={error} onAction={retry} />;
  } else if (data) {
    const metrics = [
      { label: 'الزيارات', value: data.views, icon: '◉' },
      { label: 'المتابعون', value: data.followers, icon: '♡' },
      { label: 'منتجات نشطة', value: data.activeProducts, icon: '◇' },
      { label: 'عروض نشطة', value: data.activePromotions, icon: '٪' },
      { label: 'متابعون جدد · 7 أيام', value: data.newFollowers7d, icon: '↗' },
      { label: 'متابعون جدد · 30 يومًا', value: data.newFollowers30d, icon: '↗' },
      { label: 'استخدامات العروض', value: data.promotionUses, icon: '✓' },
      { label: 'طلبات المتجر · كل الفترة', value: data.orders?.totalCount ?? '—', icon: '▤' },
    ];
    body = (
      <>
        <Text style={{ fontSize: fontSizes[13], color: colors.muted, textAlign: 'right', lineHeight: 21 }}>
          ملخص أداء متجرك بناءً على البيانات المتاحة حاليًا. طلبات الشراء معروضة منفصلة، وقيمتها ليست مبالغ محصّلة ولا تُدمج مع سجل المبيعات اليدوية.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {metrics.map((item) => (
            <SectionCard
              key={item.label}
              style={{ width: '48%', flexGrow: 1, minHeight: 124, alignItems: 'flex-start', justifyContent: 'space-between' }}
            >
              <Text style={{ fontSize: fontSizes[20], color: colors.brand }}>{item.icon}</Text>
              <Text style={{ fontSize: fontSizes[24], fontWeight: fontWeights.bold, color: colors.ink }}>{fmt(item.value)}</Text>
              <Text tone="muted" size={12}>{item.label}</Text>
            </SectionCard>
          ))}
        </View>
        {data.orders ? <SectionCard>
          <SectionHeader title="حالات طلبات المتجر · كل الفترة" subtitle="طلبات الشراء عبر المتجر، منفصلة عن سجل المبيعات اليدوية." />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {([
              ['قيد الانتظار', data.orders.byStatus?.PENDING ?? 0],
              ['مؤكدة', data.orders.byStatus?.CONFIRMED ?? 0],
              ['قيد التجهيز', data.orders.byStatus?.PROCESSING ?? 0],
              ['تم الشحن', data.orders.byStatus?.SHIPPED ?? 0],
              ['تم التسليم', data.orders.byStatus?.DELIVERED ?? 0],
              ['ملغاة', data.orders.byStatus?.CANCELLED ?? 0],
            ] as const).map(([label, value]) => (
              <View key={label} style={{ width: '31%', flexGrow: 1, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md }}>
                <Text style={{ color: colors.ink, fontSize: fontSizes[18], fontWeight: fontWeights.bold }}>{fmt(value)}</Text>
                <Text tone="muted" size={11}>{label}</Text>
              </View>
            ))}
          </View>
          <Text tone="muted" size={12}>قيمة الطلبات غير الملغاة حسب العملة:</Text>
          {data.orders.nonCancelledValueByCurrency?.length ? data.orders.nonCancelledValueByCurrency.map((row) => (
            <Text key={`active-${row.currency}`} tone="ink">{formatNumber(row.total, 2)} {row.currency}</Text>
          )) : <Text tone="muted" size={12}>لا توجد طلبات بعد.</Text>}
          <Text tone="muted" size={12}>قيمة الطلبات المسلّمة حسب العملة:</Text>
          {data.orders.deliveredValueByCurrency?.length ? data.orders.deliveredValueByCurrency.map((row) => (
            <Text key={`delivered-${row.currency}`} tone="ink">{formatNumber(row.total, 2)} {row.currency}</Text>
          )) : <Text tone="muted" size={12}>لا توجد طلبات مسلّمة بعد.</Text>}
        </SectionCard> : <SectionCard><Text tone="muted" size={12}>مؤشرات طلبات الشراء غير متاحة من إصدار الخادم الحالي.</Text></SectionCard>}
        <SectionHeader title="المنتجات الأكثر مشاهدة · كل الفترة" />
        {data.topProducts.length === 0 ? (
          <EmptyState title="لا توجد بيانات بعد" description="لا توجد بيانات مشاهدة كافية بعد." />
        ) : (
          data.topProducts.map((p) => (
            <SectionCard
              key={p.id}
              accessibilityLabel={`عرض المنتج ${p.name}`}
              onPress={() => pushOnce(`/products/${encodeURIComponent(p.id)}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              {p.image ? (
                <AppImage variant="list" uri={p.image} style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.border }} />
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.brandSoft }} />
              )}
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text numberOfLines={2} tone="ink" strong size={14}>
                  {p.name}
                </Text>
                <Text tone="muted" size={12}>{fmt(p.views)} مشاهدة</Text>
              </View>
              <Text style={{ fontSize: fontSizes[12], color: colors.brand, fontWeight: fontWeights.bold }}>عرض</Text>
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
        <BrandRefreshControl
          refreshing={refreshing}
          onRefresh={pullReload}
        />
      }
    >
      {body}
    </PageShell>
  );
}
