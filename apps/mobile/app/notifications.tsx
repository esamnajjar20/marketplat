import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import {
  fetchNotifications,
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
import { colors, radius, spacing, typography } from '@/theme/tokens';

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
    case 'FOLLOWED_CATEGORY_ACTIVITY': return '/?feed=following';
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
    case 'PROMOTION_STATUS_CHANGE': return promotionId ? '/store-promotions' : '/notifications';
    case 'MODERATION_REPORT_RECEIVED':
    case 'MODERATION_DECISION':
    case 'WEEKLY_AD_VIEWS_REPORT':
    case 'WEEKLY_STORE_VIEWS_REPORT':
    case 'WEEKLY_SERVICE_VIEWS_REPORT': return '/notifications';
    default: {
      // Accept only safe, app-local message links from older notification payloads.
      const url = typeof data.url === 'string' ? data.url : null;
      return url?.startsWith('/messages/') && !url.startsWith('//') ? url : null;
    }
  }
}

export default function NotificationsScreen() {
  const { user, accessToken, csrfToken } = useAuth();
  const { counts, refresh: refreshUnreadCounts } = useUnreadCounts();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const sequence = ++requestSequence.current;
      if (!accessToken) {
        setLoading(false);
        setError('سجّل الدخول لعرض إشعاراتك.');
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetchNotifications(accessToken);
        if (sequence === requestSequence.current) setItems(result);
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
    [accessToken],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        requestSequence.current += 1;
      };
    }, [load]),
  );

  const markAll = async () => {
    if (!accessToken || busy) return;
    setBusy(true);
    try {
      await markAllNotificationsRead(accessToken, csrfToken);
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

  const open = async (item: AppNotification) => {
    if (!accessToken) return;
    if (!item.readAt) {
      try {
        await markNotificationRead(item.id, accessToken, csrfToken);
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
          ),
        );
        void refreshUnreadCounts();
      } catch {
        /* Navigation remains available if marking read fails. */
      }
    }
    const target = destination(item);
    if (target) router.push(target as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="الإشعارات"
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

      {!user ? (
        <EmptyState
          title="سجّل الدخول أولًا"
          actionLabel="تسجيل الدخول"
          onAction={() => router.push('/login')}
        />
      ) : loading ? (
        <LoadingState message="جاري تحميل الإشعارات…" />
      ) : error ? (
        <ErrorState title="تعذر تحميل الإشعارات" description={error} onAction={() => void load()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.brand}
            />
          }
        >
          {items.length === 0 ? (
            <EmptyState
              title="لا توجد إشعارات بعد"
              description="ستظهر هنا تحديثات حسابك ونشاطك في MarketPlat."
            />
          ) : (
            items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => { void open(item); }}
                style={[styles.card, !item.readAt && styles.unread]}
              >
                <View style={[styles.iconWrap, !item.readAt && styles.iconUnread]}>
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
                    {new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(
                      new Date(item.createdAt),
                    )}
                  </Text>
                </View>
                {!item.readAt ? <View style={styles.dot} /> : null}
              </Pressable>
            ))
          )}
        </ScrollView>
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
  icon: { fontSize: 19 },
  bodyWrap: { flex: 1, gap: 5 },
  itemTitle: { ...typography.bodyStrong, color: colors.ink, textAlign: 'right' },
  body: { ...typography.caption, color: colors.muted, textAlign: 'right', lineHeight: 20 },
  time: { fontSize: 10, color: colors.muted, textAlign: 'right', marginTop: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    marginTop: 5,
  },
});
