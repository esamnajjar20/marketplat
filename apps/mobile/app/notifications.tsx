import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { denseListPerf } from '@/lib/listPerformance';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import {
  fetchNotificationsPage,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/features/messaging/messaging.api';
import { useUnreadCounts } from '@/features/messaging/useUnreadCounts';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/MobileUI';
import { fontSizes, colors, radius, spacing, typography } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';

function destination(item: AppNotification): string | null {
  const data = item.data && typeof item.data === 'object' ? item.data as Record<string, unknown> : {};
  const id = (key: string): string | null => typeof data[key] === 'string' && (data[key] as string).trim() ? encodeURIComponent((data[key] as string).trim()) : null;
  const conversationId = id('conversationId');
  if (conversationId) return `/messages/${conversationId}`;
  // Some notification rows contain only entity IDs; the push URL is not
  // necessarily persisted in Notification.data, so route by the server type.
  const adId = id('adId');
  const productId = id('productId');
  const serviceId = id('serviceId');
  const storeId = id('storeId');
  const requestId = id('requestId');
  const followerId = id('followerId');
  const savedSearchId = id('savedSearchId');
  const promotionId = id('promotionId');
  switch (item.type) {
    case 'NEW_MESSAGE': return '/messages';
    case 'NEW_FOLLOWER': return followerId ? `/profile/${followerId}` : '/profile';
    case 'FOLLOWED_USER_ACTIVITY':
    case 'FOLLOWED_STORE_ACTIVITY':
    case 'FOLLOWED_CATEGORY_ACTIVITY': return '/following-feed';
    case 'FAV_AD_PRICE_CHANGED':
    case 'FAV_AD_SOLD':
    case 'AD_EXPIRING_SOON':
    case 'AD_EXPIRED': return adId ? `/ads/${adId}` : '/favorites';
    case 'SAVED_SEARCH_MATCH': return adId ? `/ads/${adId}` : productId ? `/products/${productId}` : serviceId ? `/services/${serviceId}` : savedSearchId ? '/saved-searches' : '/search';
    case 'STORE_NEW_PRODUCT': return storeId ? `/stores/${storeId}` : '/stores';
    case 'STORE_PROMOTION_STARTED': return productId ? `/products/${productId}` : storeId ? `/stores/${storeId}` : '/stores';
    case 'STORE_PRODUCT_RESTOCKED': return productId ? `/products/${productId}` : storeId ? `/stores/${storeId}` : '/stores';
    case 'STORE_MEMBER_INVITED': return '/store-team';
    case 'NEW_REQUEST_OFFER':
    case 'REQUEST_OFFER_ACCEPTED': return requestId ? `/requests/${requestId}` : '/requests';
    case 'SERVICE_REQUEST_NEW':
    case 'SERVICE_REQUEST_UPDATE': return '/service-requests';
    case 'APPOINTMENT_UPDATE': return '/appointments';
    case 'SALES_OVERDUE_INSTALLMENT':
    case 'SALES_UPCOMING_INSTALLMENT': return '/installments';
    case 'SALES_DEBT_REMINDER':
    case 'SALES_OVERDUE_DEBT': return '/debts';
    case 'SALES_LOW_STOCK':
    case 'SALES_DAILY_REMINDER':
    case 'SALES_WEEKLY_REPORT':
    case 'SALES_INACTIVE_CUSTOMER':
    case 'SALES_DAILY_SUMMARY':
    case 'SALES_SMART_INSIGHT': return '/my-sales';
    case 'PROMOTION':
    case 'PROMOTION_STATUS_CHANGE': return '/store-promotions';
    case 'MODERATION_REPORT_RECEIVED':
    case 'MODERATION_DECISION': return '/my-reports';
    case 'WEEKLY_AD_VIEWS_REPORT': return '/my-ads';
    case 'WEEKLY_STORE_VIEWS_REPORT': return '/my-store-analytics';
    case 'WEEKLY_SERVICE_VIEWS_REPORT': return '/service-provider-analytics';
    default: {
      // Accept only safe, app-local message links from older notification payloads.
      const url = typeof data.url === 'string' ? data.url : null;
      return url?.startsWith('/messages/') && !url.startsWith('//') ? url : null;
    }
  }
}

function notificationIsRead(item: AppNotification): boolean { return Boolean(item.readAt || item.isRead); }

export default function NotificationsScreen() {
  const { user, getAccessToken, csrfToken, isRestoring } = useAuth();
  const { counts, refresh: refreshUnreadCounts } = useUnreadCounts();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestSequence = useRef(0);
  const hasLoadedRef = useRef(false);

  const load = useCallback(
    async (refresh = false) => {
      const sequence = ++requestSequence.current;
      const token = getAccessToken();
      if (isRestoring) return;
      if (!token) {
        setLoading(false);
        setRefreshing(false);
        setError('سجّل الدخول لعرض إشعاراتك.');
        return;
      }
      if (refresh) setRefreshing(true);
      else if (!hasLoadedRef.current) setLoading(true);
      setError(null);
      setMoreError(null);
      setLoadingMore(false);
      try {
        const result = await fetchNotificationsPage(token, 1, 50);
        if (sequence === requestSequence.current) {
          setItems(result.items);
          setPage(result.page);
          setTotalPages(result.totalPages);
          hasLoadedRef.current = true;
        }
      } catch (e) {
        if (sequence === requestSequence.current) {
          setError(e instanceof Error ? e.message : 'تعذر تحميل الإشعارات.');
        }
      } finally {
        if (sequence === requestSequence.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [getAccessToken, isRestoring],
  );

  const loadMore = async () => {
    const token = getAccessToken();
    if (!token || loadingMore || loading || page >= totalPages) return;
    const sequence = requestSequence.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await fetchNotificationsPage(token, page + 1, 50);
      if (sequence === requestSequence.current) {
        setItems((current) => {
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...result.items.filter((item) => !seen.has(item.id))];
        });
        setPage(result.page);
        setTotalPages(result.totalPages);
      }
    } catch (e) {
      if (sequence === requestSequence.current) setMoreError(e instanceof Error ? e.message : 'تعذر تحميل الإشعارات الأقدم.');
    } finally {
      if (sequence === requestSequence.current) setLoadingMore(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        requestSequence.current += 1;
      };
    }, [load]),
  );

  const markAll = async () => {
    const token = getAccessToken();
    if (!token || busy) return;
    setBusy(true);
    try {
      await markAllNotificationsRead(token, csrfToken);
      setItems((current) =>
        current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })),
      );
      void refreshUnreadCounts();
    } catch (e) {
      Alert.alert('تعذر تحديث الإشعارات', e instanceof Error ? e.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const open = (item: AppNotification) => {
    const token = getAccessToken();
    const target = destination(item);
    if (!target) return;
    const unread = !notificationIsRead(item);
    if (unread) {
      const readAt = new Date().toISOString();
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true, readAt } : entry));
      void refreshUnreadCounts();
      // Navigation must not wait for a weak mobile connection.
      if (token) void markNotificationRead(item.id, token, csrfToken).catch(() => {
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: false, readAt: null } : entry));
        void refreshUnreadCounts();
      });
    }
    router.push(target as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title={counts.notifications > 0
          ? `الإشعارات (${counts.notifications > 99 ? '99+' : counts.notifications})`
          : 'الإشعارات'}
        right={
          user ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => { void markAll(); }}
              hitSlop={8}
            >
              <Text style={[styles.link, busy && styles.disabled]}>قراءة الكل</Text>
            </Pressable>
          ) : undefined
        }
      />

      {isRestoring ? (
        <LoadingState message="جارٍ استعادة الجلسة…" />
      ) : !user ? (
        <EmptyState
          title="سجّل الدخول أولًا"
          actionLabel="تسجيل الدخول"
          onAction={() => router.push('/login')}
        />
      ) : loading ? (
        <LoadingState message="جاري تحميل الإشعارات…" />
      ) : error && items.length === 0 ? (
        <ErrorState title="تعذر تحميل الإشعارات" description={error} onAction={() => void load()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          {...denseListPerf}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.brand}
            />
          }
          ListHeaderComponent={error ? <ErrorState title="تعذر تحديث الإشعارات" description={error} onAction={() => void load(true)} /> : undefined}
          ListFooterComponent={items.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {page < totalPages ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadMore()} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={styles.link}>{loadingMore ? 'جارٍ تحميل المزيد…' : 'تحميل إشعارات أقدم'}</Text></Pressable> : null}
              {moreError ? <ErrorState title="تعذر تحميل الإشعارات الأقدم" description={moreError} onAction={() => void loadMore()} /> : null}
            </View>
          ) : undefined}
          ListEmptyComponent={
            <EmptyState
              title="لا توجد إشعارات بعد"
              description="ستظهر هنا تحديثات حسابك ونشاطك في MarketPlat."
            />
          }
          renderItem={({ item }) => (
            <Pressable
                accessibilityRole="button"
                onPress={() => { void open(item); }}
                style={[styles.card, !notificationIsRead(item) && styles.unread]}
              >
                <View style={[styles.iconWrap, !notificationIsRead(item) && styles.iconUnread]}>
                  <Text style={styles.icon}>
                    {item.type === 'NEW_MESSAGE'
                      ? '💬'
                      : item.type.includes('SERVICE') || item.type.includes('REQUEST')
                        ? '🧰'
                        : '🔔'}
                  </Text>
                </View>
                <View style={styles.bodyWrap}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.body}>{item.body}</Text>
                  <Text style={styles.time}>
                    {formatSafeDate(item.createdAt, 'dateTime')}
                  </Text>
                </View>
                {!notificationIsRead(item) ? <View style={styles.dot} /> : null}
              </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  link: { color: colors.brand, ...typography.captionStrong },
  disabled: { opacity: 0.45 },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    minHeight: 78,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.brandSoft,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.surface },
  icon: { fontSize: fontSizes[19] },
  bodyWrap: { flex: 1, gap: 5 },
  itemTitle: { ...typography.bodyStrong, color: colors.ink, textAlign: 'right' },
  body: { ...typography.caption, color: colors.muted, textAlign: 'right', lineHeight: 20 },
  time: { fontSize: fontSizes[10], color: colors.muted, textAlign: 'right', marginTop: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    marginTop: 5,
  },
});
