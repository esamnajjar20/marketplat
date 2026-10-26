import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchConversationsPage, type ConversationItem } from '@/features/messaging/messaging.api';
import { useUnreadCounts } from '@/features/messaging/useUnreadCounts';
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
  const { counts } = useUnreadCounts();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const moreRequest = useRef(false);
  const moreRequestId = useRef(0);
  const requestId = useRef(0);
  const load = useCallback(async (refresh = false) => {
    const currentRequestId = ++requestId.current;
    if (!accessToken) {
      setItems([]);
      setHasMore(false);
      pageRef.current = 1;
      moreRequestId.current += 1;
      moreRequest.current = false;
      setLoadingMore(false);
      setLoading(false);
      setRefreshing(false);
      setError('سجّل الدخول لعرض محادثاتك.');
      return;
    }
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    setHasMore(false);
    setLoadMoreError(null);
    pageRef.current = 1;
    moreRequestId.current += 1;
    moreRequest.current = false;
    setLoadingMore(false);
    try {
      const result = await fetchConversationsPage(accessToken, 1);
      if (currentRequestId === requestId.current) { setItems(result.items); setHasMore(result.hasMore); pageRef.current = result.page; }
    } catch (e) {
      if (currentRequestId === requestId.current) setError(e instanceof Error ? e.message : 'تعذر تحميل المحادثات.');
    } finally {
      if (currentRequestId === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [accessToken]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestId.current += 1; moreRequestId.current += 1; moreRequest.current = false; };
  }, [load]));
  const loadMore = useCallback(async () => {
    if (!accessToken || !hasMore || loadingMore || moreRequest.current) return;
    const parentRequestId = requestId.current;
    const requestedPage = pageRef.current + 1;
    const currentMoreRequestId = ++moreRequestId.current;
    moreRequest.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await fetchConversationsPage(accessToken, requestedPage);
      if (parentRequestId !== requestId.current) return;
      setItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of result.items) if (!byId.has(item.id)) byId.set(item.id, item);
        return [...byId.values()];
      });
      pageRef.current = result.page;
      setHasMore(result.hasMore);
    } catch (e) {
      if (parentRequestId === requestId.current) setLoadMoreError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من المحادثات.');
    } finally {
      if (currentMoreRequestId === moreRequestId.current) {
        moreRequest.current = false;
        if (parentRequestId === requestId.current) setLoadingMore(false);
      }
    }
  }, [accessToken, hasMore, loadingMore]);
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>رجوع</Text></Pressable><View style={styles.headerTitle}><Text style={styles.heading}>المحادثات</Text>{counts.messages > 0 ? <View accessibilityLabel={`${counts.messages} رسالة غير مقروءة`} style={styles.headerBadge}><Text style={styles.headerBadgeText}>{counts.messages > 99 ? '99+' : counts.messages}</Text></View> : null}</View><Pressable onPress={() => router.push('/notifications')} accessibilityRole="button"><Text style={styles.link}>الإشعارات{counts.notifications > 0 ? ` (${counts.notifications > 99 ? '99+' : counts.notifications})` : ''}</Text></Pressable></View>
    {!user ? <View style={styles.center}><Text style={styles.title}>سجّل الدخول أولًا</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View>
      : loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري تحميل المحادثات…</Text></View>
      : error ? <View style={styles.center}><Text style={styles.title}>تعذر تحميل المحادثات</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void load()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View>
      : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand}/>}>{items.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>💬</Text><Text style={styles.title}>لا توجد محادثات بعد</Text><Text style={styles.muted}>يمكنك مراسلة صاحب الإعلان من صفحة تفاصيل الإعلان.</Text><Pressable style={styles.primary} onPress={() => router.replace('/')}><Text style={styles.primaryText}>استكشاف الإعلانات</Text></Pressable></View> : <>{items.map((item) => { const other = item.buyerId === user?.id ? item.seller : item.buyer; const context = item.ad?.title || item.serviceRequest?.listing?.title; return <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })} style={styles.card}><View style={styles.avatar}><Text style={styles.avatarText}>{(other.name || '؟').trim().slice(0, 1)}</Text></View><View style={styles.content}><View style={styles.titleRow}><Text numberOfLines={1} style={styles.person}>{other.name || 'مستخدم MarketPlat'}</Text>{(item.unreadCount ?? 0) > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount}</Text></View> : null}</View>{context ? <Text numberOfLines={1} style={styles.context}>بخصوص: {context}</Text> : null}<Text numberOfLines={2} style={styles.preview}>{preview(item)}</Text></View></Pressable>; })}{hasMore ? <Pressable style={styles.moreButton} disabled={loadingMore} onPress={() => void loadMore()}><Text style={styles.moreText}>{loadingMore ? 'جاري تحميل المزيد…' : 'تحميل المزيد من المحادثات'}</Text></Pressable>{loadMoreError ? <Text style={styles.moreError}>{loadMoreError}</Text> : null} : null}</>}</ScrollView>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.canvas},header:{minHeight:56,paddingHorizontal:spacing.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:18,fontWeight:'900',color:colors.ink},headerTitle:{flexDirection:'row',alignItems:'center',gap:6},headerBadge:{minWidth:20,height:20,paddingHorizontal:5,borderRadius:10,backgroundColor:colors.brand,alignItems:'center',justifyContent:'center'},headerBadgeText:{color:'#fff',fontSize:10,fontWeight:'900'},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},list:{padding:spacing.md,gap:spacing.sm},card:{flexDirection:'row-reverse',alignItems:'center',gap:spacing.md,padding:spacing.md,backgroundColor:colors.surface,borderRadius:radius.md,borderWidth:1,borderColor:colors.border},avatar:{width:48,height:48,borderRadius:24,backgroundColor:colors.brandSoft,alignItems:'center',justifyContent:'center'},avatarText:{fontSize:20,fontWeight:'900',color:colors.brand},content:{flex:1,gap:4},titleRow:{flexDirection:'row-reverse',alignItems:'center',gap:spacing.sm},person:{flex:1,fontSize:15,fontWeight:'900',color:colors.ink,textAlign:'right'},context:{fontSize:12,color:colors.brand,textAlign:'right'},preview:{fontSize:13,color:colors.muted,textAlign:'right',lineHeight:19},badge:{minWidth:22,height:22,paddingHorizontal:6,borderRadius:11,backgroundColor:colors.brand,alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:11,fontWeight:'900'},empty:{alignItems:'center',gap:spacing.md,padding:spacing.xl,marginTop:40},emptyIcon:{fontSize:38},title:{fontSize:17,fontWeight:'900',color:colors.ink,textAlign:'center'},muted:{fontSize:13,color:colors.muted,textAlign:'center',lineHeight:21},primary:{backgroundColor:colors.brand,borderRadius:radius.md,paddingHorizontal:spacing.lg,paddingVertical:spacing.md},primaryText:{color:'#fff',fontWeight:'800'},moreButton:{alignItems:'center',padding:spacing.lg,backgroundColor:colors.surface,borderRadius:radius.md,borderWidth:1,borderColor:colors.border},moreText:{color:colors.brand,fontWeight:'800'},moreError:{fontSize:12,color:colors.danger,textAlign:'center',padding:spacing.sm}});
