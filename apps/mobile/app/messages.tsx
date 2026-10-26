import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchConversations, type ConversationItem } from '@/features/messaging/messaging.api';
import { colors, radius, spacing } from '@/theme/tokens';

function preview(conversation: ConversationItem): string {
  const message = conversation.lastMessage;
  if (!message) return conversation.ad?.title ? `بخصوص: ${conversation.ad.title}` : 'ابدأ المحادثة بإرسال رسالة.';
  if (message.deletedAt) return 'تم حذف هذه الرسالة';
  if (message.body?.trim()) return message.body.trim();
  if (message.imageUrl) return '📷 صورة';
  if (message.audioUrl) return '🎙️ رسالة صوتية';
  if (message.fileUrl) return '📎 ملف مرفق';
  return 'رسالة جديدة';
}
export default function MessagesScreen() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (refresh = false) => {
    if (!accessToken) { setLoading(false); setError('سجّل الدخول لعرض محادثاتك.'); return; }
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try { setItems(await fetchConversations(accessToken)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المحادثات.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [accessToken]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>رجوع</Text></Pressable><Text style={styles.heading}>المحادثات</Text><Pressable onPress={() => router.push('/notifications')} accessibilityRole="button"><Text style={styles.link}>الإشعارات</Text></Pressable></View>
    {!user ? <View style={styles.center}><Text style={styles.title}>سجّل الدخول أولًا</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View>
      : loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري تحميل المحادثات…</Text></View>
      : error ? <View style={styles.center}><Text style={styles.title}>تعذر تحميل المحادثات</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void load()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View>
      : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand}/>}>{items.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>💬</Text><Text style={styles.title}>لا توجد محادثات بعد</Text><Text style={styles.muted}>يمكنك مراسلة صاحب الإعلان من صفحة تفاصيل الإعلان.</Text><Pressable style={styles.primary} onPress={() => router.replace('/')}><Text style={styles.primaryText}>استكشاف الإعلانات</Text></Pressable></View> : items.map((item) => { const other = item.buyerId === user?.id ? item.seller : item.buyer; const context = item.ad?.title || item.serviceRequest?.listing?.title; return <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })} style={styles.card}><View style={styles.avatar}><Text style={styles.avatarText}>{(other.name || '؟').trim().slice(0, 1)}</Text></View><View style={styles.content}><View style={styles.titleRow}><Text numberOfLines={1} style={styles.person}>{other.name || 'مستخدم MarketPlat'}</Text>{(item.unreadCount ?? 0) > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount}</Text></View> : null}</View>{context ? <Text numberOfLines={1} style={styles.context}>بخصوص: {context}</Text> : null}<Text numberOfLines={2} style={styles.preview}>{preview(item)}</Text></View></Pressable>; })}</ScrollView>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.canvas},header:{minHeight:56,paddingHorizontal:spacing.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:18,fontWeight:'900',color:colors.ink},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},list:{padding:spacing.md,gap:spacing.sm},card:{flexDirection:'row-reverse',alignItems:'center',gap:spacing.md,padding:spacing.md,backgroundColor:colors.surface,borderRadius:radius.md,borderWidth:1,borderColor:colors.border},avatar:{width:48,height:48,borderRadius:24,backgroundColor:colors.brandSoft,alignItems:'center',justifyContent:'center'},avatarText:{fontSize:20,fontWeight:'900',color:colors.brand},content:{flex:1,gap:4},titleRow:{flexDirection:'row-reverse',alignItems:'center',gap:spacing.sm},person:{flex:1,fontSize:15,fontWeight:'900',color:colors.ink,textAlign:'right'},context:{fontSize:12,color:colors.brand,textAlign:'right'},preview:{fontSize:13,color:colors.muted,textAlign:'right',lineHeight:19},badge:{minWidth:22,height:22,paddingHorizontal:6,borderRadius:11,backgroundColor:colors.brand,alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:11,fontWeight:'900'},empty:{alignItems:'center',gap:spacing.md,padding:spacing.xl,marginTop:40},emptyIcon:{fontSize:38},title:{fontSize:17,fontWeight:'900',color:colors.ink,textAlign:'center'},muted:{fontSize:13,color:colors.muted,textAlign:'center',lineHeight:21},primary:{backgroundColor:colors.brand,borderRadius:radius.md,paddingHorizontal:spacing.lg,paddingVertical:spacing.md},primaryText:{color:'#fff',fontWeight:'800'}});
