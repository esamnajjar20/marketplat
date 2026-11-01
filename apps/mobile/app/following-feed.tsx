import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchFollowingFeed, type FollowingFeedItem } from '@/features/account/social.api';
import { AppHeader, EmptyState, ErrorState, LoadingState, PrimaryButton } from '@/components/MobileUI';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resolvePageState } from '@/lib/pagination';
import { fontSizes, colors, radius, spacing, typography } from '@/theme/tokens';

function price(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return 'السعر عند التواصل';
  const amount = Number(value);
  return Number.isFinite(amount) ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(amount)} ₪` : 'السعر غير متاح';
}
function target(item: FollowingFeedItem): string {
  return item.type === 'AD' ? `/ads/${encodeURIComponent(item.id)}` : item.type === 'PRODUCT' ? `/products/${encodeURIComponent(item.id)}` : `/services/${encodeURIComponent(item.id)}`;
}
export default function FollowingFeedScreen() {
  const { user, getAccessToken, isRestoring } = useAuth();
  const [items, setItems] = useState<FollowingFeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const hasLoadedRef = useRef(false);
  const load = useCallback(async (refresh = false) => {
    const current = ++seq.current;
    const token = getAccessToken();
    if (isRestoring) return;
    if (!token) { setLoading(false); setError('سجّل الدخول لعرض نشاط من تتابعهم.'); return; }
    if (refresh) setRefreshing(true); else if (!hasLoadedRef.current) setLoading(true);
    setError('');
    try {
      const result = await fetchFollowingFeed(token, 1, 20);
      if (current === seq.current) { const pagination = resolvePageState(result.meta, 1, result.items.length, 20); setItems(result.items); setPage(pagination.page); setTotalPages(pagination.totalPages); hasLoadedRef.current = true; }
    } catch (e) { if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل الموجز.'); }
    finally { if (current === seq.current) { setLoading(false); setRefreshing(false); } }
  }, [getAccessToken, isRestoring]);
  useEffect(() => { void load(); return () => { seq.current += 1; }; }, [load]);
  const loadMore = async () => {
    const token = getAccessToken(); if (!token || loadingMore || page >= totalPages) return;
    const current = seq.current; setLoadingMore(true); setError('');
    try { const result = await fetchFollowingFeed(token, page + 1, 20); if (current === seq.current) { setItems(old => { const ids = new Set(old.map(x => `${x.type}:${x.id}`)); return [...old, ...result.items.filter(x => !ids.has(`${x.type}:${x.id}`))]; }); const pagination = resolvePageState(result.meta, page + 1, result.items.length, 20); setPage(pagination.page); setTotalPages(pagination.totalPages); } }
    catch (e) { if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد.'); }
    finally { if (current === seq.current) setLoadingMore(false); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
    <AppHeader title="نشاط من تتابعهم" />
    {!user && !isRestoring ? <EmptyState title="سجّل الدخول أولًا" actionLabel="تسجيل الدخول" onAction={() => router.push('/login')} /> : loading ? <LoadingState message="جارٍ تحميل الموجز…" /> : error && !items.length ? <ErrorState title="تعذر تحميل الموجز" description={error} onAction={() => void load(true)} /> : <FlatList data={items} keyExtractor={item => `${item.type}:${item.id}`} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />} ListEmptyComponent={<EmptyState title="لا يوجد نشاط بعد" description="ستظهر هنا الإعلانات والمنتجات والخدمات الجديدة من الحسابات والمتاجر التي تتابعها." />} ListHeaderComponent={error ? <ErrorState title="تعذر التحديث" description={error} onAction={() => void load(true)} /> : undefined} renderItem={({item}) => <Pressable accessibilityRole="button" onPress={() => router.push(target(item) as never)} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {item.images?.[0] ? <Image source={{uri:item.images[0]}} style={{width:76,height:76,borderRadius:radius.md,backgroundColor:colors.border}} /> : <View style={{width:76,height:76,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.brandSoft}}><Text style={{color:colors.brandOnSoft,fontWeight:'900'}}>{item.type==='AD'?'إعلان':item.type==='PRODUCT'?'منتج':'خدمة'}</Text></View>}
      <View style={{flex:1,gap:5,alignItems:'flex-end'}}><Text numberOfLines={2} style={{color:colors.ink,fontWeight:'900',textAlign:'right'}}>{item.title}</Text><Text style={{color:colors.brand,fontWeight:'800'}}>{price(item.price)}</Text><Text style={{color:colors.muted,fontSize:fontSizes[12]}}>{item.type==='AD'?'إعلان':item.type==='PRODUCT'?'منتج':'خدمة'}{item.city ? ` · ${item.city}` : ''}</Text></View><Text style={{color:colors.brand,fontSize:fontSizes[22]}}>‹</Text>
    </Pressable>} ListFooterComponent={page<totalPages ? <PrimaryButton label={loadingMore?'جارٍ التحميل…':'تحميل المزيد'} variant="secondary" busy={loadingMore} onPress={() => void loadMore()} /> : undefined} />}
  </SafeAreaView>;
}
