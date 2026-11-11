import { useAppTheme } from '@/theme/ThemeProvider';
import { AppIcon } from '@/components/Icons';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Spinner, Notice, ErrorState, PageShell, SectionCard } from '@/components/ui';
import { router } from 'expo-router';
import { fetchProductCategories, type ProductCategory } from '@/features/commerce/commerce.api';
import { fontWeights, spacing } from '@/theme/tokens';
export default function ProductCategoriesScreen() {
  const { colors } = useAppTheme();
  const [items, setItems] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchProductCategories());
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل تصنيفات المنتجات.');
    }
    finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return <PageShell title="تصنيفات المنتجات">
  <Text style={{
    textAlign: 'right', color: colors.muted, lineHeight: 21
  }}>اختر تصنيفًا لعرض المنتجات المرتبطة به.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel="عرض جميع المنتجات" onPress={() => router.push('/products')}><SectionCard><Text style={{
    textAlign: 'right', fontWeight: fontWeights.bold, color: colors.brand, minHeight: 44, textAlignVertical: 'center'
  }}>جميع المنتجات ←</Text></SectionCard></Pressable>
  {loading ? <Spinner color={colors.brand}/> : error ? <ErrorState title="تعذر تحميل التصنيفات" description={error} onAction={() => void load()} /> : items.length === 0 ? <Notice tone="muted">لا توجد تصنيفات نشطة حاليًا.</Notice> : <View style={{ gap: spacing.lg }}>{items.map(category => <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`عرض منتجات تصنيف ${category.nameAr || category.name}`} onPress={() => router.push({
    pathname: '/products', params: { categoryId: category.id }
  })}><SectionCard><View style={{
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md
  }}><View style={{
    flex: 1, gap: spacing.xs
  }}><Text tone="ink" strong size={17}>{category.nameAr || category.name}</Text><Text tone="muted" size={12}>{category.nameAr && category.name !== category.nameAr ? category.name : 'تصفح منتجات هذا التصنيف'}</Text></View><AppIcon name="forward" size={20} color={colors.brand}/></View></SectionCard></Pressable>)}</View>}
 </PageShell>;
}
