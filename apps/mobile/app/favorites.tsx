import { secureRandomToken } from '@/lib/operation-id';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { pickRemoteImageUri } from '@/lib/list-image';
import { router, useFocusEffect } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchFavoriteAds, setFavoriteAdState, type FavoriteRecord } from '@/features/ads/favorites.api';
import { enqueueFavoriteState, listPendingFavoriteStates, readFavoriteAdIds, writeFavoriteAdIds } from '@/features/ads/favorites.store';
import { AppHeader, EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { AdCard } from '@/components/MarketCards';
import { spacing, typography } from '@/theme/tokens';
import { COPY } from '@/lib/copy';

function priceLabel(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'السعر عند التواصل';
  const n = Number(value);
  return Number.isFinite(n)
    ? formatMoney(n)
    : String(value);
}

export default function FavoritesScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { user, getAccessToken, csrfToken } = useAuth();
  const net = useNetInfo();
  const online = net.isConnected === true && net.isInternetReachable !== false;
  const [items, setItems] = useState<FavoriteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const hasItemsRef = useRef(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setItems([]);
      hasItemsRef.current = false;
      setLoading(false);
      setError('سجّل الدخول لعرض المفضلة المتزامنة مع حسابك.');
      return;
    }
    if (!hasItemsRef.current) setLoading(true);
    setError(null);
    try {
      // Pending is a local SQLite best-effort hint. Its failure must not
      // mask a successful server fetch (or vice versa).
      const [recordsResult, pendingResult] = await Promise.allSettled([
        fetchFavoriteAds(token),
        user?.id ? listPendingFavoriteStates(user.id) : Promise.resolve([]),
      ]);
      const pending = pendingResult.status === 'fulfilled' ? pendingResult.value : [];
      if (recordsResult.status === 'rejected') {
        throw recordsResult.reason;
      }
      const desiredState = new Map(pending.map((operation) => [operation.adId, operation.favorited]));
      const nextItems = recordsResult.value.filter((record) => desiredState.get(record.adId) !== false);
      hasItemsRef.current = nextItems.length > 0;
      setItems(nextItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المفضلة.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, user?.id]);
  const { refreshing: pullRefreshing, onRefresh: onPullRefresh } = usePullRefresh(() => load());

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = (record: FavoriteRecord) => {
    if (!record.adId || !user?.id) return;
    setBusyId(record.adId);
    const operationId = `fav-${Date.now()}-${secureRandomToken(8)}`;
    let queued = !online || !getAccessToken();
    const enqueueOffline = () => enqueueFavoriteState({
      userId: user.id,
      adId: record.adId,
      favorited: false,
      previousFavorited: true,
      operationId,
    });
    const token = getAccessToken();
    const work = online && token
      ? setFavoriteAdState(record.adId, false, token, operationId, csrfToken).catch((err) => {
          // A session that expires mid-action must preserve the user's intent locally.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            queued = true;
            return enqueueOffline();
          }
          throw err;
        })
      : enqueueOffline();
    void Promise.resolve(work)
      .then(async () => {
        const ids = await readFavoriteAdIds(user.id);
        await writeFavoriteAdIds(ids.filter((id) => id !== record.adId), user.id);
        setItems((current) => current.filter((item) => item.adId !== record.adId));
        showToast(queued ? 'حُفظت الإزالة للمزامنة' : 'تمت الإزالة من المفضلة', queued ? 'سيُزامن التغيير عند توفر الاتصال والجلسة.' : 'أزيل الإعلان من قائمتك.', queued ? 'info' : 'success');
      })
      .catch((e) => showToast('تعذر إزالة الإعلان', e instanceof ApiError || e instanceof Error ? e.message : COPY.tryAgain, 'error'))
      .finally(() => setBusyId(null));
  };

  // معالجات ثابتة الهوية: البطاقة memo تعتمد على id، والدالة تقرأ آخر نسخة عبر ref.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const removeRef = useRef(remove);
  removeRef.current = remove;
  const openAd = useCallback((adId: string) => pushOnce(`/ads/${encodeURIComponent(adId)}`), []);
  const toggleFavorite = useCallback((adId: string) => {
    const record = itemsRef.current.find((item) => item.adId === adId);
    if (record) removeRef.current(record);
  }, []);
  const keyExtractor = useCallback((record: FavoriteRecord) => record.adId, []);
  const renderItem = useCallback(({ item: record }: { item: FavoriteRecord }) => {
    const ad = record.ad;
    return (
      <AdCard
        id={record.adId}
        title={ad?.title || 'إعلان محفوظ'}
        price={priceLabel(ad?.price)}
        meta={[ad?.city, ad?.category?.nameAr || ad?.category?.name].filter(Boolean).join(' · ') || 'إعلان محلي'}
        imageUri={pickRemoteImageUri(ad?.images)}
        isFavorite
        isNegotiable={Boolean(ad?.isNegotiable)}
        favoriteBusy={busyId === record.adId}
        onPressItem={openAd}
        onToggleFavoriteItem={toggleFavorite}
      />
    );
  }, [busyId, openAd, toggleFavorite]);

  return (
    <ScreenFrame>
      <AppHeader
        title="المفضلة"
        right={
          user ? (
            <Pressable accessibilityRole="button" onPress={() => void load()} hitSlop={8}>
              <Text style={styles.link}>تحديث</Text>
            </Pressable>
          ) : undefined
        }
      />

      {!user ? (
        <View style={styles.center}>
          <EmptyState
            title="سجّل الدخول لعرض مفضلتك"
            description="المفضلة تُزامَن مع حسابك عبر الأجهزة."
            actionLabel="تسجيل الدخول"
            onAction={() => pushOnce('/login')}
          />
        </View>
      ) : loading && items.length === 0 ? (
        <SkeletonList count={4} />
      ) : error && items.length === 0 ? (
        <ErrorState title="تعذر تحميل المفضلة" description={error} onAction={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد عناصر في المفضلة"
          description="احفظ الإعلانات التي تهمك من صفحة التفاصيل أو الرئيسية."
          actionLabel="تصفح الإعلانات"
          onAction={() => router.replace('/')}
        />
      ) : (
        <AppFlashList
          refreshControl={<BrandRefreshControl refreshing={pullRefreshing} onRefresh={() => void onPullRefresh()} />}
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          extraData={busyId}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.listHeader}>{error ? <Text tone="danger">{error}</Text> : null}<Text style={styles.count}>{items.length} إعلان محفوظ</Text></View>
          }
          ListEmptyComponent={
            <EmptyState
              title="لا توجد عناصر في المفضلة"
              description="أضف إعلانات إلى المفضلة من صفحات التفاصيل."
              actionLabel="تصفح الإعلانات"
              onAction={() => pushOnce('/')}
            />
          }
          ItemSeparatorComponent={ListGapMd}
        />
      )}
    </ScreenFrame>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  link: { color: colors.brand, ...typography.captionStrong },
  center: { flex: 1, justifyContent: 'center' },
  // FlashList: padding فقط (لا gap). الفواصل عبر ListGapMd والرأس عبر listHeader.
  content: { padding: spacing.lg, paddingBottom: spacing.x4l },
  listHeader: { gap: spacing.sm, marginBottom: spacing.md },
  count: { ...typography.caption, color: colors.muted, textAlign: 'right' },
});
