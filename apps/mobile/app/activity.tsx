import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyActivity, type ActivityRow } from '@/features/sales/sales-extra.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
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

const dateLabel = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? 'تاريخ غير متاح'
    : d.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function ActivityScreen() {
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
        <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
      </PageShell>
    );
  }

  return (
    <PageShell title="سجل النشاط" scroll={false}>
      <FlatList
        data={loading && items.length === 0 ? [] : items}
        keyExtractor={(item) => item.id}
        {...denseListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Notice tone="muted">
              هذا السجل خاص بحسابك ويعرض الإجراءات التي سجّلها الخادم، وليس سجلًا عامًا للآخرين.
            </Notice>
            <Field label="بحث في النشاط" value={q} onChangeText={setQ} placeholder="ابحث في العنوان أو التفاصيل" />
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
              {groups.map(([v, label]) => (
                <Pressable
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
                  <Text style={{ color: group === v ? colors.white : colors.ink, fontSize: 13, fontWeight: '800' }}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <PrimaryButton label="تطبيق البحث" onPress={() => void load()} variant="secondary" />
            {error ? <Notice>{error}</Notice> : null}
            {loading ? <ActivityIndicator color={colors.brand} /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? <Notice tone="muted">لا توجد أحداث مطابقة.</Notice> : undefined
        }
        renderItem={({ item }) => (
          <SectionCard>
            <Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '900', color: colors.ink }}>{item.title}</Text>
            {item.description ? (
              <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 22 }}>{item.description}</Text>
            ) : null}
            <Text style={{ textAlign: 'right', fontSize: 11, color: colors.muted }}>
              {item.type.replaceAll('_', ' ')} · {dateLabel(item.createdAt)}
            </Text>
            {item.entityType && item.entityId ? (
              <Text style={{ textAlign: 'right', color: colors.brand, fontSize: 12 }}>
                المرجع: {item.entityType} · {item.entityId}
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
