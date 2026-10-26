import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError } from '@/api/client';
import { deleteAd, fetchMyAds, type ManagedAd } from '@/features/ads/manage-ads.api';
import { enqueueMutation } from '@/storage/mutation-outbox';
import { useAuth } from '@/features/auth/AuthContext';
import { colors, radius, spacing } from '@/theme/tokens';

export default function MyAdsScreen() {
  const { user, accessToken, csrfToken } = useAuth();
  const netInfo = useNetInfo();
  const online = netInfo.isConnected === true && netInfo.isInternetReachable !== false;
  const [ads, setAds] = useState<ManagedAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) { setLoading(false); setError('سجّل الدخول لعرض إعلاناتك.'); return; }
    setLoading(true); setError(null);
    try { setAds(await fetchMyAds(accessToken)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل إعلاناتك.'); }
    finally { setLoading(false); }
  }, [accessToken]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const remove = (ad: ManagedAd) => {
    Alert.alert('حذف الإعلان', online ? `هل تريد حذف «${ad.title}»؟` : `لا يوجد اتصال. هل تريد حفظ طلب حذف «${ad.title}» للمزامنة عند عودة الإنترنت؟`, [
    { text: 'إلغاء', style: 'cancel' },
    { text: online ? 'حذف' : 'حفظ طلب الحذف', style: 'destructive', onPress: () => {
      if (!accessToken) return;
      setBusyId(ad.id);
      const work = online
        ? deleteAd(ad.id, accessToken, csrfToken).then(() => setAds((current) => current.filter((item) => item.id !== ad.id)))
        : enqueueMutation({
            ownerId: String(user.id),
            id: `offline-delete:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`,
            operation: 'delete-ad', resourceId: ad.id, payload: { title: ad.title },
            idempotencyKey: `offline-op:delete:${ad.id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
          }).then(() => { Alert.alert('تم حفظ طلب الحذف', 'لم يُحذف الإعلان من الخادم بعد. سيُرسل طلب الحذف عند عودة الاتصال وتوفر جلسة دخول صالحة.'); });
      void work.catch((e) => Alert.alert('تعذر حفظ طلب الحذف', e instanceof ApiError || e instanceof Error ? e.message : 'حاول مرة أخرى.'))
        .finally(() => setBusyId(null));
    } },
  ]);
  };

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>رجوع</Text></Pressable><Text style={styles.heading}>إعلاناتي</Text><Pressable onPress={() => router.push('/offline-queue')} accessibilityRole="button"><Text style={styles.link}>دون اتصال</Text></Pressable><Pressable onPress={() => router.push('/ad-editor')} accessibilityRole="button"><Text style={styles.link}>＋ إضافة</Text></Pressable></View>
    {!user ? <View style={styles.center}><Text style={styles.title}>سجّل الدخول أولًا</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View>
      : loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري تحميل إعلاناتك…</Text></View>
      : error ? <View style={styles.center}><Text style={styles.title}>تعذر تحميل الإعلانات</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void load()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View>
      : <ScrollView contentContainerStyle={styles.list}>{ads.length === 0 ? <Text style={styles.muted}>لم تنشر أي إعلان بعد.</Text> : ads.map((ad) => <View key={ad.id} style={styles.card}>
        <Text style={styles.adTitle}>{ad.title}</Text><Text style={styles.muted}>{ad.city} · {ad.status || 'الحالة غير متاحة'}</Text>
        <View style={styles.actions}><Pressable style={styles.secondary} onPress={() => router.push({ pathname: '/ad-editor', params: { id: ad.id } })}><Text style={styles.secondaryText}>تعديل</Text></Pressable><Pressable disabled={busyId === ad.id} style={[styles.delete, busyId === ad.id && styles.disabled]} onPress={() => remove(ad)}><Text style={styles.deleteText}>{busyId === ad.id ? 'جارٍ الحذف…' : online ? 'حذف' : 'حفظ طلب الحذف'}</Text></Pressable></View>
      </View>)}</ScrollView>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.canvas},header:{minHeight:56,paddingHorizontal:spacing.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:18,fontWeight:'900',color:colors.ink},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},title:{fontSize:17,fontWeight:'800',color:colors.ink},muted:{fontSize:13,color:colors.muted,textAlign:'right',lineHeight:21},primary:{backgroundColor:colors.brand,borderRadius:radius.md,padding:spacing.md},primaryText:{color:'#fff',fontWeight:'800'},list:{padding:spacing.lg,gap:spacing.md},card:{padding:spacing.md,backgroundColor:colors.surface,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,gap:spacing.sm},adTitle:{fontSize:16,fontWeight:'800',color:colors.ink,textAlign:'right'},actions:{flexDirection:'row-reverse',gap:spacing.sm,marginTop:spacing.xs},secondary:{borderWidth:1,borderColor:colors.brand,borderRadius:radius.sm,paddingHorizontal:spacing.lg,paddingVertical:spacing.sm},secondaryText:{color:colors.brand,fontWeight:'800'},delete:{backgroundColor:'#FCE8E8',borderRadius:radius.sm,paddingHorizontal:spacing.lg,paddingVertical:spacing.sm},deleteText:{color:'#B42318',fontWeight:'800'},disabled:{opacity:.45}});
