import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useState, useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { useAuth } from '@/features/auth/AuthContext';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { fetchMyProducts, deleteProduct, type ProductSummary } from '@/features/commerce/commerce.api';
import { AppHeader, EmptyState, ErrorState, LoadingState, PrimaryButton } from '@/components/ui';
import { AppImage } from '@/components/AppImage';
import { radius, spacing, typography } from '@/theme/tokens';
import { COPY } from '@/lib/copy';
import { domainLabel } from '@/lib/status-labels';
import { onlineOnlyBlockReason } from '@/lib/offline-support';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';
function money(value: ProductSummary['price']): string {
  const n = Number(value);
  return Number.isFinite(n) ? formatMoney(n) : 'السعر غير متاح';
}
export default function MyProductsScreen() {
  const { view } = useLocalSearchParams<{
    view?: string;
  }>();
  const inventoryMode = view === 'inventory';
  const { colors } = useAppTheme();
  const s = useMemo(() => createThemeS(colors), [colors]);
  const { user, getAccessToken, csrfToken, isRestoring } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { items, loading, refreshing, loadingMore, error, loadMoreError, hasNextPage, refresh, loadMore, updateItems, } = usePaginatedList<ProductSummary>({
    key: user?.id ?? 'guest',
    enabled: !isRestoring && Boolean(user),
    pageSize: 30,
    fetchPage: async (page, signal) => {
      const token = getAccessToken();
      if (!token)
        throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
      const result = await fetchMyProducts(token, '', {
        page, limit: 30, signal
      });
      return {
        items: result.items, meta: {
          page: result.page, totalPages: result.totalPages
        }
      };
    },
    getItemKey: (item) => item.id,
  });
  const remove = async (item: ProductSummary) => {
    if (busyId)
      return;
    const blocked = await onlineOnlyBlockReason('delete-product');
    if (blocked) {
      showToast(blocked.title, blocked.message, 'info');
      return;
    }
    confirmAlert('حذف المنتج', `هل تريد حذف «${item.name}»؟ لا يمكن التراجع عن هذا الإجراء.`, [{
        text: 'إلغاء', style: 'cancel'
      }, {
        text: 'حذف', style: 'destructive', onPress: () => {
          void (async () => {
            // Connectivity may have dropped while the confirmation dialog was open: re-check right
            // before the request, not only before the dialog.
            const blockedNow = await onlineOnlyBlockReason('delete-product');
            if (blockedNow) {
              showToast(blockedNow.title, blockedNow.message, 'info');
              return;
            }
            const token = getAccessToken();
            if (!token || busyId)
              return;
            setBusyId(item.id);
            try {
              await deleteProduct(item.id, token, csrfToken);
              updateItems((old) => old.filter((x) => x.id !== item.id));
            }
            catch (e) {
              showToast('تعذر الحذف', e instanceof Error ? e.message : COPY.tryAgain, 'error');
            }
            finally {
              setBusyId(null);
            }
          })();
        }
      }]);
  };
  const visibleItems = inventoryMode
    ? items.filter((item) => typeof item.stockQuantity === 'number' || ['IN_STOCK', 'LIMITED', 'OUT_OF_STOCK'].includes(String(item.availability || '')))
    : items;
  return <ScreenFrame><AppHeader title={inventoryMode ? 'مخزون المتجر' : 'منتجاتي'} right={<Pressable accessibilityRole="button" onPress={() => router.push('/product-editor')}><Text style={s.link}>＋ إضافة</Text></Pressable>}/>
  {inventoryMode ? <View style={{
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm
  }}><Text style={s.muted}>عرض المنتجات التي لديها بيانات مخزون أو حالة توفر مسجلة. لتعديل الكمية أو حالة المنتج افتح تعديل المنتج.</Text></View> : null}
  {isRestoring ? <LoadingState message="جارٍ استعادة الجلسة…"/> : !user ? <EmptyState title="سجّل الدخول لإدارة منتجاتك" actionLabel="تسجيل الدخول" onAction={() => router.push('/login')}/> : loading ? <LoadingState message="جاري تحميل منتجاتك…"/> : error && !items.length ? <ErrorState title="تعذر تحميل المنتجات" description={error} onAction={() => void refresh()}/> : <AppFlashList ItemSeparatorComponent={ListGapMd} data={visibleItems} keyExtractor={x => x.id} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.brand}/>} ListEmptyComponent={<EmptyState title={inventoryMode ? 'لا توجد بيانات مخزون بعد' : 'لم تضف منتجات بعد'} description={inventoryMode ? 'ستظهر هنا المنتجات التي لديها كمية أو حالة توفر مسجلة.' : 'أضف أول منتج إلى متجرك.'} actionLabel={inventoryMode ? 'عرض المنتجات' : 'إضافة منتج'} onAction={() => router.replace(inventoryMode ? '/my-products' : '/product-editor')}/>} renderItem={({ item }) => <View style={s.card}>
   <AppImage variant="list" uri={item.images?.[0]} style={s.image}/>
   <View style={s.body}><Text style={s.name}>{item.name}</Text><Text style={s.price}>{money(item.effectivePrice?.price ?? item.discountPrice ?? item.price)}</Text><Text style={s.muted}>{domainLabel('product', item.status, item.status || 'الحالة غير متاحة')} · {domainLabel('product', item.availability, item.availability || 'التوفر غير محدد')}</Text><Text style={s.muted}>المخزون: {typeof item.stockQuantity === 'number' ? item.stockQuantity : 'غير محدد'}</Text><View style={s.actions}><PrimaryButton label="تعديل" variant="secondary" onPress={() => router.push({
        pathname: '/product-editor', params: { id: item.id }
      })}/><PrimaryButton label={busyId === item.id ? 'جارٍ الحذف…' : 'حذف'} variant="danger" busy={busyId === item.id} disabled={Boolean(busyId)} onPress={() => void remove(item)}/></View></View>
  </View>} ListFooterComponent={items.length ? <View style={{ gap: spacing.sm }}>{error ? <ErrorState title="تعذر تحديث المنتجات" description={error} onAction={() => void refresh()}/> : null}{loadMoreError ? <ErrorState title="تعذر تحميل المزيد" description={loadMoreError} onAction={() => void loadMore()}/> : null}{hasNextPage ? <PrimaryButton label={loadingMore ? 'جارٍ التحميل…' : loadMoreError ? 'إعادة المحاولة' : 'تحميل المزيد'} variant="secondary" busy={loadingMore} onPress={() => void loadMore()}/> : null}</View> : undefined}/>}
 </ScreenFrame>;
}
const createThemeS = (colors: ColorPalette) => StyleSheet.create({
  content: {
    padding: spacing.lg, paddingBottom: spacing.x4l
  }, card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border
  }, image: {
    width: 88, height: 92, borderRadius: radius.md, backgroundColor: colors.border
  }, body: {
    flex: 1, alignItems: 'flex-start', gap: spacing.xs
  }, name: {
    ...typography.bodyStrong, color: colors.ink, textAlign: 'right'
  }, price: {
    ...typography.bodyStrong, color: colors.brand
  }, muted: {
    ...typography.caption, color: colors.muted, textAlign: 'right'
  }, actions: {
    flexDirection: 'row', gap: spacing.sm
  }, link: {
    color: colors.brand, ...typography.captionStrong
  }
});
