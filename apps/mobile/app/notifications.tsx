import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppIcon } from '@/components/Icons';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { useFocusEffect } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { useAuthActions, useAuthSession, useAuthStatus, useAuthUser } from '@/features/auth/AuthContext';
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
import { NOTIFICATION_CATEGORIES, NOTIFICATION_TYPE_META, resolveNotificationTarget } from '@marketplat/contracts';
import type { NotificationCategory, NotificationData, NotificationIconKey, NotificationType } from '@marketplat/contracts';
import { useNotificationLiveStream } from '@/features/notifications/useNotificationLiveStream';

function destination(item: AppNotification): string | null {
  const data = item.data && typeof item.data === 'object' && !Array.isArray(item.data)
    ? item.data as NotificationData
    : null;
  const target = resolveNotificationTarget(item.type, data);
  const id = target.id ? encodeURIComponent(target.id) : null;
  switch (target.kind) {
    case 'conversation': return id ? `/messages/${id}` : '/messages';
    case 'profile': return id ? `/profile/${id}` : '/profile';
    case 'following_feed': return '/following-feed';
    case 'ad': return id ? `/ads/${id}` : '/favorites';
    case 'product': return id ? `/products/${id}` : '/products';
    case 'service': return id ? `/services/${id}` : '/services';
    case 'store': return id ? `/stores/${id}` : '/stores';
    case 'saved_searches': return '/saved-searches';
    case 'store_members': return '/store-team';
    case 'request': return id ? `/requests/${id}` : '/requests';
    case 'service_request': return id ? `/service-requests/${id}` : '/notifications';
    case 'appointments': return '/appointments';
    case 'order': return id ? `/orders/${id}` : '/orders';
    case 'orders': return '/orders';
    case 'sale': return id ? `/sales/${id}` : '/my-sales';
    case 'installments': return '/installments';
    case 'debts': return '/debts';
    case 'sales': return '/my-sales';
    case 'store_promotions': return '/store-promotions';
    case 'dashboard': return '/my-ads';
    case 'store_analytics': return '/my-store-analytics';
    case 'service_analytics': return '/service-provider-analytics';
    case 'reports': return '/my-reports';
    case 'home': return '/';
    case 'favorites': return '/favorites';
    case 'notifications': {
      const legacyUrl = data?.url;
      return typeof legacyUrl === 'string' && legacyUrl.startsWith('/messages/') && !legacyUrl.startsWith('//')
        ? legacyUrl
        : '/notifications';
    }
    default: return '/notifications';
  }
}

const NOTIFICATION_GLYPH: Record<NotificationIconKey, Parameters<typeof AppIcon>[0]['name']> = {
  message: 'messages', user: 'user', following: 'following', tag: 'tag', megaphone: 'megaphone',
  chart: 'chart', search: 'search', store: 'store', package: 'package', clipboard: 'clipboard',
  service: 'service', calendar: 'calendar', shield: 'shield', wallet: 'wallet',
};

function notificationIsRead(item: AppNotification): boolean { return Boolean(item.readAt || item.isRead); }

/** صف إشعار — memo: لا يُعاد رسمه إلا عند تغيّر الإشعار نفسه (مثل حالة القراءة). */
const NotificationRow = memo(function NotificationRow({
  item,
  onOpen,
}: {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  const read = notificationIsRead(item);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(item)}
      style={[styles.card, !read && styles.unread]}
    >
      <View style={[styles.iconWrap, !read && styles.iconUnread]}>
        <AppIcon
          name={Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPE_META, item.type)
            ? NOTIFICATION_GLYPH[NOTIFICATION_TYPE_META[item.type as NotificationType].icon]
            : 'notification'}
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
      {!read ? <View style={styles.dot} /> : null}
    </Pressable>
  );
});

/** FlashList لا يدعم gap: الفاصل يعادل gap(md) + separator(sm) السابقين. */
function NotificationSeparator() {
  return <View style={{ height: spacing.md + spacing.sm }} />;
}

export default function NotificationsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { user } = useAuthUser();
  const { csrfToken } = useAuthSession();
  const { isRestoring } = useAuthStatus();
  const { getAccessToken } = useAuthActions();
  const { counts, refresh: refreshUnreadCounts } = useUnreadCounts();
  const token = getAccessToken();
  const [activeCategory, setActiveCategory] = useState<'all' | NotificationCategory>('all');
  const list = usePaginatedList<AppNotification>({
    key: `notifications:${user?.id ?? 'guest'}:${activeCategory}`,
    pageSize: 50,
    enabled: Boolean(user && token && !isRestoring),
    fetchPage: async (page, signal) => {
      const currentToken = getAccessToken();
      if (!currentToken) throw new Error('سجّل الدخول لعرض إشعاراتك.');
      const result = await fetchNotificationsPage(currentToken, page, 50, false, signal, user?.id, activeCategory);
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

  useNotificationLiveStream({
    userId: user?.id,
    getToken: getAccessToken,
    refreshList: () => refreshListRef.current(),
    refreshUnreadCounts: () => refreshCountsRef.current(),
  });

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

  // دوال ثابتة: الصف memo و`open` يقرأ آخر نسخة عبر ref.
  const openRef = useRef(open);
  openRef.current = open;
  const onOpen = useCallback((item: AppNotification) => { void openRef.current(item); }, []);
  const keyExtractor = useCallback((item: AppNotification) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => <NotificationRow item={item} onOpen={onOpen} />,
    [onOpen],
  );

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
        <View style={{ flex: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs }}>
          {NOTIFICATION_CATEGORIES.map(category => {
            const selected = activeCategory === category.id;
            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setActiveCategory(category.id)}
                style={{ minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? colors.brand : colors.border, backgroundColor: selected ? colors.brand : colors.surface, justifyContent: 'center' }}
              >
                <Text style={{ ...typography.captionStrong, color: selected ? colors.onBrand : colors.muted }}>{category.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <AppFlashList
          data={list.items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <BrandRefreshControl
              refreshing={list.refreshing}
              onRefresh={() => void list.refresh()}
            />
          }
          ListHeaderComponent={list.error ? <View style={styles.listHeader}><ErrorState title="تعذر تحديث الإشعارات" description={list.error} onAction={() => void list.retry()} /></View> : undefined}
          ListFooterComponent={list.items.length > 0 ? (
            <View style={styles.listFooter}>
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
          ItemSeparatorComponent={NotificationSeparator}
        />
        </View>
      )}
    </ScreenFrame>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  link: { color: colors.brand, ...typography.captionStrong },
  disabled: { opacity: 0.45 },
  // FlashList: padding فقط (لا gap).
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  listHeader: { marginBottom: spacing.md },
  listFooter: { gap: spacing.sm, marginTop: spacing.md },
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
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.surface },
  icon: { fontSize: fontSizes[18] },
  bodyWrap: { flex: 1, gap: spacing.xs },
  itemTitle: { ...typography.bodyStrong, color: colors.ink, textAlign: 'right' },
  body: { ...typography.caption, color: colors.muted, textAlign: 'right', lineHeight: 20 },
  time: { fontSize: fontSizes[12], color: colors.muted, textAlign: 'right', marginTop: spacing.xxs },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    marginTop: spacing.xs,
  },
});
