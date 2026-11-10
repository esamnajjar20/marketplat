import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useOnlineResync } from '@/lib/useOnlineResync';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchStores, type StoreSummary } from '@/features/commerce/commerce.api';
import { fetchStoryFeed, type StoryGroup } from '@/features/stories/stories.api';
import { fontSizes, colors, elevation, radius, sizes, spacing, typography, ux } from '@/theme/tokens';
import { readPublicCacheEntry, writePublicCache } from '@/storage/public-cache';
import { AppImage } from '@/components/AppImage';
import { HorizontalMarketCard } from '@/components/MarketCards';

const PUBLIC_STORES_CACHE_KEY = 'home:public-stores:v1';
const PUBLIC_STORES_TTL_MS = 10 * 60 * 1000;

function StoreCard({ store }: { store: StoreSummary }) {
  const imageUri = store.logoUrl || store.coverImageUrl || null;
  const rating = store.sellerProfile?.averageRating;
  const ratingLabel =
    rating !== null && rating !== undefined && Number.isFinite(Number(rating))
      ? `★ ${Number(rating).toFixed(1)}`
      : null;
  const subtitle = [store.city || 'متجر محلي', ratingLabel].filter(Boolean).join(' · ');
  const price =
    store._count?.products != null && store._count.products > 0
      ? `${store._count.products} منتجات`
      : 'تصفّح المتجر';

  return (
    <HorizontalMarketCard
      title={store.name}
      subtitle={subtitle}
      price={price}
      imageUri={imageUri}
      glyph="م"
      onPress={() => router.push({ pathname: '/stores/[id]', params: { id: store.id } })}
    />
  );
}

export default function HomeCommunitySections() {
  const { accessToken, isRestoring, user } = useAuth();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [storiesOwnerId, setStoriesOwnerId] = useState<string | null>(null);
  const [failedStoryAvatars, setFailedStoryAvatars] = useState<string[]>([]);
  const reconnectRefreshRef = useRef<() => void>(() => undefined);
  useOnlineResync(() => reconnectRefreshRef.current());
  // Never render a private feed unless it belongs to the currently authenticated account.
  const visibleStories = accessToken && user?.id && storiesOwnerId === user.id ? stories : [];
  const [communityExpanded, setCommunityExpanded] = useState(false);
  const visibleStores = communityExpanded ? stores : stores.slice(0, 4);

  useEffect(() => {
    if (isRestoring) return;
    let active = true;
    let requestInFlight = false;
    let refreshQueued = false;
    let lastStoresSuccessfulAt = 0;
    // Never keep a prior account's private story feed while a new session is loading.
    setStories([]);
    setStoriesOwnerId(null);

    const refresh = async (force = false) => {
      if (!active) return;
      if (requestInFlight) {
        if (force) refreshQueued = true;
        return;
      }
      requestInFlight = true;
      try {
        let networkState: Awaited<ReturnType<typeof NetInfo.fetch>> | null = null;
        try { networkState = await NetInfo.fetch(); } catch { /* Unknown connectivity: attempt best-effort requests. */ }
        if (!active || networkState !== null && networkState.isConnected === false) {
          if (active && !accessToken) setStories([]);
          return;
        }

        const tasks: Promise<void>[] = [];
        const storesCacheIsFresh = lastStoresSuccessfulAt > 0 && Date.now() - lastStoresSuccessfulAt < PUBLIC_STORES_TTL_MS;
        if (force || !storesCacheIsFresh) {
          tasks.push(fetchStores({ page: 1, limit: 10 })
            .then(async (result) => {
              const nextStores = result.items.slice(0, 6);
              if (!active) return;
              lastStoresSuccessfulAt = Date.now();
              await writePublicCache(PUBLIC_STORES_CACHE_KEY, nextStores);
              if (active) setStores(nextStores);
            })
            .catch(() => { /* Preserve the last successful public snapshot. */ }));
        }

        if (accessToken) {
          // Story feeds are private and do not persist them in the public cache; keep them memory-only.
          tasks.push(fetchStoryFeed(accessToken)
            .then((result) => {
              if (active && user?.id) {
                setStories(result.slice(0, 8));
                setStoriesOwnerId(user.id);
              }
            })
            .catch(() => { /* Preserve the current session's last successful story feed. */ }));
        } else {
          setStories([]);
        }
        await Promise.all(tasks);
      } catch {
        // Unknown connectivity still permits a best-effort refresh; keep cached content on failure.
      } finally {
        requestInFlight = false;
        // Preserve a reconnect-triggered refresh that arrived during an in-flight request.
        if (active && refreshQueued) {
          refreshQueued = false;
          void refresh(true);
        }
      }
    };

    void (async () => {
      // Restore public stores immediately; authenticated story data is never persisted.
      const cachedStores = await readPublicCacheEntry<StoreSummary[]>(PUBLIC_STORES_CACHE_KEY);
      if (active && cachedStores && Array.isArray(cachedStores.value)) {
        setStores(cachedStores.value.slice(0, 6));
        lastStoresSuccessfulAt = cachedStores.savedAt;
      }
      if (active && !accessToken) setStories([]);
      await refresh();
    })();

    reconnectRefreshRef.current = () => { void refresh(true); };
    return () => { active = false; reconnectRefreshRef.current = () => undefined; };
  }, [accessToken, isRestoring, user?.id]);

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ gap: spacing.md }}>
          <View style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontSize: fontSizes[16], fontWeight: '700', textAlign: 'right' }}>متاجر تستحق الاكتشاف</Text>
              <Text style={{ color: colors.muted, fontSize: fontSizes[12], textAlign: 'right' }}>تعرّف على المتاجر المحلية ومنتجاتها</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/stores')} hitSlop={8}>
              <Text style={{ color: colors.brand, fontWeight: '600', fontSize: fontSizes[12] }}>عرض الكل</Text>
            </Pressable>
          </View>
          {visibleStores.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: spacing.md, paddingVertical: 2 }}>
              {visibleStores.map((store) => <StoreCard key={store.id} store={store} />)}
            </ScrollView>
          ) : (
            <View style={{ minHeight: 68, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surface, padding: spacing.md, justifyContent: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: fontSizes[12], lineHeight: 19, textAlign: 'right' }}>لا توجد متاجر متاحة للعرض حاليًا. سيظهر هنا أحدث المتاجر عند توفرها.</Text>
            </View>
          )}
        </View>

      {/* القصص تظهر بعد توسيع قسم المجتمع لتقليل الكثافة على الشاشات الصغيرة */}
      {communityExpanded && visibleStories.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontSize: fontSizes[18], fontWeight: '700', textAlign: 'right' }}>قصص وتحديثات جديدة</Text>
              <Text style={{ color: colors.muted, fontSize: fontSizes[12], textAlign: 'right' }}>تابع آخر ما يشاركه الأشخاص الذين تتابعهم</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/stories')} hitSlop={8}>
              <Text style={{ color: colors.brand, fontWeight: '600', fontSize: fontSizes[12] }}>عرض الكل</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: spacing.md, paddingVertical: 2 }}>
            {visibleStories.map((group) => {
              const latest = group.stories[0];
              if (!latest) return null;
              const avatar = failedStoryAvatars.includes(group.user.id) ? null : (group.user.avatarUrl || latest.mediaUrl || null);
              return (
                <Pressable
                  key={group.user.id}
                  accessibilityRole="button"
                  accessibilityLabel={`عرض قصص ${group.user.name}`}
                  onPress={() => router.push({ pathname: '/stories/[id]', params: { id: latest.id, userId: latest.userId } })}
                  style={{ width: 78, alignItems: 'center', gap: 6 }}
                >
                  <View style={{ width: 68, height: 68, borderRadius: 34, padding: 3, borderWidth: 2, borderColor: group.hasUnseen ? colors.brand : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    {avatar ? <AppImage uri={avatar} onError={() => setFailedStoryAvatars((current) => current.includes(group.user.id) ? current : [...current, group.user.id])} style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandSoft }} /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brandOnSoft, fontWeight: '700', fontSize: fontSizes[20] }}>{group.user.name?.trim()?.charAt(0) || 'م'}</Text></View>}
                  </View>
                  <Text numberOfLines={1} style={{ width: '100%', color: colors.ink, fontSize: fontSizes[11], fontWeight: group.hasUnseen ? '800' : '500', textAlign: 'center' }}>{group.user.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {(stores.length > 4 || visibleStories.length > 0) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: communityExpanded }}
          onPress={() => setCommunityExpanded((v) => !v)}
          style={{ alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.brandSoft }}
        >
          <Text style={{ color: colors.brandOnSoft, fontWeight: '600', fontSize: fontSizes[13] }}>
            {communityExpanded ? 'عرض أقل من المجتمع' : 'المزيد من المجتمع'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
