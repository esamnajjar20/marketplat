import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fetchProductCategories, type ProductCategory } from '@/features/commerce/commerce.api';
import { Notice, PageShell, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';

export default function ProductCategoriesScreen() {
  const [items, setItems] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setItems(await fetchProductCategories()); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل تصنيفات المنتجات.'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <PageShell title="تصنيفات المنتجات">
    <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }}>اختر تصنيفًا لعرض المنتجات المرتبطة به.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="عرض جميع المنتجات" onPress={() => router.push('/products')}><SectionCard><Text style={{ textAlign: 'right', fontWeight: '900', color: colors.brand, minHeight: 44, textAlignVertical: 'center' }}>جميع المنتجات ←</Text></SectionCard></Pressable>
    {loading ? <ActivityIndicator color={colors.brand} /> : error ? <><Notice>{error}</Notice><Pressable onPress={() => void load()}><Text style={{ textAlign: 'center', color: colors.brand, fontWeight: '800' }}>إعادة المحاولة</Text></Pressable></> : items.length === 0 ? <Notice tone="muted">لا توجد تصنيفات نشطة حاليًا.</Notice> : <View style={{ gap: 14 }}>{items.map(category => <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`عرض منتجات تصنيف ${category.nameAr || category.name}`} onPress={() => router.push({ pathname: '/products', params: { categoryId: category.id } })}><SectionCard><View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><View style={{ flex: 1, gap: 4 }}><Text style={{ textAlign: 'right', color: colors.ink, fontSize: 17, fontWeight: '900' }}>{category.nameAr || category.name}</Text><Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>{category.nameAr && category.name !== category.nameAr ? category.name : 'تصفح منتجات هذا التصنيف'}</Text></View><Text style={{ color: colors.brand, fontSize: 24 }}>‹</Text></View></SectionCard></Pressable>)}</View>}
  </PageShell>;
}
