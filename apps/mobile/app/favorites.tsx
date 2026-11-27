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
import { AppFlashList } from '@/components/ui/AppFlashList';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { pickRemoteImageUri } from '@/lib/list-image';
import { router, useFocusEffect } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError } from '@/api/client';
import { useAuthActions, useAuthSession, useAuthUser } from '@/features/auth/AuthContext';
import {
  fetchFavoriteAdsPage,
  fetchFavoriteEntityPage,
  setFavoriteAdState,
  setFavoriteEntityState,
  type FavoriteEntityRecord,
  type FavoriteEntityType,
  type FavoriteRecord,
} from '@/features/ads/favorites.api';
import { enqueueFavoriteState, listPendingFavoriteStates, readFavoriteAdIds, writeFavoriteAdIds } from '@/features/ads/favorites.store';
import { AppHeader, EmptyState, ErrorState, LoadingState, SkeletonList } from '@/components/ui';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { AdCard, CatalogCard } from '@/components/MarketCards';
import { spacing, typography, radius, ux } from '@/theme/tokens';
import { COPY } from '@/lib/copy';

type FavoriteTab = 'ads' | 'products' | 'stores' | 'services';
type FavoriteListItem = FavoriteRecord | FavoriteEntityRecord;

const FAVORITE_TABS: { value: FavoriteTab; label: string }[] = [
  { value: 'ads', label: 'الإعلانات' },
  { value: 'products', label: 'المنتجات' },
  { value: 'stores', label: 'المتاجر' },
  { value: 'services', label: 'الخدمات' },
];

const ENTITY_TYPE: Record<Exclude<FavoriteTab, 'ads'>, FavoriteEntityType> = {
  products: 'products',
  stores: 'stores',
  services: 'services',
};

function isAdRecord(item: FavoriteListItem): item is FavoriteRecord {
  return 'adId' in item;
}

function itemKey(item: FavoriteListItem): string {
  return isAdRecord(item) ? `ad:${item.adId}` : `${item.entityType}:${item.entityId}`;
}

function entityPrice(type: Exclude<FavoriteTab, 'ads'>, item: FavoriteEntityRecord['entity']): string | undefined {
  if (type === 'stores' || item.price == null || item.price === '') return undefined;
  const amount = Number(item.effectivePrice?.price ?? item.effectivePrice?.amount ?? item.price);
  if (!Number.isFinite(amount)) return undefined;
  const formatted = formatMoney(amount);
  if (type === 'services' && item.pricingType === 'NEGOTIABLE') return 'السعر عند الاتفاق';
  return type === 'services' && item.pricingType === 'STARTING_FROM' ? `ابتداءً من ${formatted}` : formatted;
}

function entityTitle(type: Exclude<FavoriteTab, 'ads'>, entity: FavoriteEntityRecord['entity']): string {
  if (type === 'products' || type === 'stores') return entity.name?.trim() || (type === 'products' ? 'منتج محفوظ' : 'متجر محفوظ');
  return entity.title?.trim() || 'خدمة محفوظة';
}

function entityImage(type: Exclude<FavoriteTab, 'ads'>, entity: FavoriteEntityRecord['entity']): string | null {
  if (type === 'stores') return entity.logoUrl || entity.coverImageUrl || null;
  return pickRemoteImageUri(entity.images) ?? null;
}

function entityMeta(type: Exclude<FavoriteTab, 'ads'>, entity: FavoriteEntityRecord['entity']): string {
  const parts = type === 'services'
    ? [entity.category?.nameAr || entity.category?.name, entity.provider?.businessName || entity.provider?.sellerProfile?.displayName, entity.city || entity.provider?.city]
    : [entity.category?.nameAr || entity.category?.name, entity.city || entity.store?.city];
  return parts.filter((part): part is string => Boolean(part && String(part).trim())).join(' · ')
    || (type === 'products' ? 'منتج من متجر MarketPlat' : type === 'stores' ? 'متجر على MarketPlat' : 'خدمة على MarketPlat');
}

function destination(type: Exclude<FavoriteTab, 'ads'>, id: string) {
  if (type === 'products') return `/products/${encodeURIComponent(id)}`;
  if (type === 'stores') return `/stores/${encodeURIComponent(id)}`;
  return `/services/${encodeURIComponent(id)}`;
}

function priceLabel(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'السعر عند التواصل';
  const n = Number(value);
  return Number.isFinite(n) ? formatMoney(n) : String(value);
}

export default function FavoritesScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  const { user } = useAuthUser();
  const { csrfToken } = useAuthSession();
  const { getAccessToken } = useAuthActions();
  const net = useNetInfo();
  const online = net.isConnected === true && net.isInternetReachable !== false;
  const [activeType, setActiveType] = useState<FavoriteTab>('ads');
  const [items, setItems] = useState<FavoriteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const hasItemsRef = useRef(false);
  const requestSequence = useRef(0);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    const token = getAccessToken();
    const current = ++requestSequence.current;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setError(null);
    if (!token) {
      setItems([]);
      hasItemsRef.current = false;
      setPage(1);
      setTotalPages(1);
      setTotal(0);
      setLoading(false);
      setRefreshing(false);
      setError('سجّل الدخول لعرض المفضلة المتزامنة مع حسابك.');
      return;
    }
    if (isRefresh) setRefreshing(true);
    else if (!hasItemsRef.current) setLoading(true);

    try {
      if (activeType === 'ads') {
        const [recordsResult, pendingResult] = await Promise.allSettled([
          fetchFavoriteAdsPage(token, 1, 20),
          user?.id ? listPendingFavoriteStates(user.id) : Promise.resolve([]),
        ]);
        if (current !== requestSequence.current) return;
        if (recordsResult.status === 'rejected') throw recordsResult.reason;
        const pending = pendingResult.status === 'fulfilled' ? pendingResult.value : [];
        const desiredState = new Map(pending.map((operation) => [operation.adId, operation.favorited]));
        const nextItems = recordsResult.value.items.filter((record) => desiredState.get(record.adId) !== false);
        hasItemsRef.current = nextItems.length > 0;
        setItems(nextItems);
        setPage(recordsResult.value.page);
        setTotalPages(recordsResult.value.totalPages);
        setTotal(recordsResult.value.total);
      } else {
        const result = await fetchFavoriteEntityPage(activeType === 'products' ? 'product' : activeType === 'stores' ? 'store' : 'service', token, 1, 20);
        if (current !== requestSequence.current) return;
        hasItemsRef.current = result.items.length > 0;
        setItems(result.items);
        setPage(result.page);
        setTotalPages(result.totalPages);
        setTotal(result.total);
      }
    } catch (cause) {
      if (current === requestSequence.current) {
        setError(cause instanceof Error ? cause.message : 'تعذر تحميل المفضلة.');
      }
    } finally {
      if (current === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeType, getAccessToken, user?.id]);

  const loadMore = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !online || loading || loadingMoreRef.current || loadingMore || page >= totalPages) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    const current = requestSequence.current;
    const nextPage = page + 1;
    try {
      const result = activeType === 'ads'
        ? await fetchFavoriteAdsPage(token, nextPage, 20)
        : await fetchFavoriteEntityPage(activeType === 'products' ? 'product' : activeType === 'stores' ? 'store' : 'service', token, nextPage, 20);
      if (current !== requestSequence.current) return;

      // Apply the same account-scoped desired-state overlay used by page one.
      // Otherwise an ad removed offline can reappear when its server page loads.
      let pageItems = result.items;
      if (activeType === 'ads' && user?.id) {
        const pending = await listPendingFavoriteStates(user.id).catch(() => []);
        if (current !== requestSequence.current) return;
        const desiredState = new Map(pending.map((operation) => [operation.adId, operation.favorited]));
        pageItems = result.items.filter((record) => 'adId' in record ? desiredState.get(record.adId) !== false : true) as typeof result.items;
      }

      setItems((existing) => {
        const existingKeys = new Set(existing.map(itemKey));
        return [...existing, ...pageItems.filter((item) => !existingKeys.has(itemKey(item)))];
      });
      setPage(result.page);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (cause) {
      if (current === requestSequence.current) setError(cause instanceof Error ? cause.message : 'تعذر تحميل المزيد من المفضلة.');
    } finally {
      if (current === requestSequence.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [activeType, getAccessToken, loading, loadingMore, online, page, totalPages, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { requestSequence.current += 1; };
    }, [load]),
  );

  const onRemoveAd = useCallback((record: FavoriteRecord) => {
    if (!record.adId || !user?.id || busyId) return;
    setBusyId(record.adId);
    const screenRequest = requestSequence.current;
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
      ? setFavoriteAdState(record.adId, false, token, operationId, csrfToken).catch((cause) => {
          if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
            queued = true;
            return enqueueOffline();
          }
          throw cause;
        })
      : enqueueOffline();
    void Promise.resolve(work)
      .then(async () => {
        const ids = await readFavoriteAdIds(user.id);
        await writeFavoriteAdIds(ids.filter((id) => id !== record.adId), user.id);
        if (screenRequest === requestSequence.current) {
          setItems((current) => {
            const next = current.filter((item) => itemKey(item) !== `ad:${record.adId}`);
            hasItemsRef.current = next.length > 0;
            return next;
          });
          setTotal((value) => Math.max(0, value - 1));
        }
        showToast(queued ? 'حُفظت الإزالة للمزامنة' : 'تمت الإزالة من المفضلة', queued ? 'سيُزامن التغيير عند توفر الاتصال والجلسة.' : 'أزيل الإعلان من قائمتك.', queued ? 'info' : 'success');
      })
      .catch((cause) => showToast('تعذر إزالة الإعلان', cause instanceof ApiError || cause instanceof Error ? cause.message : COPY.tryAgain, 'error'))
      .finally(() => setBusyId(null));
  }, [busyId, csrfToken, getAccessToken, online, user?.id]);

  const onRemoveEntity = useCallback(async (record: FavoriteEntityRecord) => {
    if (!user?.id || busyId || !online) {
      if (!online) showToast('الاتصال مطلوب', 'أزل عناصر المنتجات والمتاجر والخدمات من المفضلة عند توفر الاتصال.', 'info');
      return;
    }
    const token = getAccessToken();
    if (!token) { pushOnce('/login'); return; }
    const screenRequest = requestSequence.current;
    setBusyId(record.entityId);
    try {
      const type = activeType === 'ads' ? 'ads' : ENTITY_TYPE[activeType];
      await setFavoriteEntityState(type, record.entityId, false, token, csrfToken);
      if (screenRequest === requestSequence.current) {
        setItems((current) => {
          const next = current.filter((item) => itemKey(item) !== `${record.entityType}:${record.entityId}`);
          hasItemsRef.current = next.length > 0;
          return next;
        });
        setTotal((value) => Math.max(0, value - 1));
      }
      showToast('تمت الإزالة من المفضلة', 'أزيل العنصر من قائمتك.', 'success');
    } catch (cause) {
      showToast('تعذر إزالة العنصر', cause instanceof Error ? cause.message : COPY.tryAgain, 'error');
    } finally {
      setBusyId(null);
    }
  }, [activeType, busyId, csrfToken, getAccessToken, online, user?.id]);

  const openAd = useCallback((adId: string) => pushOnce(`/ads/${encodeURIComponent(adId)}`), []);
  const openEntity = useCallback((id: string) => {
    if (activeType === 'ads') return;
    router.push(destination(activeType, id) as never);
  }, [activeType]);

  const renderItem = useCallback(({ item }: { item: FavoriteListItem }) => {
    if (isAdRecord(item)) {
      const ad = item.ad;
      return (
        <AdCard
          id={item.adId}
          title={ad?.title || 'إعلان محفوظ'}
          price={priceLabel(ad?.price)}
          meta={[ad?.city, ad?.category?.nameAr || ad?.category?.name].filter(Boolean).join(' · ') || 'إعلان محلي'}
          imageUri={pickRemoteImageUri(ad?.images)}
          isFavorite
          isNegotiable={Boolean(ad?.isNegotiable)}
          favoriteBusy={busyId === item.adId}
          onPressItem={openAd}
          onToggleFavoriteItem={(id) => {
            const record = item as FavoriteRecord;
            if (record.adId === id) onRemoveAd(record);
          }}
        />
      );
    }
    const entityType = activeType === 'ads' ? 'products' : activeType;
    return (
      <View style={styles.entityRow}>
        <View style={styles.entityCard}>
          <CatalogCard
            title={entityTitle(entityType, item.entity)}
            subtitle={entityType === 'stores' ? item.entity.description || undefined : item.entity.category?.nameAr || item.entity.category?.name || undefined}
            meta={entityMeta(entityType, item.entity)}
            price={entityPrice(entityType, item.entity)}
            imageUri={entityImage(entityType, item.entity)}
            glyph={entityType === 'products' ? '◇' : entityType === 'stores' ? '▣' : '✦'}
            onPress={() => openEntity(item.entityId)}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`إزالة ${entityTitle(entityType, item.entity)} من المفضلة`}
          accessibilityState={{ disabled: busyId === item.entityId || !online }}
          disabled={busyId === item.entityId || !online}
          onPress={() => void onRemoveEntity(item)}
          style={({ pressed }) => [styles.removeButton, pressed && styles.pressed, (busyId === item.entityId || !online) && styles.disabled]}
        >
          <Text style={styles.removeText}>{busyId === item.entityId ? 'جارٍ الإزالة…' : 'إزالة'}</Text>
        </Pressable>
      </View>
    );
  }, [activeType, busyId, onRemoveAd, onRemoveEntity, online, openAd, openEntity, styles]);

  const tabs = useMemo(() => (
    <View style={styles.tabs} accessibilityRole="tablist">
      {FAVORITE_TABS.map((tab) => (
        <Pressable
          key={tab.value}
          accessibilityRole="tab"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: activeType === tab.value }}
          onPress={() => {
            if (activeType === tab.value) return;
            setItems([]);
            setLoading(true);
            hasItemsRef.current = false;
            setPage(1);
            setTotalPages(1);
            setTotal(0);
            setActiveType(tab.value);
          }}
          style={({ pressed }) => [styles.tab, activeType === tab.value && styles.activeTab, pressed && styles.pressed]}
        >
          <Text style={[styles.tabText, activeType === tab.value && styles.activeTabText]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  ), [activeType, styles]);

  const { refreshing: pullRefreshing, onRefresh: onPullRefresh } = usePullRefresh(() => load(true));
  const countTitle = `${total} ${activeType === 'ads' ? 'إعلان' : activeType === 'products' ? 'منتج' : activeType === 'stores' ? 'متجر' : 'خدمة'} محفوظ${total === 1 ? '' : 'ة'}`;
  const footer = loadingMore
    ? <LoadingState message="جارٍ تحميل المزيد…" />
    : totalPages > page
      ? <Pressable accessibilityRole="button" disabled={!online} onPress={() => void loadMore()} style={styles.loadMore}><Text style={styles.loadMoreText}>تحميل المزيد</Text></Pressable>
      : null;

  return (
    <ScreenFrame>
      <View style={styles.screen}>
      <AppHeader title="المفضلة" right={user ? <Pressable accessibilityRole="button" onPress={() => void load(true)} hitSlop={8}><Text style={styles.link}>تحديث</Text></Pressable> : undefined} />
      {tabs}
      {!user ? (
        <View style={styles.center}>
          <EmptyState title="سجّل الدخول لعرض مفضلتك" description="المفضلة تُزامَن مع حسابك عبر الأجهزة." actionLabel="تسجيل الدخول" onAction={() => pushOnce('/login')} />
        </View>
      ) : loading && items.length === 0 ? (
        <SkeletonList count={4} />
      ) : error && items.length === 0 ? (
        <ErrorState title="تعذر تحميل المفضلة" description={error} onAction={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد عناصر في هذا القسم"
          description={`العناصر التي تحفظها ضمن ${FAVORITE_TABS.find((tab) => tab.value === activeType)?.label} ستظهر هنا.`}
          actionLabel="اكتشاف المحتوى"
          onAction={() => pushOnce('/search')}
        />
      ) : (
        <AppFlashList
          refreshControl={<BrandRefreshControl refreshing={pullRefreshing || refreshing} onRefresh={() => void onPullRefresh()} />}
          data={items}
          keyExtractor={itemKey}
          renderItem={renderItem}
          extraData={`${busyId ?? ''}:${activeType}`}
          contentContainerStyle={styles.content}
          ListHeaderComponent={<View style={styles.listHeader}>{error ? <Text style={styles.errorText}>{error}</Text> : null}<Text style={styles.count}>{countTitle}</Text></View>}
          ListFooterComponent={footer}
          ItemSeparatorComponent={ListGapMd}
          onEndReached={() => { if (totalPages > page) void loadMore(); }}
          onEndReachedThreshold={0.45}
        />
      )}
      </View>
    </ScreenFrame>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  link: { color: colors.brand, ...typography.captionStrong },
  center: { flex: 1, justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  activeTab: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  tabText: { ...typography.captionStrong, color: colors.muted },
  activeTabText: { color: colors.brandOnSoft },
  // FlashList: padding only (no gap); separators supply vertical spacing.
  content: { padding: spacing.lg, paddingBottom: spacing.x4l },
  listHeader: { gap: spacing.sm, marginBottom: spacing.md },
  count: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  errorText: { ...typography.caption, color: colors.danger, textAlign: 'right' },
  entityRow: { gap: spacing.xs },
  entityCard: { width: '100%' },
  removeButton: { alignSelf: 'flex-start', minHeight: 40, minWidth: 76, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft },
  removeText: { ...typography.captionStrong, color: colors.dangerText },
  disabled: { opacity: 0.55 },
  loadMore: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, marginTop: spacing.md, backgroundColor: colors.surface },
  loadMoreText: { ...typography.captionStrong, color: colors.brand },
  pressed: { opacity: ux.pressedOpacity },
});
