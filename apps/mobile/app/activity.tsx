import { useAppTheme } from '@/theme/ThemeProvider';
import { formatDate } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Spinner, Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyActivity, type ActivityRow } from '@/features/sales/sales-extra.api';
import { fontSizes, spacing, fontWeights, radius } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { AppFlashList } from '@/components/ui/AppFlashList';

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

const activityKeyExtractor = (item: ActivityRow) => item.id;
const ActivitySeparator = () => <View style={{ height: spacing.md }} />;

export default function ActivityScreen() {
  const { colors } = useAppTheme();

  const { accessToken, user, isRestoring } = useAuth();
  const [group, setGroup] = useState('ALL');
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');

  // تأخير بسيط: لا طلب جديد عند كل حرف (كان يُرسَل طلب لكل ضغطة مفتاح).
  useEffect(() => {
    const t = setTimeout(() => setQApplied(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // دورة الترقيم الموحّدة: هوية القائمة = (الحساب، المجموعة، البحث المطبّق).
  const list = usePaginatedList<ActivityRow>({
    key: `${user?.id ?? ''}|${group}|${qApplied}`,
    pageSize: 20,
    enabled: Boolean(accessToken) && !isRestoring,
    fetchPage: (page) => fetchMyActivity(accessToken as string, group, qApplied, page),
    getItemKey: activityKeyExtractor,
    mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل سجل النشاط.'),
  });
  const { items, loading, refreshing, loadingMore: more, hasNextPage: hasMore } = list;
  const error = list.error || list.loadMoreError || '';
  const { refresh, loadMore: loadMoreItems } = list;
  const applySearch = useCallback(() => {
    if (q === qApplied) void refresh();
    else setQApplied(q);
  }, [q, qApplied, refresh]);
  const pullRefresh = useCallback(() => { void refresh(); }, [refresh]);
  const loadMore = useCallback(() => { void loadMoreItems(); }, [loadMoreItems]);

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
      <AppFlashList refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullRefresh} tintColor={colors.brand} />}
        data={loading && items.length === 0 ? [] : items}
        keyExtractor={activityKeyExtractor}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
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
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    borderRadius: radius.pill,
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
            <PrimaryButton label="تطبيق البحث" onPress={applySearch} variant="secondary" />
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
        ItemSeparatorComponent={ActivitySeparator}
        ListFooterComponent={
          hasMore ? (
            <PrimaryButton label="تحميل المزيد" onPress={loadMore} busy={more} variant="secondary" />
          ) : undefined
        }
      />
    </PageShell>
  );
}
