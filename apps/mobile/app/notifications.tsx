import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppIcon } from '@/components/Icons';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useRef, useState , useMemo} from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { denseListPerf } from '@/lib/listPerformance';
import { useFocusEffect } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
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
} from '@/components/ui';
import { fontSizes, radius, spacing, typography } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';
import { toAppHref } from '@/lib/typed-navigation';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { showToast } from '@/lib/toast';
import { COPY } from '@/lib/copy';

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { user, getAccessToken, csrfToken, isRestoring } = useAuth();
  const { counts, refresh: refreshUnreadCounts } = useUnreadCounts();
  const token = getAccessToken();
  const list = usePaginatedList<AppNotification>({
    key: `notifications:${user?.id ?? 'guest'}`,
    pageSize: 50,
    enabled: Boolean(user && token && !isRestoring),
    fetchPage: async (page, signal) => {
      const currentToken = getAccessToken();
      if (!currentToken) throw new Error('سجّل الدخول لعرض إشعاراتك.');
      const result = await fetchNotificationsPage(currentToken, page, 50, false, signal, user?.id);
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
    },
    getItemKey: (item) => item.id,
  });
  const [busy, setBusy] = useState(false);
  const hasFocusedRef = useRef(false);
  const refreshListRef = useRef(list.refresh);
  const refreshCountsRef = useRef(refreshUnreadCounts);
  refreshListRef.current = list.refresh;
  refreshCountsRef.current = refreshUnreadCounts;

  useFocusEffect(
    useCallback(() => {
      if (hasFocusedRef.current) void refreshListRef.current();
      hasFocusedRef.current = true;
      void refreshCountsRef.current();
    }, []),
  );

  const markAll = async () => {
    const token = getAccessToken();
    if (!token || busy) return;
    setBusy(true);
    try {
      await markAllNotificationsRead(token, csrfToken, user?.id);
      list.updateItems((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })));
      void refreshUnreadCounts();
    } catch (e) {
      showToast('تعذر تحديث الإشعارات', e instanceof Error ? e.message : COPY.tryAgain, 'error');
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
      list.updateItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true, readAt } : entry));
      void refreshUnreadCounts();
      // Navigation must not wait for a weak mobile connection.
      if (token) void markNotificationRead(item.id, token, csrfToken, user?.id).catch(() => {
        list.updateItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: false, readAt: null } : entry));
        void refreshUnreadCounts();
      });
    }
    pushOnce(toAppHref(target));
  };

  return (
    <ScreenFrame>
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
          onAction={() => pushOnce('/login')}
        />
      ) : list.loading ? (
        <LoadingState message="جاري تحميل الإشعارات…" />
      ) : list.error && list.items.length === 0 ? (
        <ErrorState title="تعذر تحميل الإشعارات" description={list.error || undefined} onAction={() => void list.retry()} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          {...denseListPerf}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={list.refreshing}
              onRefresh={() => void list.refresh()}
              tintColor={colors.brand}
            />
          }
          ListHeaderComponent={list.error ? <ErrorState title="تعذر تحديث الإشعارات" description={list.error} onAction={() => void list.retry()} /> : undefined}
          ListFooterComponent={list.items.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {list.hasNextPage ? <Pressable accessibilityRole="button" disabled={list.loadingMore} onPress={() => void list.loadMore()} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={styles.link}>{list.loadingMore ? 'جارٍ تحميل المزيد…' : 'تحميل إشعارات أقدم'}</Text></Pressable> : null}
              {list.loadMoreError ? <ErrorState title="تعذر تحميل الإشعارات الأقدم" description={list.loadMoreError} onAction={() => void list.retry()} /> : null}
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
                  <AppIcon
                    name={item.type === 'NEW_MESSAGE' ? 'messages' : item.type.includes('SERVICE') || item.type.includes('REQUEST') ? 'service' : 'notification'}
                    size={20}
                    color={colors.brand}
                  />
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
    </ScreenFrame>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  link: { color: colors.brand, ...typography.captionStrong },
  disabled: { opacity: 0.45 },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    minHeight: 78,
    flexDirection: 'row',
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
  icon: { fontSize: fontSizes[18] },
  bodyWrap: { flex: 1, gap: spacing.xs },
  itemTitle: { ...typography.bodyStrong, color: colors.ink, textAlign: 'right' },
  body: { ...typography.caption, color: colors.muted, textAlign: 'right', lineHeight: 20 },
  time: { fontSize: fontSizes[10], color: colors.muted, textAlign: 'right', marginTop: spacing.xxs },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    marginTop: spacing.xs,
  },
});
