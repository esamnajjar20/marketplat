import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyProducts, deleteProduct, type ProductSummary } from '@/features/commerce/commerce.api';
import { AppHeader, EmptyState, ErrorState, LoadingState, PrimaryButton } from '@/components/MobileUI';
import { AppImage } from '@/components/AppImage';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const statusLabel: Record<string, string> = { ACTIVE: 'نشط', DRAFT: 'مسودة', PENDING: 'قيد المراجعة', REJECTED: 'مرفوض', SUSPENDED: 'موقوف', IN_STOCK: 'متوفر', LIMITED: 'كمية محدودة', OUT_OF_STOCK: 'نفد المخزون' };
function money(value: ProductSummary['price']): string { const n = Number(value); return Number.isFinite(n) ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(n)} ₪` : 'السعر غير متاح'; }
export default function MyProductsScreen() {
  const { user, getAccessToken, csrfToken, isRestoring } = useAuth();
  const [items, setItems] = useState<ProductSummary[]>([]); const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null); const [error, setError] = useState(''); const seq = useRef(0); const hasLoadedRef = useRef(false);
  const load = useCallback(async (refresh = false) => {
    const current = ++seq.current; const token = getAccessToken(); if (isRestoring) return;
    if (!token) { setLoading(false); setError('سجّل الدخول لإدارة منتجاتك.'); return; }
    if (refresh) setRefreshing(true); else if (!hasLoadedRef.current) setLoading(true); setError('');
    try { const result = await fetchMyProducts(token, '', { page: 1, limit: 30 }); if (current === seq.current) { setItems(result.items); setPage(result.page); setTotalPages(result.totalPages); } }
    catch (e) { if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل منتجاتك.'); }
    finally { if (current === seq.current) { hasLoadedRef.current = true; setLoading(false); setRefreshing(false); } }
  }, [getAccessToken, isRestoring]);
  useEffect(() => { void load(); return () => { seq.current += 1; }; }, [load]);
  const loadMore = async () => { const token = getAccessToken(); if (!token || loadingMore || page >= totalPages) return; const current = seq.current; setLoadingMore(true); setError(''); try { const result = await fetchMyProducts(token, '', { page: page + 1, limit: 30 }); if (current === seq.current) { setItems(old => { const ids = new Set(old.map(x => x.id)); return [...old, ...result.items.filter(x => !ids.has(x.id))]; }); setPage(result.page); setTotalPages(result.totalPages); } } catch (e) { if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد.'); } finally { if (current === seq.current) setLoadingMore(false); } };
  const remove = (item: ProductSummary) => { if (busyId) return; Alert.alert('حذف المنتج', `هل تريد حذف «${item.name}»؟ لا يمكن التراجع عن هذا الإجراء.`, [{ text: 'إلغاء', style: 'cancel' }, { text: 'حذف', style: 'destructive', onPress: () => { void (async () => { const token = getAccessToken(); if (!token || busyId) return; setBusyId(item.id); try { await deleteProduct(item.id, token, csrfToken); setItems(old => old.filter(x => x.id !== item.id)); } catch (e) { Alert.alert('تعذر الحذف', e instanceof Error ? e.message : 'حاول مرة أخرى.'); } finally { setBusyId(null); } })(); } }]); };
  return <SafeAreaView style={s.safe} edges={['top']}><AppHeader title="منتجاتي" right={<Pressable accessibilityRole="button" onPress={() => router.push('/product-editor')}><Text style={s.link}>＋ إضافة</Text></Pressable>} />
    {isRestoring ? <LoadingState message="جارٍ استعادة الجلسة…" /> : !user ? <EmptyState title="سجّل الدخول لإدارة منتجاتك" actionLabel="تسجيل الدخول" onAction={() => router.push('/login')} /> : loading ? <LoadingState message="جاري تحميل منتجاتك…" /> : error && !items.length ? <ErrorState title="تعذر تحميل المنتجات" description={error} onAction={() => void load()} /> : <FlatList data={items} keyExtractor={x => x.id} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />} ListEmptyComponent={<EmptyState title="لم تضف منتجات بعد" description="أضف أول منتج إلى متجرك." actionLabel="إضافة منتج" onAction={() => router.push('/product-editor')} />} renderItem={({item}) => <View style={s.card}>
      <AppImage uri={item.images?.[0]} style={s.image} />
      <View style={s.body}><Text style={s.name}>{item.name}</Text><Text style={s.price}>{money(item.effectivePrice?.price ?? item.discountPrice ?? item.price)}</Text><Text style={s.muted}>{statusLabel[item.status || ''] || item.status || 'الحالة غير متاحة'} · {statusLabel[item.availability || ''] || item.availability || 'التوفر غير محدد'}</Text><Text style={s.muted}>المخزون: {typeof item.stockQuantity === 'number' ? item.stockQuantity : 'غير محدد'}</Text><View style={s.actions}><PrimaryButton label="تعديل" variant="secondary" onPress={() => router.push({pathname:'/product-editor',params:{id:item.id}})} /><PrimaryButton label={busyId===item.id?'جارٍ الحذف…':'حذف'} variant="danger" busy={busyId===item.id} disabled={Boolean(busyId)} onPress={() => remove(item)} /></View></View>
    </View>} ListFooterComponent={items.length ? <View style={{gap:spacing.sm}}>{error ? <ErrorState title="تعذر تحميل المزيد" description={error} onAction={() => void loadMore()} /> : null}{page<totalPages ? <PrimaryButton label={loadingMore?'جارٍ التحميل…':'تحميل المزيد'} variant="secondary" busy={loadingMore} onPress={() => void loadMore()} /> : null}</View> : null} />}
  </SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.canvas},content:{padding:spacing.lg,gap:spacing.md,paddingBottom:48},card:{flexDirection:'row-reverse',alignItems:'center',gap:spacing.md,padding:spacing.md,backgroundColor:colors.surface,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},image:{width:88,height:92,borderRadius:radius.md,backgroundColor:colors.border},body:{flex:1,alignItems:'flex-end',gap:spacing.xs},name:{...typography.bodyStrong,color:colors.ink,textAlign:'right'},price:{...typography.bodyStrong,color:colors.brand},muted:{...typography.caption,color:colors.muted,textAlign:'right'},actions:{flexDirection:'row-reverse',gap:spacing.sm},link:{color:colors.brand,...typography.captionStrong}});
