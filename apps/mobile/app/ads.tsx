import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Spinner } from '@/components/ui';
import { router } from 'expo-router';
import { fetchPublicAds, type AdListItem } from '@/features/ads/ads.api';
import { FilterChip } from '@/components/ui/FilterChip';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';

type Condition = 'NEW' | 'USED' | 'REFURBISHED';
const CONDITIONS: { value: Condition | ''; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'NEW', label: 'جديد' },
  { value: 'USED', label: 'مستعمل' },
  { value: 'REFURBISHED', label: 'مجدد' },
];

function adPrice(value: AdListItem['price']) {
  if (value === null || value === '') return 'السعر عند التواصل';
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? formatMoney(number)
    : 'السعر عند التواصل';
}

export default function AllAdsScreen() {
  const { colors } = useAppTheme();

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState<Condition | ''>('');
  const listKey = `public-ads:${query}:${condition}`;
  const fetchPage = useCallback(async (page: number, signal: AbortSignal) => {
    const result = await fetchPublicAds({
      page,
      limit: 12,
      search: query || undefined,
      condition: condition || undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      signal,
    });
    return { items: result.items, meta: { page: result.page, totalPages: result.totalPages } };
  }, [query, condition]);
  const list = usePaginatedList<AdListItem>({
    key: listKey,
    pageSize: 12,
    fetchPage,
    getItemKey: (item) => item.id,
    mapError: () => 'تعذر تحميل الإعلانات. تحقق من الاتصال ثم حاول مجددًا.',
  });

  const applySearch = () => {
    const nextQuery = search.trim();
    if (nextQuery === query) void list.refresh();
    else setQuery(nextQuery);
  };
  const applyCondition = (value: string) => {
    const parsed = value as Condition | '';
    if (parsed === condition) void list.refresh();
    else setCondition(parsed);
  };

  return <PageShell title="كل الإعلانات">
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <TextInput
        allowFontScaling
        maxFontSizeMultiplier={1.3}
        accessibilityLabel="ابحث في كل الإعلانات"
        placeholder="ابحث عن إعلان…"
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={applySearch}
        returnKeyType="search"
        style={{ flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, paddingHorizontal: spacing.md, color: colors.ink, textAlign: 'right', backgroundColor: colors.surface }}
      />
      <PrimaryButton label="بحث" onPress={applySearch} />
    </View>
    <Text tone="ink" strong>حالة الإعلان</Text>
    <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
      {CONDITIONS.map((option) => <FilterChip key={option.value || 'all'} label={option.label} selected={condition === option.value} onPress={() => applyCondition(option.value)} />)}
    </View>
    {list.loading ? <SectionCard><Spinner color={colors.brand} /><Text style={{ textAlign: 'center', color: colors.muted, marginTop: spacing.sm }}>جارٍ تحميل الإعلانات…</Text></SectionCard> : null}
    {list.error ? <SectionCard><Notice>{list.error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void list.retry()} /></SectionCard> : null}
    {!list.loading && !list.error && list.items.length === 0 ? <SectionCard><Text style={{ textAlign: 'center', color: colors.ink, fontWeight: fontWeights.bold }}>لا توجد إعلانات مطابقة</Text><Text style={{ textAlign: 'center', color: colors.muted }}>غيّر عبارة البحث أو حالة الإعلان.</Text></SectionCard> : null}
    {list.items.map((ad) => <Pressable key={ad.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/ads/[id]', params: { id: ad.id } })} style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 112 }}>
      {ad.images?.[0] ? <AppImage uri={ad.images[0]} style={{ width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.border }} /> : <View style={{ width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontSize: fontSizes[12], fontWeight: fontWeights.bold }}>بدون صورة</Text></View>}
      <View style={{ flex: 1, gap: spacing.xs, justifyContent: 'center' }}><Text numberOfLines={2} tone="ink" strong size={15}>{ad.title}</Text><Text tone="brand" strong size={14}>{adPrice(ad.price)}</Text><Text tone="muted" size={12}>{ad.city || ad.user?.city || 'الموقع غير محدد'}</Text><Text tone="muted" size={11}>{ad.condition === 'NEW' ? 'جديد' : ad.condition === 'USED' ? 'مستعمل' : ad.condition === 'REFURBISHED' ? 'مجدد' : 'حالة غير محددة'}</Text></View>
    </Pressable>)}
    {!list.loading && !list.error && list.items.length > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <PrimaryButton label="السابق" variant="secondary" disabled={list.page <= 1 || list.loading} onPress={() => void list.goToPage(list.page - 1)} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>الصفحة {list.page} من {list.totalPages}</Text></View>
      <PrimaryButton label="التالي" variant="secondary" disabled={!list.hasNextPage || list.loading} onPress={() => void list.goToPage(list.page + 1)} />
    </View> : null}
    <Notice tone="muted">تُعرض أحدث الإعلانات أولًا. حالة الإعلان تُرسل إلى الخادم فقط إذا كان فلتر الحالة محددًا.</Notice>
  </PageShell>;
}
