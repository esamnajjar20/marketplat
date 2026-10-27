import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { colors, radius, spacing } from '@/theme/tokens';
import { readPublicCacheEntry, writePublicCache } from '@/storage/public-cache';
import { fetchMixedRecommendations, type RecommendationItem } from './discovery.api';

type Highlight = { id: string; kind: 'ad' | 'product' | 'service'; item: RecommendationItem };

function itemTitle(item: RecommendationItem) {
  return item.title?.trim() || item.name?.trim() || 'عنصر في السوق';
}

function itemSubtitle(row: Highlight) {
  if (row.kind === 'product') return row.item.store?.name || 'منتج من متجر';
  if (row.kind === 'service') return row.item.provider?.displayName || row.item.provider?.user?.name || 'مقدم خدمة';
  return row.item.city || row.item.user?.name || 'إعلان محلي';
}

function itemDestination(row: Highlight) {
  if (row.kind === 'product') return `/products/${encodeURIComponent(row.item.id)}`;
  if (row.kind === 'service') return `/services/${encodeURIComponent(row.item.id)}`;
  return `/ads/${encodeURIComponent(row.item.id)}`;
}

function itemKindLabel(kind: Highlight['kind']) {
  if (kind === 'product') return 'منتج';
  if (kind === 'service') return 'خدمة';
  return 'إعلان';
}

function itemPrice(item: RecommendationItem) {
  if (item.price === null || item.price === undefined || item.price === '') return null;
  const value = Number(item.price);
  return Number.isFinite(value)
    ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(value)} ₪`
    : String(item.price);
}

type Props = { excludeAdIds?: string[] };
const PUBLIC_HIGHLIGHTS_CACHE_KEY = 'home:public-mixed-highlights:v1';
const PUBLIC_HIGHLIGHTS_TTL_MS = 3 * 60 * 1000;

function toBalancedHighlights(data: { ads?: RecommendationItem[] | null; products?: RecommendationItem[] | null; services?: RecommendationItem[] | null }): Highlight[] {
  const merged: Highlight[] = [
    ...(data.ads ?? []).map((item) => ({ id: `ad-${item.id}`, kind: 'ad' as const, item })),
    ...(data.products ?? []).map((item) => ({ id: `product-${item.id}`, kind: 'product' as const, item })),
    ...(data.services ?? []).map((item) => ({ id: `service-${item.id}`, kind: 'service' as const, item })),
  ];
  const buckets = {
    ad: merged.filter((row) => row.kind === 'ad'),
    product: merged.filter((row) => row.kind === 'product'),
    service: merged.filter((row) => row.kind === 'service'),
  };
  const balanced: Highlight[] = [];
  while (balanced.length < 9 && (buckets.ad.length || buckets.product.length || buckets.service.length)) {
    for (const kind of ['ad', 'product', 'service'] as const) {
      const next = buckets[kind].shift();
      if (next && balanced.length < 9) balanced.push(next);
    }
  }
  return balanced;
}

export default function HomeMarketplaceHighlights({ excludeAdIds = [] }: Props) {
  const { accessToken, isRestoring, user } = useAuth();
  const [items, setItems] = useState<Highlight[]>([]);
  const [itemsScope, setItemsScope] = useState<'public' | 'private'>('public');
  const [itemsOwnerId, setItemsOwnerId] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<string[]>([]);
  // Public snapshots may be shown to anyone; personalized snapshots are scoped to the owning account.
  const snapshotVisible = itemsScope === 'public'
    || (!!accessToken && !!user?.id && itemsScope === 'private' && itemsOwnerId === user.id);
  const visibleItems = (snapshotVisible ? items : []).filter((row) => row.kind !== 'ad' || !excludeAdIds.includes(row.item.id));

  useEffect(() => {
    if (isRestoring) return;
    let active = true;
    let requestInFlight = false;
    let refreshQueued = false;
    let previousOnline: boolean | null = null;
    let lastSuccessfulAt = 0;

    const refresh = async (force = false) => {
      if (!active) return;
      if (requestInFlight) {
        if (force) refreshQueued = true;
        return;
      }
      if (!force && lastSuccessfulAt > 0 && Date.now() - lastSuccessfulAt < PUBLIC_HIGHLIGHTS_TTL_MS) return;
      requestInFlight = true;
      try {
        let networkState: Awaited<ReturnType<typeof NetInfo.fetch>> | null = null;
        try { networkState = await NetInfo.fetch(); } catch { /* Unknown connectivity: still attempt the request. */ }
        if (!active || networkState !== null && networkState.isConnected === false) return;
        const data = await fetchMixedRecommendations(12, accessToken);
        if (!active) return;
        const nextItems = toBalancedHighlights(data);
        lastSuccessfulAt = Date.now();
        setItems(nextItems);
        setItemsScope(accessToken ? 'private' : 'public');
        setItemsOwnerId(accessToken ? user?.id ?? null : null);
        // Authenticated recommendations may be personalized; persist public results only.
        if (!accessToken) await writePublicCache(PUBLIC_HIGHLIGHTS_CACHE_KEY, data);
      } catch {
        // Keep the last successful snapshot visible when refresh fails.
      } finally {
        requestInFlight = false;
        // If connectivity returned while a request was running, do not lose that refresh.
        if (active && refreshQueued) {
          refreshQueued = false;
          void refresh(true);
        }
      }
    };

    void (async () => {
      // Hydrate first so a reconnect or slow request never blanks the visible section.
      if (!accessToken) {
        const cached = await readPublicCacheEntry<{ ads?: RecommendationItem[]; products?: RecommendationItem[]; services?: RecommendationItem[] }>(PUBLIC_HIGHLIGHTS_CACHE_KEY);
        if (active && cached) {
          setItems(toBalancedHighlights(cached.value));
          setItemsScope('public');
          setItemsOwnerId(null);
          lastSuccessfulAt = cached.savedAt;
        }
      }
      await refresh();
    })();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      const wasOnline = previousOnline;
      previousOnline = online;
      if (wasOnline === false && online) void refresh(true);
    });

    return () => { active = false; unsubscribe(); };
  }, [accessToken, isRestoring, user?.id]);

  if (visibleItems.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '900', textAlign: 'right' }}>اكتشف من السوق</Text>
          <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'right' }}>إعلانات ومنتجات وخدمات في مكان واحد</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/trending')} hitSlop={8}>
          <Text style={{ color: colors.brand, fontWeight: '800', fontSize: 12 }}>عرض الكل</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', gap: spacing.sm, paddingVertical: 2 }}>
        {visibleItems.map((row) => {
          const imageUri = failedImageIds.includes(row.id) ? null : (row.item.images?.find((url) => typeof url === 'string' && /^https?:\/\//i.test(url)) || row.item.image || null);
          const price = itemPrice(row.item);
          return (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={`${itemKindLabel(row.kind)}: ${itemTitle(row.item)}`}
              onPress={() => router.push(itemDestination(row) as never)}
              style={{ width: 164, minHeight: 246, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' }}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={{ width: '100%', height: 112, backgroundColor: colors.brandSoft }} resizeMode="cover" onError={() => setFailedImageIds((current) => current.includes(row.id) ? current : [...current, row.id])} />
              ) : (
                <View style={{ width: '100%', height: 112, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 32, color: colors.brand }}>{row.kind === 'ad' ? '◇' : row.kind === 'product' ? '▦' : '✦'}</Text>
                </View>
              )}
              <View style={{ flex: 1, padding: spacing.sm, gap: 4, alignItems: 'flex-end' }}>
                <Text numberOfLines={2} style={{ minHeight: 36, width: '100%', color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'right' }}>{itemTitle(row.item)}</Text>
                <Text numberOfLines={1} style={{ minHeight: 16, width: '100%', color: colors.muted, fontSize: 11, textAlign: 'right' }}>{itemSubtitle(row)}</Text>
                <View style={{ width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
                  <Text style={{ color: colors.brand, fontSize: 10, fontWeight: '800' }}>{itemKindLabel(row.kind)}</Text>
                  {price ? <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 11, fontWeight: '900' }}>{price}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
