import { useAppTheme } from '@/theme/ThemeProvider';
import { formatDate } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Spinner } from '@/components/ui';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyActivity, type ActivityRow } from '@/features/sales/sales-extra.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';
import { denseListPerf } from '@/lib/listPerformance';

const groups = [
  ['ALL', 'الكل'],
  ['ADS', 'الإعلانات'],
  ['PRODUCTS', 'المنتجات'],
  ['SERVICES', 'الخدمات'],
  ['STORES', 'المتاجر'],
  ['MESSAGES', 'الرسائل'],
  ['REQUESTS', 'الطلبات'],
  ['ACCOUNT', 'الحساب'],
] as const;


const activityLabels: Record<string, string> = {
  AD_CREATED: 'إنشاء إعلان', AD_UPDATED: 'تعديل إعلان', AD_DELETED: 'حذف إعلان',
  PRODUCT_CREATED: 'إنشاء منتج', PRODUCT_UPDATED: 'تعديل منتج', PRODUCT_DELETED: 'حذف منتج',
  SERVICE_CREATED: 'إنشاء خدمة', SERVICE_UPDATED: 'تعديل خدمة', SERVICE_DELETED: 'حذف خدمة',
  STORE_CREATED: 'إنشاء متجر', STORE_UPDATED: 'تعديل متجر',
  MESSAGE_SENT: 'إرسال رسالة', REQUEST_CREATED: 'إنشاء طلب', REQUEST_UPDATED: 'تحديث طلب',
  ORDER_CREATED: 'إنشاء طلب شراء', ORDER_CANCELLED: 'إلغاء طلب شراء',
  SALE_CREATED: 'تسجيل عملية بيع', PAYMENT_RECORDED: 'تسجيل دفعة',
  APPOINTMENT_CANCELLED: 'إلغاء موعد', LOGIN: 'تسجيل دخول', PROFILE_UPDATED: 'تحديث الحساب',
};
const entityLabels: Record<string, string> = {
  AD: 'إعلان', PRODUCT: 'منتج', SERVICE: 'خدمة', STORE: 'متجر',
  REQUEST: 'طلب', ORDER: 'طلب شراء', SALE: 'عملية بيع', USER: 'حساب',
  APPOINTMENT: 'موعد', CONVERSATION: 'محادثة', MESSAGE: 'رسالة',
};

const dateLabel = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? 'تاريخ غير متاح'
    : formatDate(d);
};

export default function ActivityScreen() {
  const { colors } = useAppTheme();

  const { accessToken, user, isRestoring } = useAuth();
  const [group, setGroup] = useState('ALL');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    const current = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const r = await fetchMyActivity(accessToken, group, q, 1);
      if (current !== seq.current) return;
      setItems(r.items);
      setPage(r.meta.page);
      setHasMore(r.meta.hasNextPage);
    } catch (e) {
      if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل سجل النشاط.');
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [accessToken, group, q]);

  useEffect(() => {
    if (!isRestoring) void load();
    return () => {
      seq.current += 1;
    };
  }, [isRestoring, load]);

  const loadMore = async () => {
    if (!accessToken || more || !hasMore) return;
    const current = seq.current;
    setMore(true);
    try {
      const r = await fetchMyActivity(accessToken, group, q, page + 1);
      if (current !== seq.current) return;
      setItems((old) => [...old, ...r.items.filter((x) => !old.some((y) => y.id === x.id))]);
      setPage(r.meta.page);
      setHasMore(r.meta.hasNextPage);
    } catch (e) {
      if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد.');
    } finally {
      setMore(false);
    }
  };

  if (!user) {
    return (
      <PageShell title="سجل النشاط">
        <Notice>سجّل الدخول لعرض نشاط حسابك.</Notice>
        <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
      </PageShell>
    );
  }

  return (
    <PageShell title="سجل النشاط" scroll={false}>
      <FlatList refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={() => void load()} tintColor={colors.brand} />}
        data={loading && items.length === 0 ? [] : items}
        keyExtractor={(item) => item.id}
        {...denseListPerf}
        contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            
            <Notice tone="muted">
              هذا السجل خاص بحسابك ويعرض الإجراءات التي سجّلها الخادم، وليس سجلًا عامًا للآخرين.
            </Notice>
            <Field label="بحث في النشاط" value={q} onChangeText={setQ} placeholder="ابحث في العنوان أو التفاصيل" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {groups.map(([v, label]) => (
                <Pressable accessibilityRole="button"
                  key={v}
                  onPress={() => setGroup(v)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderRadius: 22,
                    backgroundColor: group === v ? colors.brand : colors.surface,
                    borderWidth: 1,
                    borderColor: group === v ? colors.brand : colors.border,
                  }}
                >
                  <Text style={{ color: group === v ? colors.white : colors.ink, fontSize: fontSizes[13], fontWeight: fontWeights.bold }}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <PrimaryButton label="تطبيق البحث" onPress={() => void load()} variant="secondary" />
            {error ? <Notice>{error}</Notice> : null}
            {loading ? <Spinner color={colors.brand} /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? <Notice tone="muted">لا توجد أحداث مطابقة.</Notice> : undefined
        }
        renderItem={({ item }) => (
          <SectionCard>
            <Text tone="ink" strong size={16}>{item.title}</Text>
            {item.description ? (
              <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 22 }}>{item.description}</Text>
            ) : null}
            <Text tone="muted" size={11}>
              {activityLabels[item.type] || 'نشاط مسجل'} · {dateLabel(item.createdAt)}
            </Text>
            {item.entityType && item.entityId ? (
              <Text tone="brand" size={12}>
                النوع المرتبط: {entityLabels[item.entityType.toUpperCase()] || 'عنصر مرتبط'}
              </Text>
            ) : null}
          </SectionCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          hasMore ? (
            <PrimaryButton label="تحميل المزيد" onPress={() => void loadMore()} busy={more} variant="secondary" />
          ) : undefined
        }
      />
    </PageShell>
  );
}
