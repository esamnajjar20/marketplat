import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney, formatNumber } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useState } from 'react';
import { View } from 'react-native';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchServiceProviderAnalytics } from '@/features/services/service-management.api';
import { Notice, PageShell, SectionCard } from '@/components/ui';
import { fontWeights, spacing, radius } from '@/theme/tokens';
import { useAsyncResource } from '@/hooks/useAsyncResource';
const metrics: [
  string,
  string
][] = [
  ['totalViews', 'مشاهدات الخدمات'], ['activeListings', 'الخدمات النشطة'], ['pendingRequests', 'طلبات بانتظار الرد'], ['completedRequests', 'طلبات مكتملة'], ['upcomingAppointments', 'مواعيد قادمة'], ['averageRating', 'متوسط التقييم'], ['reviewCount', 'عدد التقييمات'], ['revenue', 'الإيرادات المسجلة']
];
export default function ServiceProviderAnalyticsScreen() {
  const { colors } = useAppTheme();
  const { accessToken } = useAuth();
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('30d');
  const resource = useAsyncResource<Record<string, unknown>>(
    () => fetchServiceProviderAnalytics(accessToken as string, period),
    {
      key: `${accessToken ? 1 : 0}|${period}`,
      manual: !accessToken,
      tag: 'service-provider-analytics',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الإحصاءات.'),
    },
  );
  const { data, loading } = resource;
  const error = resource.error ?? '';
  return <PageShell title="إحصاءات مقدم الخدمة">{!accessToken ? <><Notice>سجّل الدخول لعرض الإحصاءات.</Notice><Pressable accessibilityRole="button" onPress={() => pushOnce('/login')}><Text style={{
    textAlign: 'center', color: colors.brand, fontWeight: fontWeights.bold
  }}>تسجيل الدخول</Text></Pressable></> : <><View style={{
    flexDirection: 'row', gap: spacing.md
  }}>{([['7d', '7 أيام'], ['30d', '30 يومًا'], ['all', 'كل الفترة']] as const).map(([v, l]) => <Pressable accessibilityRole="button" key={v} onPress={() => setPeriod(v)} style={{
    flex: 1, padding: spacing.md, borderRadius: radius.control, backgroundColor: period === v ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: period === v ? colors.brand : colors.border
  }}><Text style={{
    textAlign: 'center', color: colors.ink, fontWeight: fontWeights.bold
  }}>{l}</Text></Pressable>)}</View>{loading ? <Notice tone="muted">جارٍ تحميل الإحصاءات…</Notice> : error ? <Notice>{error}</Notice> : data ? <><View style={{
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md
  }}>{metrics.map(([key, label]) => <View key={key} style={{
    width: '47%', flexGrow: 1
  }}><SectionCard><Text tone="muted" size={12}>{label}</Text><Text tone="ink" strong size={24}>{data[key] === null ? '—' : typeof data[key] === 'number' ? (key === 'revenue' ? formatMoney(data[key]) : formatNumber(data[key], 2)) : String(data[key] ?? '—')}</Text></SectionCard></View>)}</View><Text tone="ink" strong size={17}>الخدمات الأكثر مشاهدة</Text>{Array.isArray(data.topListings) && data.topListings.length ? data.topListings.map((row, index) => {
    const item = row as {
      id: string;
      title: string;
      views: number;
    };
    return <SectionCard key={item.id}><Text tone="ink" strong>{index + 1}. {item.title}</Text><Text tone="muted">{item.views} مشاهدة</Text></SectionCard>;
  }) : <Notice tone="muted">لا توجد بيانات كافية لترتيب الخدمات بعد.</Notice>}</> : null}</>}</PageShell>;
}
