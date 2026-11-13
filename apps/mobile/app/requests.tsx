import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useAsyncResource } from '@/hooks/useAsyncResource';

import { pushOnce } from '@/lib/navigation';
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
} from '@/components/ui';
import { spacing, typography } from '@/theme/tokens';
import { AppFlashList } from '@/components/ui/AppFlashList';


const typeLabel: Record<string, string> = {
  SERVICE: 'خدمة',
  PRODUCT: 'منتج',
  RENTAL: 'تأجير',
};

const requestKeyExtractor = (item: MarketplaceRequest) => item.id;
const RequestSeparator = () => <View style={{ height: spacing.md }} />;

export default function RequestsScreen() {
  const { colors } = useAppTheme();

  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [cityApplied, setCityApplied] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    const t = setTimeout(() => { setQApplied(q); setCityApplied(city); }, 350);
    return () => clearTimeout(t);
  }, [q, city]);

  // دورة الجلب الموحّدة: الفلاتر المطبّقة هي هوية القائمة، فيُلغى الطلب القديم عند تغيّرها.
  const resource = useAsyncResource<MarketplaceRequest[]>(
    async () => (await fetchOpenRequests({ q: qApplied, city: cityApplied, type: type || undefined, sort })).items,
    {
      key: `${qApplied}|${cityApplied}|${type}|${sort}`,
      tag: 'requests',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الطلبات.'),
    },
  );
  const { loading, reload } = resource;
  const items = resource.data ?? [];
  const error = resource.error ?? '';
  const load = useCallback(() => reload(), [reload]);
  const softReload = useCallback(() => { void reload({ soft: true }); }, [reload]);

  return (
    <PageShell title="طلبات السوق" scroll={false}>
      <AppFlashList refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={softReload} tintColor={colors.brand} />}
        data={loading || error ? [] : items}
        keyExtractor={requestKeyExtractor}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <PrimaryButton label="+ إنشاء طلب جديد" onPress={() => pushOnce('/request-create')} />
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
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
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
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
          ) : undefined
        }
        renderItem={({ item }) => (
          <SectionCard onPress={() => pushOnce(`/requests/${encodeURIComponent(item.id)}`)}>
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
        ItemSeparatorComponent={RequestSeparator}
        ListFooterComponent={
          !loading && items.length > 0 ? <Notice tone="muted">{items.length} طلب مفتوح</Notice> : undefined
        }
      />
    </PageShell>
  );
}
