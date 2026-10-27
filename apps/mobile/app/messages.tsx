import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchConversationsPage, setConversationFlags, type ConversationItem } from '@/features/messaging/messaging.api';
import { useUnreadCounts } from '@/features/messaging/useUnreadCounts';
import { colors, radius, spacing } from '@/theme/tokens';

type Filter = 'all' | 'unread' | 'archived';
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
  const { user, accessToken, csrfToken } = useAuth();
  const { counts } = useUnreadCounts();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyFlagId, setBusyFlagId] = useState<string | null>(null);
  const pageRef = useRef(1);
  const moreRequest = useRef(false);
  const moreRequestId = useRef(0);
  const requestId = useRef(0);
  const load = useCallback(async (refresh = false) => {
    const currentRequestId = ++requestId.current;
    if (!accessToken) { setItems([]); setHasMore(false); pageRef.current = 1; moreRequestId.current += 1; moreRequest.current = false; setLoadingMore(false); setLoading(false); setRefreshing(false); setError('سجّل الدخول لعرض محادثاتك.'); return; }
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null); setHasMore(false); setLoadMoreError(null); pageRef.current = 1; moreRequestId.current += 1; moreRequest.current = false; setLoadingMore(false);
    try {
      const result = await fetchConversationsPage(accessToken, 1, filter === 'archived' ? { archivedOnly: true } : {});
      if (currentRequestId === requestId.current) { setItems(result.items); setHasMore(result.hasMore); pageRef.current = result.page; }
    } catch (e) { if (currentRequestId === requestId.current) setError(e instanceof Error ? e.message : 'تعذر تحميل المحادثات.'); }
    finally { if (currentRequestId === requestId.current) { setLoading(false); setRefreshing(false); } }
  }, [accessToken, filter]);
  useFocusEffect(useCallback(() => { void load(); return () => { requestId.current += 1; moreRequestId.current += 1; moreRequest.current = false; }; }, [load]));
  const loadMore = useCallback(async () => {
    if (!accessToken || !hasMore || loadingMore || moreRequest.current) return;
    const parentRequestId = requestId.current; const requestedPage = pageRef.current + 1; const currentMoreRequestId = ++moreRequestId.current; moreRequest.current = true; setLoadingMore(true); setLoadMoreError(null);
    try { const result = await fetchConversationsPage(accessToken, requestedPage, filter === 'archived' ? { archivedOnly: true } : {}); if (parentRequestId !== requestId.current) return; setItems(current => { const byId = new Map(current.map(item => [item.id, item])); for (const item of result.items) { const old = byId.get(item.id); byId.set(item.id, old ? { ...old, ...item } : item); } return [...byId.values()]; }); pageRef.current = result.page; setHasMore(result.hasMore); }
    catch (e) { if (parentRequestId === requestId.current) setLoadMoreError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من المحادثات.'); }
    finally { if (currentMoreRequestId === moreRequestId.current) { moreRequest.current = false; if (parentRequestId === requestId.current) setLoadingMore(false); } }
  }, [accessToken, hasMore, loadingMore, filter]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return items.filter(item => {
      const archived = Boolean(item.mySettings?.archivedAt);
      if (filter === 'unread' && !(item.unreadCount ?? 0)) return false;
      if (filter === 'archived' ? !archived : archived) return false;
      if (!query) return true;
      const other = item.buyerId === user?.id ? item.seller : item.buyer;
      return [other.name, item.ad?.title, item.serviceRequest?.listing?.title, item.lastMessage?.body].some(value => value?.toLocaleLowerCase().includes(query));
    }).sort((a,b) => Number(Boolean(b.mySettings?.pinnedAt)) - Number(Boolean(a.mySettings?.pinnedAt)) || new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime() - new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime());
  }, [items, filter, search, user?.id]);
  const changeFlag = useCallback(async (item: ConversationItem, flags: { pinned?: boolean; archived?: boolean; mutedUntil?: string | null }) => {
    if (!accessToken || busyFlagId) return;
    setBusyFlagId(item.id);
    try {
      await setConversationFlags(item.id, flags, accessToken, csrfToken);
      setItems(current => current.map(row => row.id !== item.id ? row : { ...row, mySettings: { ...(row.mySettings || {}), ...(flags.pinned !== undefined ? { pinnedAt: flags.pinned ? new Date().toISOString() : null } : {}), ...(flags.archived !== undefined ? { archivedAt: flags.archived ? new Date().toISOString() : null } : {}), ...(flags.mutedUntil !== undefined ? { mutedUntil: flags.mutedUntil } : {}) } }));
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث إعدادات المحادثة.'); }
    finally { setBusyFlagId(null); }
  }, [accessToken, csrfToken, busyFlagId]);
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>رجوع</Text></Pressable><View style={styles.headerTitle}><Text style={styles.heading}>المحادثات</Text>{counts.messages > 0 ? <View accessibilityLabel={`${counts.messages} رسالة غير مقروءة`} style={styles.headerBadge}><Text style={styles.headerBadgeText}>{counts.messages > 99 ? '99+' : counts.messages}</Text></View> : null}</View><Pressable onPress={() => router.push('/notifications')} accessibilityRole="button"><Text style={styles.link}>الإشعارات{counts.notifications > 0 ? ` (${counts.notifications > 99 ? '99+' : counts.notifications})` : ''}</Text></Pressable></View>
    {!user ? <View style={styles.center}><Text style={styles.title}>سجّل الدخول أولًا</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View>
      : loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري تحميل المحادثات…</Text></View>
      : error && !items.length ? <View style={styles.center}><Text style={styles.title}>تعذر تحميل المحادثات</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void load()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View>
      : <>
        <View style={styles.tools}><TextInput value={search} onChangeText={setSearch} placeholder="ابحث عن شخص أو رسالة…" placeholderTextColor={colors.muted} style={styles.search} textAlign="right" accessibilityLabel="البحث في المحادثات"/><View style={styles.filters}>{([['all','الكل'],['unread','غير مقروءة'],['archived','الأرشيف']] as const).map(([value,label]) => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter,filter===value&&styles.filterActive]}><Text style={[styles.filterText,filter===value&&styles.filterTextActive]}>{label}</Text></Pressable>)}</View>{error ? <Text style={styles.moreError}>{error}</Text> : null}</View>
        <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand}/>}>{visibleItems.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>💬</Text><Text style={styles.title}>{items.length ? 'لا توجد نتائج مطابقة' : 'لا توجد محادثات بعد'}</Text><Text style={styles.muted}>{items.length ? 'جرّب تغيير كلمة البحث أو الفلتر.' : 'يمكنك مراسلة صاحب الإعلان من صفحة تفاصيل الإعلان.'}</Text>{!items.length ? <Pressable style={styles.primary} onPress={() => router.replace('/')}><Text style={styles.primaryText}>استكشاف الإعلانات</Text></Pressable> : null}</View> : <>{visibleItems.map(item => { const other = item.buyerId === user?.id ? item.seller : item.buyer; const context = item.ad?.title || item.serviceRequest?.listing?.title; const pinned = Boolean(item.mySettings?.pinnedAt); const archived = Boolean(item.mySettings?.archivedAt); const muted = Boolean(item.mySettings?.mutedUntil && new Date(item.mySettings.mutedUntil).getTime() > Date.now()); return <View key={item.id} style={styles.card}><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })} style={styles.cardMain}><View style={styles.avatar}>{other.avatarUrl ? <Image source={{ uri: other.avatarUrl }} style={styles.avatarImage}/> : <Text style={styles.avatarText}>{(other.name || '؟').trim().slice(0,1)}</Text>}</View><View style={styles.content}><View style={styles.titleRow}><Text numberOfLines={1} style={styles.person}>{other.name || 'مستخدم MarketPlat'}</Text>{pinned ? <Text style={styles.flag}>📌</Text> : null}{muted ? <Text style={styles.flag}>🔕</Text> : null}{(item.unreadCount ?? 0)>0 ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount! > 99 ? '99+' : item.unreadCount}</Text></View> : null}</View>{context ? <Text numberOfLines={1} style={styles.context}>بخصوص: {context}</Text> : null}<Text numberOfLines={2} style={styles.preview}>{preview(item)}</Text></View></Pressable><View style={styles.actions}><Pressable disabled={busyFlagId===item.id} onPress={() => void changeFlag(item,{pinned:!pinned})} style={styles.action}><Text style={styles.actionText}>{pinned?'إلغاء التثبيت':'تثبيت'}</Text></Pressable><Pressable disabled={busyFlagId===item.id} onPress={() => void changeFlag(item,{archived:!archived})} style={styles.action}><Text style={styles.actionText}>{archived?'إلغاء الأرشفة':'أرشفة'}</Text></Pressable><Pressable disabled={busyFlagId===item.id} onPress={() => void changeFlag(item,{mutedUntil:muted?null:new Date(Date.now()+8*60*60*1000).toISOString()})} style={styles.action}><Text style={styles.actionText}>{muted?'تشغيل التنبيه':'كتم 8س'}</Text></Pressable></View></View>; })}{hasMore ? <><Pressable style={styles.moreButton} disabled={loadingMore} onPress={() => void loadMore()}><Text style={styles.moreText}>{loadingMore ? 'جاري تحميل المزيد…' : 'تحميل المزيد من المحادثات'}</Text></Pressable>{loadMoreError ? <Text style={styles.moreError}>{loadMoreError}</Text> : null}</> : null}</>}</ScrollView>
      </>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.canvas},header:{minHeight:56,paddingHorizontal:spacing.md,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:18,fontWeight:'900',color:colors.ink},headerTitle:{flexDirection:'row',alignItems:'center',gap:6},headerBadge:{minWidth:20,height:20,paddingHorizontal:5,borderRadius:10,backgroundColor:colors.brand,alignItems:'center',justifyContent:'center'},headerBadgeText:{color:'#fff',fontSize:10,fontWeight:'900'},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},tools:{paddingHorizontal:spacing.md,paddingTop:spacing.md,gap:spacing.sm},search:{minHeight:44,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.surface,paddingHorizontal:spacing.md,color:colors.ink},filters:{flexDirection:'row-reverse',gap:spacing.sm},filter:{flex:1,alignItems:'center',paddingVertical:10,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},filterActive:{backgroundColor:colors.brandSoft,borderColor:colors.brand},filterText:{fontSize:12,fontWeight:'800',color:colors.muted},filterTextActive:{color:colors.brand},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},list:{padding:spacing.md,gap:spacing.sm},card:{padding:spacing.sm,backgroundColor:colors.surface,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,gap:spacing.xs},cardMain:{flexDirection:'row-reverse',alignItems:'center',gap:spacing.md,padding:spacing.xs},avatar:{width:48,height:48,borderRadius:24,backgroundColor:colors.brandSoft,alignItems:'center',justifyContent:'center'},avatarText:{fontSize:20,fontWeight:'900',color:colors.brand},avatarImage:{width:48,height:48,borderRadius:24},content:{flex:1,gap:4},titleRow:{flexDirection:'row-reverse',alignItems:'center',gap:spacing.xs},person:{flex:1,fontSize:15,fontWeight:'900',color:colors.ink,textAlign:'right'},flag:{fontSize:12},context:{fontSize:12,color:colors.brand,textAlign:'right'},preview:{fontSize:13,color:colors.muted,textAlign:'right',lineHeight:19},badge:{minWidth:22,height:22,paddingHorizontal:6,borderRadius:11,backgroundColor:colors.brand,alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:11,fontWeight:'900'},actions:{flexDirection:'row-reverse',gap:spacing.xs,borderTopWidth:1,borderTopColor:colors.border,paddingTop:spacing.xs},action:{flex:1,alignItems:'center',paddingVertical:7,borderRadius:radius.sm,backgroundColor:colors.canvas},actionText:{fontSize:11,fontWeight:'800',color:colors.brand},empty:{alignItems:'center',gap:spacing.md,padding:spacing.xl,marginTop:40},emptyIcon:{fontSize:38},title:{fontSize:17,fontWeight:'900',color:colors.ink,textAlign:'center'},muted:{fontSize:13,color:colors.muted,textAlign:'center',lineHeight:21},primary:{backgroundColor:colors.brand,borderRadius:radius.md,paddingHorizontal:spacing.lg,paddingVertical:spacing.md},primaryText:{color:'#fff',fontWeight:'800'},moreButton:{alignItems:'center',padding:spacing.lg,backgroundColor:colors.surface,borderRadius:radius.md,borderWidth:1,borderColor:colors.border},moreText:{color:colors.brand,fontWeight:'800'},moreError:{fontSize:12,color:colors.danger,textAlign:'center',padding:spacing.sm}});
