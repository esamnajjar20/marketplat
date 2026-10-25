import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { colors, radius, spacing } from '@/theme/tokens';
import { discardOutboxMutation, listAllOutboxMutations, retryExhaustedMutation, type OutboxItem } from '@/storage/mutation-outbox';
import { syncOutboxIfReady } from '@/storage/outbox-sync';
import { useNetInfo } from '@react-native-community/netinfo';

function operationLabel(operation: OutboxItem['operation']): string {
  if (operation === 'create-ad') return 'إنشاء إعلان';
  if (operation === 'update-ad') return 'تعديل إعلان';
  return 'حذف إعلان';
}
function stateLabel(item: OutboxItem): string {
  if (item.state === 'processing') return 'قيد المعالجة';
  if (item.state === 'pending') return 'بانتظار المزامنة';
  if (item.attempts >= 8) return 'توقفت المحاولات؛ يلزم تدخل';
  return 'فشلت مؤقتًا — ستُعاد المحاولة';
}
function titleFromPayload(item: OutboxItem): string | null {
  try {
    const payload = JSON.parse(item.payloadJson) as { title?: unknown };
    return typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : null;
  } catch { return null; }
}

export default function OfflineQueueScreen() {
  const { accessToken, csrfToken, user } = useAuth();
  const netInfo = useNetInfo();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const online = netInfo.isConnected === true && netInfo.isInternetReachable !== false;

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listAllOutboxMutations()); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر قراءة العمليات المحفوظة.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const discard = (item: OutboxItem) => Alert.alert('إلغاء العملية المحفوظة', 'سيتم حذف هذه العملية من هذا الجهاز ولن تُرسل إلى الخادم. هل تريد المتابعة؟', [
    { text: 'رجوع', style: 'cancel' },
    { text: 'إلغاء العملية', style: 'destructive', onPress: () => {
      setBusyId(item.id);
      void discardOutboxMutation(item.id).then((removed) => {
        if (!removed) Alert.alert('لم تُلغَ العملية', 'قد تكون العملية قيد المعالجة الآن. حدّث القائمة وحاول لاحقًا.');
        return refresh();
      }).catch((e) => setError(e instanceof Error ? e.message : 'تعذر إلغاء العملية.')).finally(() => setBusyId(null));
    } },
  ]);

  const retry = async (item: OutboxItem) => {
    if (!online || !accessToken) { Alert.alert('المزامنة غير جاهزة', !online ? 'اتصل بالإنترنت أولًا.' : 'سجّل الدخول أولًا.'); return; }
    setBusyId(item.id); setError(null);
    try {
      const reset = await retryExhaustedMutation(item.id);
      if (!reset) { setError('لم تعد العملية مستنفدة أو أنها تغيّرت؛ حدّث القائمة.'); return; }
      const result = await syncOutboxIfReady({ isOnline: online, token: accessToken, csrfToken });
      if (result.status === 'sync-result' && result.result.status === 'synced') {
        Alert.alert('تمت المزامنة', 'تم إرسال العملية وتأكيد حفظها.');
      } else if (result.status === 'sync-result' && result.result.status === 'server-succeeded-local-ack-pending') {
        Alert.alert('تم الإرسال', 'قبل الخادم العملية، لكن تأكيد حذفها من الطابور المحلي لم يكتمل بعد. لا تحذف بيانات التطبيق.');
      } else if (result.status === 'sync-result' && result.result.status === 'blocked-by-unsupported') {
        Alert.alert('الطابور متوقف', 'توجد عملية أقدم غير مدعومة؛ لم نتجاوزها للحفاظ على ترتيب التعديلات.');
      }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذرت إعادة المحاولة.'); }
    finally { setBusyId(null); }
  };

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>رجوع</Text></Pressable><Text style={styles.heading}>العمليات دون اتصال</Text><Pressable onPress={() => void refresh()} accessibilityRole="button"><Text style={styles.link}>تحديث</Text></Pressable></View>
    <View style={styles.notice}><Text style={styles.noticeText}>تُحفظ هذه العمليات على الجهاز. قد توقف عملية أقدم غير مدعومة المزامنة للحفاظ على ترتيب التعديلات. لا تلغِ عملية إلا إذا كنت متأكدًا أنك لا تريد إرسالها.</Text></View>
    {!user ? <View style={styles.center}><Text style={styles.title}>سجّل الدخول لمزامنة العمليات</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View>
      : loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري قراءة العمليات…</Text></View>
      : error && items.length === 0 ? <View style={styles.center}><Text style={styles.title}>تعذر تحميل القائمة</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void refresh()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View>
      : <ScrollView contentContainerStyle={styles.list}>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Text style={styles.summary}>{items.length} عملية محفوظة من أصل حد أقصى 50</Text>
        {items.length === 0 ? <View style={styles.empty}><Text style={styles.title}>لا توجد عمليات معلّقة</Text><Text style={styles.muted}>ستظهر هنا العمليات التي تحتاج إلى المزامنة أو التدخل.</Text></View> : items.map((item) => {
          const exhausted = item.state === 'failed' && item.attempts >= 8;
          const canDiscard = item.state !== 'processing';
          const isHead = items[0]?.id === item.id;
          const canRetry = exhausted && isHead && (item.operation === 'create-ad' || item.operation === 'delete-ad');
          return <View key={item.id} style={styles.card}>
            <Text style={styles.adTitle}>{titleFromPayload(item) || operationLabel(item.operation)}</Text>
            <Text style={styles.status}>{stateLabel(item)}</Text>
            <Text style={styles.muted}>النوع: {operationLabel(item.operation)} · المحاولات: {item.attempts}/8</Text>
            <Text style={styles.muted}>وقت الحفظ: {new Date(item.createdAt).toLocaleString('ar')}</Text>
            {item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}
            {item.nextAttemptAt > Date.now() && item.state === 'failed' && item.attempts < 8 ? <Text style={styles.muted}>المحاولة التالية بعد: {new Date(item.nextAttemptAt).toLocaleString('ar')}</Text> : null}
            {item.operation === 'update-ad' && (() => { try { const payload = JSON.parse(item.payloadJson); return Array.isArray(payload?.images) && payload.images.length > 0; } catch { return true; } })() ? <Text style={styles.warning}>يتضمن هذا التعديل صورًا محفوظة محليًا وسيُعاد رفعها عند المزامنة، إذا فشل رفع الصور فستُعاد محاولة هذا العنصر قبل العمليات الأحدث؛ لا تحذف المسودة حتى تتأكد من نجاح المزامنة.</Text> : null}
            {exhausted && !isHead ? <Text style={styles.warning}>لا يمكن إعادة هذه العملية الآن لأن هناك عملية أقدم تسبقها في الطابور.</Text> : null}
            {exhausted && isHead && item.operation === 'update-ad' ? <Text style={styles.warning}>تعذرت المزامنة بعد عدة محاولات. تحقق من بيانات التعديل والاتصال ثم أعد المحاولة.</Text> : null}
            <View style={styles.actions}>
              {canRetry ? <Pressable disabled={busyId === item.id} style={styles.secondary} onPress={() => void retry(item)}><Text style={styles.secondaryText}>{busyId === item.id ? 'جارٍ…' : 'إعادة المحاولة'}</Text></Pressable> : null}
              <Pressable disabled={!canDiscard || busyId === item.id} style={[styles.delete, (!canDiscard || busyId === item.id) && styles.disabled]} onPress={() => discard(item)}><Text style={styles.deleteText}>{busyId === item.id ? 'جارٍ…' : canDiscard ? 'إلغاء العملية' : 'قيد المعالجة'}</Text></Pressable>
            </View>
          </View>;
        })}
      </ScrollView>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({safe:{flex:1,backgroundColor:colors.canvas},header:{minHeight:56,paddingHorizontal:spacing.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:17,fontWeight:'900',color:colors.ink},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},notice:{padding:spacing.md,backgroundColor:'#FFF4E5',borderBottomWidth:1,borderBottomColor:'#F3D6A6'},noticeText:{color:'#7A4B00',fontSize:12,lineHeight:19,textAlign:'right'},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},list:{padding:spacing.lg,gap:spacing.md,paddingBottom:36},summary:{fontSize:13,fontWeight:'800',color:colors.ink,textAlign:'right'},empty:{padding:spacing.xl,alignItems:'center',gap:spacing.sm,backgroundColor:colors.surface,borderRadius:radius.md},card:{padding:spacing.md,backgroundColor:colors.surface,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,gap:spacing.sm},adTitle:{fontSize:15,fontWeight:'900',color:colors.ink,textAlign:'right'},status:{fontSize:13,fontWeight:'800',color:colors.brand,textAlign:'right'},muted:{fontSize:12,color:colors.muted,textAlign:'right',lineHeight:19},errorText:{fontSize:12,color:'#B42318',textAlign:'right',lineHeight:19},warning:{fontSize:12,color:'#7A4B00',backgroundColor:'#FFF4E5',padding:spacing.sm,borderRadius:radius.sm,textAlign:'right',lineHeight:19},error:{fontSize:13,color:'#B42318',backgroundColor:'#FCE8E8',padding:spacing.md,borderRadius:radius.sm,textAlign:'right'},primary:{backgroundColor:colors.brand,borderRadius:radius.md,padding:spacing.md},primaryText:{color:'#fff',fontWeight:'800'},actions:{flexDirection:'row-reverse',gap:spacing.sm,marginTop:spacing.xs},secondary:{borderWidth:1,borderColor:colors.brand,borderRadius:radius.sm,paddingHorizontal:spacing.lg,paddingVertical:spacing.sm},secondaryText:{color:colors.brand,fontWeight:'800'},delete:{backgroundColor:'#FCE8E8',borderRadius:radius.sm,paddingHorizontal:spacing.lg,paddingVertical:spacing.sm},deleteText:{color:'#B42318',fontWeight:'800'},disabled:{opacity:.45},title:{fontSize:16,fontWeight:'800',color:colors.ink}});
