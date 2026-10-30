import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { fetchPublicAds, type AdListItem } from '@/features/ads/ads.api';
import { FilterChip } from '@/components/ui/FilterChip';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Condition = 'NEW' | 'USED' | 'REFURBISHED';
const CONDITIONS: { value: Condition | ''; label: string }[] = [{ value: '', label: 'الكل' }, { value: 'NEW', label: 'جديد' }, { value: 'USED', label: 'مستعمل' }, { value: 'REFURBISHED', label: 'مجدد' }];
function adPrice(value: AdListItem['price']) { if (value === null || value === '') return 'السعر عند التواصل'; const number = Number(value); return Number.isFinite(number) && number > 0 ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(number)} ₪` : 'السعر عند التواصل'; }
export default function AllAdsScreen() {
  const [items, setItems] = useState<AdListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState<Condition | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (nextPage = 1, searchText = '', selectedCondition: Condition | '' = '') => {
    setLoading(true); setError('');
    try {
      const result = await fetchPublicAds({ page: nextPage, limit: 12, search: searchText.trim() || undefined, condition: selectedCondition || undefined, sortBy: 'createdAt', sortOrder: 'desc' });
      setItems(result.items); setPage(result.page); setTotalPages(Math.max(1, result.totalPages ?? result.page));
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل الإعلانات.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(1, '', ''); }, [load]);
  const applySearch = () => { setQuery(search.trim()); void load(1, search.trim(), condition); };
  const applyCondition = (value: string) => { const parsed = value as Condition | ''; setCondition(parsed); void load(1, query, parsed); };
  return <PageShell title="كل الإعلانات">
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm }}>
      <TextInput accessibilityLabel="ابحث في كل الإعلانات" placeholder="ابحث عن إعلان…" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} onSubmitEditing={applySearch} returnKeyType="search" style={{ flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, paddingHorizontal: spacing.md, color: colors.ink, textAlign: 'right', backgroundColor: colors.surface }} />
      <PrimaryButton label="بحث" onPress={applySearch} />
    </View>
    <Text style={{ textAlign: 'right', color: colors.ink, fontWeight: '800' }}>حالة الإعلان</Text>
    <View style={{ flexDirection: 'row-reverse', gap: spacing.sm, flexWrap: 'wrap' }}>{CONDITIONS.map((option) => <FilterChip key={option.value || 'all'} label={option.label} selected={condition === option.value} onPress={() => applyCondition(option.value)} />)}</View>
    {loading ? <SectionCard><ActivityIndicator color={colors.brand} /><Text style={{ textAlign: 'center', color: colors.muted, marginTop: spacing.sm }}>جارٍ تحميل الإعلانات…</Text></SectionCard> : null}
    {error ? <SectionCard><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load(page, query, condition)} /></SectionCard> : null}
    {!loading && !error && items.length === 0 ? <SectionCard><Text style={{ textAlign: 'center', color: colors.ink, fontWeight: '800' }}>لا توجد إعلانات مطابقة</Text><Text style={{ textAlign: 'center', color: colors.muted }}>غيّر عبارة البحث أو حالة الإعلان.</Text></SectionCard> : null}
    {items.map((ad) => <Pressable key={ad.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/ads/[id]', params: { id: ad.id } })} style={{ flexDirection: 'row-reverse', gap: spacing.md, padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 112 }}>
      {ad.images?.[0] ? <Image source={{ uri: ad.images[0] }} style={{ width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.border }} /> : <View style={{ width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontSize: 12, fontWeight: '800' }}>بدون صورة</Text></View>}
      <View style={{ flex: 1, gap: spacing.xs, justifyContent: 'center' }}><Text numberOfLines={2} style={{ textAlign: 'right', color: colors.ink, fontWeight: '900', fontSize: 15 }}>{ad.title}</Text><Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '900', fontSize: 14 }}>{adPrice(ad.price)}</Text><Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>{ad.city || ad.user?.city || 'الموقع غير محدد'}</Text><Text style={{ textAlign: 'right', color: colors.muted, fontSize: 11 }}>{ad.condition === 'NEW' ? 'جديد' : ad.condition === 'USED' ? 'مستعمل' : ad.condition === 'REFURBISHED' ? 'مجدد' : 'حالة غير محددة'}</Text></View>
    </Pressable>)}
    {!loading && !error && items.length ? <View style={{ flexDirection: 'row-reverse', gap: spacing.sm }}><PrimaryButton label="السابق" variant="secondary" disabled={page <= 1} onPress={() => void load(page - 1, query, condition)} /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>الصفحة {page} من {totalPages}</Text></View><PrimaryButton label="التالي" variant="secondary" disabled={page >= totalPages} onPress={() => void load(page + 1, query, condition)} /></View> : null}
    <Notice tone="muted">تُعرض أحدث الإعلانات أولًا. حالة الإعلان تُرسل إلى الخادم فقط إذا كان فلتر الحالة محددًا.</Notice>
  </PageShell>;
}
