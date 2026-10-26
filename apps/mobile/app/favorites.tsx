import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchFavoriteAds, setFavoriteAdState, type FavoriteRecord } from '@/features/ads/favorites.api';
import { enqueueFavoriteState, listPendingFavoriteStates, readFavoriteAdIds, writeFavoriteAdIds } from '@/features/ads/favorites.store';
import { colors, radius, spacing } from '@/theme/tokens';

function priceLabel(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'السعر عند التواصل';
  const n = Number(value);
  return Number.isFinite(n) ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(n)} ₪` : String(value);
}

export default function FavoritesScreen() {
  const { user, accessToken, csrfToken } = useAuth();
  const net = useNetInfo();
  const online = net.isConnected === true && net.isInternetReachable !== false;
  const [items, setItems] = useState<FavoriteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!accessToken) { setItems([]); setLoading(false); setError('سجّل الدخول لعرض المفضلة المتزامنة مع حسابك.'); return; }
    setLoading(true); setError(null);
    try {
      const [records, pending] = await Promise.all([fetchFavoriteAds(accessToken), user?.id ? listPendingFavoriteStates(user.id) : Promise.resolve([])]);
      const desiredState = new Map(pending.map((operation) => [operation.adId, operation.favorited]));
      setItems(records.filter((record) => desiredState.get(record.adId) !== false));
    }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المفضلة.'); }
    finally { setLoading(false); }
  }, [accessToken, user?.id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const remove = (record: FavoriteRecord) => {
    if (!record.adId || !user?.id) return;
    Alert.alert('إزالة من المفضلة', `إزالة «${record.ad?.title || 'هذا الإعلان'}» من المفضلة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: online ? 'إزالة' : 'حفظ للتزامن', style: 'destructive', onPress: () => {
        setBusyId(record.adId);
        const operationId = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const work = online && accessToken
          ? setFavoriteAdState(record.adId, false, accessToken, operationId, csrfToken)
          : enqueueFavoriteState({ userId: user.id, adId: record.adId, favorited: false, previousFavorited: true, operationId });
        void Promise.resolve(work).then(async () => {
          const ids = await readFavoriteAdIds(user.id);
          await writeFavoriteAdIds(ids.filter((id) => id !== record.adId), user.id);
          setItems((current) => current.filter((item) => item.adId !== record.adId));
        }).catch((e) => Alert.alert('تعذر إزالة الإعلان', e instanceof ApiError || e instanceof Error ? e.message : 'حاول مرة أخرى.')).finally(() => setBusyId(null));
      } },
    ]);
  };

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.link}>رجوع</Text></Pressable><Text style={styles.heading}>المفضلة</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.link}>تحديث</Text></Pressable></View>
    {!user ? <View style={styles.center}><Text style={styles.title}>سجّل الدخول لعرض مفضلتك</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View>
      : loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري تحميل المفضلة…</Text></View>
      : error ? <View style={styles.center}><Text style={styles.title}>تعذر تحميل المفضلة</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void load()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View>
      : <ScrollView contentContainerStyle={styles.list}>{items.length === 0 ? <View style={styles.center}><Text style={styles.title}>لا توجد إعلانات محفوظة</Text><Text style={styles.muted}>أضف الإعلانات التي تهمك إلى المفضلة من صفحة تفاصيل الإعلان.</Text><Pressable style={styles.primary} onPress={() => router.replace('/')}><Text style={styles.primaryText}>تصفح الإعلانات</Text></Pressable></View> : items.map((record) => { const ad = record.ad!; const image = ad.images?.find((url) => typeof url === 'string' && /^https?:/i.test(url)); return <View key={record.adId} style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/ads/[id]', params: { id: record.adId } })} style={styles.item}>
          {image ? <Image source={{ uri: image }} style={styles.image} resizeMode="cover"/> : <View style={[styles.image, styles.placeholder]}><Text>🛍️</Text></View>}
          <View style={styles.info}><Text style={styles.adTitle} numberOfLines={2}>{ad.title || 'إعلان'}</Text><Text style={styles.price}>{priceLabel(ad.price)}</Text><Text style={styles.muted}>{ad.city || 'المدينة غير محددة'}</Text></View>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busyId === record.adId} onPress={() => remove(record)} style={[styles.remove, busyId === record.adId && styles.disabled]}><Text style={styles.removeText}>{busyId === record.adId ? 'جارٍ الإزالة…' : online ? 'إزالة من المفضلة' : 'حفظ الإزالة دون اتصال'}</Text></Pressable>
      </View>; })}</ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.canvas}, header:{minHeight:56,paddingHorizontal:spacing.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border}, heading:{fontSize:18,fontWeight:'900',color:colors.ink}, link:{color:colors.brand,fontWeight:'800',padding:spacing.sm}, center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md}, title:{fontSize:17,fontWeight:'800',color:colors.ink,textAlign:'center'}, muted:{fontSize:12,color:colors.muted,textAlign:'right',lineHeight:19}, list:{padding:spacing.lg,gap:spacing.md}, card:{backgroundColor:colors.surface,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,padding:spacing.sm,gap:spacing.sm}, item:{flexDirection:'row-reverse',gap:spacing.md,alignItems:'center'}, image:{width:94,height:94,borderRadius:radius.sm,backgroundColor:colors.border}, placeholder:{alignItems:'center',justifyContent:'center'}, info:{flex:1,gap:spacing.xs}, adTitle:{fontSize:15,fontWeight:'800',color:colors.ink,textAlign:'right'}, price:{fontSize:15,fontWeight:'900',color:colors.brand,textAlign:'right'}, remove:{alignSelf:'flex-start',paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderRadius:radius.sm,backgroundColor:'#FCE8E8'},removeText:{color:'#B42318',fontWeight:'800',fontSize:12},disabled:{opacity:.5},primary:{backgroundColor:colors.brand,borderRadius:radius.md,padding:spacing.md},primaryText:{color:'#fff',fontWeight:'800'} });
