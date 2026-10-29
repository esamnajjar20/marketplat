import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { marketListPerf } from '@/lib/listPerformance';
import { router } from 'expo-router';
import { fetchOpenRequests, type MarketplaceRequest } from '@/features/requests/requests.api';
import {
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Notice,
  PageShell,
  PrimaryButton,
  SectionCard,
} from '@/components/MobileUI';
import { colors, spacing, typography } from '@/theme/tokens';
import { Text } from 'react-native';

const typeLabel: Record<string, string> = {
  SERVICE: 'خدمة',
  PRODUCT: 'منتج',
  RENTAL: 'تأجير',
};

export default function RequestsScreen() {
  const [items, setItems] = useState<MarketplaceRequest[]>([]);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [cityApplied, setCityApplied] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setQApplied(q); setCityApplied(city); }, 350);
    return () => clearTimeout(t);
  }, [q, city]);

  const load = useCallback(async () => {
    const current = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const r = await fetchOpenRequests({ q: qApplied, city: cityApplied, type: type || undefined, sort });
      if (current === seq.current) setItems(r.items);
    } catch (e) {
      if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل الطلبات.');
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [qApplied, cityApplied, type, sort]);

  useEffect(() => {
    void load();
    return () => { seq.current += 1; };
  }, [load]);

  return (
    <PageShell title="طلبات السوق" scroll={false}>
      <FlatList
        data={loading || error ? [] : items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <PrimaryButton label="+ إنشاء طلب جديد" onPress={() => router.push('/request-create')} />
            <View style={{ flexDirection: 'row-reverse', gap: spacing.sm, flexWrap: 'wrap' }}>
              {(
                [
                  ['', 'الكل'],
                  ['SERVICE', 'خدمات'],
                  ['PRODUCT', 'منتجات'],
                  ['RENTAL', 'تأجير'],
                ] as const
              ).map(([value, label]) => (
                <Chip key={value || 'all'} label={label} selected={type === value} onPress={() => setType(value)} />
              ))}
            </View>
            <Field label="بحث" value={q} onChangeText={setQ} placeholder="ما الذي يحتاجه صاحب الطلب؟" />
            <Field label="المدينة" value={city} onChangeText={setCity} placeholder="كل المدن" />
            <View style={{ flexDirection: 'row-reverse', gap: spacing.sm, flexWrap: 'wrap' }}>
              {(
                [
                  ['newest', 'الأحدث'],
                  ['expiring', 'قريب الانتهاء'],
                  ['budget_high', 'أعلى ميزانية'],
                  ['fewest_offers', 'أقل عروض'],
                ] as const
              ).map(([value, label]) => (
                <Chip key={value} label={label} selected={sort === value} onPress={() => setSort(value)} />
              ))}
            </View>
            {loading ? <LoadingState message="جاري تحميل الطلبات…" /> : null}
            {error ? <ErrorState title="تعذر تحميل الطلبات" description={error} onAction={() => void load()} /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <EmptyState title="لا توجد طلبات" description="جرّب تغيير الفلاتر أو أنشئ طلبًا جديدًا." />
          ) : null
        }
        renderItem={({ item }) => (
          <SectionCard onPress={() => router.push(`/requests/${encodeURIComponent(item.id)}`)}>
            <Text style={{ textAlign: 'right', ...typography.bodyStrong, color: colors.ink }}>
              {item.title}
            </Text>
            <Text style={{ textAlign: 'right', ...typography.caption, color: colors.muted }}>
              {[typeLabel[item.type] || item.type, item.city, item.status].filter(Boolean).join(' · ')}
            </Text>
            {typeof item._count?.offers === 'number' ? (
              <Text style={{ textAlign: 'right', ...typography.caption, color: colors.brand }}>
                {item._count.offers} عرض
              </Text>
            ) : null}
          </SectionCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          !loading && items.length > 0 ? <Notice tone="muted">{items.length} طلب مفتوح</Notice> : null
        }
      />
    </PageShell>
  );
}
