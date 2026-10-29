import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { colors, radius, spacing, typography } from '@/theme/tokens';

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
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />
          }
        >
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

          {visibleItems.length === 0 ? (
            <EmptyState title="لا توجد محادثات" description="ابدأ مراسلة بائع من صفحة الإعلان أو المنتج." />
          ) : (
            <View style={styles.list}>
              {visibleItems.map((item) => {
                const other = item.buyerId === user?.id ? item.seller : item.buyer;
                const unread = item.unreadCount ?? 0;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })}
                    style={[styles.card, unread > 0 && styles.unread]}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{(other?.name || '?').slice(0, 1)}</Text>
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.cardTop}>
                        <Text style={styles.name} numberOfLines={1}>
                          {other?.name || 'مستخدم'}
                          {item.mySettings?.pinnedAt ? ' 📌' : ''}
                        </Text>
                        {unread > 0 ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.preview} numberOfLines={2}>
                        {preview(item)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {hasMore ? (
            <PrimaryButton
              label={loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'}
              variant="secondary"
              busy={loadingMore}
              onPress={() => {
                void loadMore();
              }}
            />
          ) : null}
          {loadMoreError ? <Text style={styles.moreError}>{loadMoreError}</Text> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  link: { color: colors.brand, ...typography.captionStrong },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  filters: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  list: { gap: spacing.sm },
  card: {
    flexDirection: 'row-reverse',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: { borderColor: colors.borderStrong, backgroundColor: colors.brandSoft },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.brand, fontWeight: '900', fontSize: 16 },
  cardBody: { flex: 1, gap: 4 },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { ...typography.bodyStrong, color: colors.ink, flex: 1, textAlign: 'right' },
  preview: { ...typography.caption, color: colors.muted, textAlign: 'right', lineHeight: 18 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  moreError: { ...typography.caption, color: colors.danger, textAlign: 'right' },
});
