import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchConversationsPage, setConversationFlags, type ConversationItem } from '@/features/messaging/messaging.api';
import { useUnreadCounts } from '@/features/messaging/useUnreadCounts';
import {
  AppHeader,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SearchBar,
  SkeletonList,
} from '@/components/MobileUI';
import { colors, spacing, typography } from '@/theme/tokens';
import ConversationListItem from '@/features/messaging/ConversationListItem';

type Filter = 'all' | 'unread' | 'archived';
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
  const accessTokenRef = useRef(accessToken);
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
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);
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
    const tokenSnapshot = accessToken;
    setBusyFlagId(item.id);
    try {
      await setConversationFlags(item.id, flags, tokenSnapshot, csrfToken);
      // Abort state update if the session changed while the request was in-flight.
      // Uses a ref because accessToken from the closure is identical to tokenSnapshot.
      if (accessTokenRef.current !== tokenSnapshot) return;
      setItems(current => current.map(row => row.id !== item.id ? row : { ...row, mySettings: { ...(row.mySettings || {}), ...(flags.pinned !== undefined ? { pinnedAt: flags.pinned ? new Date().toISOString() : null } : {}), ...(flags.archived !== undefined ? { archivedAt: flags.archived ? new Date().toISOString() : null } : {}), ...(flags.mutedUntil !== undefined ? { mutedUntil: flags.mutedUntil } : {}) } }));
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث إعدادات المحادثة.'); }
    finally { setBusyFlagId(null); }
  }, [accessToken, csrfToken, busyFlagId]);

  const openConversation = useCallback((conversationId: string) => {
    router.push({ pathname: '/messages/[id]', params: { id: conversationId } });
  }, []);
  const renderConversation = useCallback(({ item }: { item: ConversationItem }) => (
    <ConversationListItem item={item} currentUserId={user?.id} onPress={openConversation} />
  ), [openConversation, user?.id]);
  const keyExtractor = useCallback((item: ConversationItem) => item.id, []);
  const onRefresh = useCallback(() => { void load(true); }, [load]);
  const listHeader = useMemo(() => (
    <View style={styles.headerContent}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        onSubmit={() => {}}
        placeholder="ابحث عن شخص أو رسالة…"
        accessibilityLabel="البحث في المحادثات"
      />
      <View style={styles.filters}>
        {([
          ['all', 'الكل'],
          ['unread', 'غير مقروءة'],
          ['archived', 'الأرشيف'],
        ] as const).map(([value, label]) => (
          <Chip
            key={value}
            label={label}
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </View>
      {error ? <Text style={styles.moreError}>{error}</Text> : null}
    </View>
  ), [error, filter, search]);
  const listFooter = useMemo(() => (
    <View style={styles.footer}>
      {hasMore ? (
        <PrimaryButton
          label={loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'}
          variant="secondary"
          busy={loadingMore}
          onPress={() => { void loadMore(); }}
        />
      ) : null}
      {loadingMore ? <Text style={styles.footerStatus} accessibilityLiveRegion="polite">جارٍ تحميل المحادثات…</Text> : null}
      {loadMoreError ? <Text style={styles.moreError}>{loadMoreError}</Text> : null}
    </View>
  ), [hasMore, loadMore, loadMoreError, loadingMore]);
  const listEmpty = useMemo(() => (
    <EmptyState title="لا توجد محادثات" description="ابدأ مراسلة بائع من صفحة الإعلان أو المنتج." />
  ), []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title={counts.messages > 0
          ? `المحادثات (${counts.messages > 99 ? '99+' : counts.messages})`
          : 'المحادثات'}
        right={
          <Pressable accessibilityRole="button" onPress={() => router.push('/notifications')} hitSlop={8}>
            <Text style={styles.link}>
              الإشعارات
              {counts.notifications > 0
                ? ` (${counts.notifications > 99 ? '99+' : counts.notifications})`
                : ''}
            </Text>
          </Pressable>
        }
      />

      {!user ? (
        <EmptyState
          title="سجّل الدخول أولًا"
          actionLabel="تسجيل الدخول"
          onAction={() => router.push('/login')}
        />
      ) : loading ? (
        <SkeletonList count={5} />
      ) : error && !items.length ? (
        <ErrorState title="تعذر تحميل المحادثات" description={error} onAction={() => void load()} />
      ) : (
        <FlatList
          data={visibleItems}
          renderItem={renderConversation}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={ConversationSeparator}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
          onEndReached={() => { if (hasMore && !loadingMore) void loadMore(); }}
          onEndReachedThreshold={0.35}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          accessibilityLabel="قائمة المحادثات"
        />
      )}
    </SafeAreaView>
  );
}

function ConversationSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  link: { color: colors.brand, ...typography.captionStrong },
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: 48 },
  headerContent: { gap: spacing.md, paddingBottom: spacing.md },
  filters: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  separator: { height: spacing.sm },
  footer: { gap: spacing.sm, paddingTop: spacing.md },
  footerStatus: { ...typography.caption, color: colors.muted, textAlign: 'center' },
  moreError: { ...typography.caption, color: colors.danger, textAlign: 'right' },
});
