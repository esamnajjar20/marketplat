import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchStores, type StoreSummary } from '@/features/commerce/commerce.api';
import { fetchStoryFeed, type StoryGroup } from '@/features/stories/stories.api';
import { colors, radius, spacing } from '@/theme/tokens';
import { readPublicCacheEntry, writePublicCache } from '@/storage/public-cache';

const PUBLIC_STORES_CACHE_KEY = 'home:public-stores:v1';
const PUBLIC_STORES_TTL_MS = 10 * 60 * 1000;

function StoreCard({ store }: { store: StoreSummary }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUri = !imageFailed ? (store.logoUrl || store.coverImageUrl || null) : null;
  const rating = store.sellerProfile?.averageRating;
  const ratingLabel = rating !== null && rating !== undefined && Number.isFinite(Number(rating))
    ? `★ ${Number(rating).toFixed(1)}`
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`فتح متجر ${store.name}`}
      onPress={() => router.push({ pathname: '/stores/[id]', params: { id: store.id } })}
      style={{ width: 174, minHeight: 204, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' }}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} resizeMode="cover" onError={() => setImageFailed(true)} style={{ height: 88, width: '100%', backgroundColor: colors.brandSoft }} />
      ) : (
        <View style={{ height: 88, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft }}>
          <Text style={{ color: colors.brand, fontSize: 28, fontWeight: '900' }}>م</Text>
        </View>
      )}
      <View style={{ flex: 1, padding: spacing.sm, gap: 5, alignItems: 'flex-end' }}>
        <Text numberOfLines={1} style={{ width: '100%', color: colors.ink, fontWeight: '900', fontSize: 13, textAlign: 'right' }}>{store.name}</Text>
        <Text numberOfLines={1} style={{ width: '100%', color: colors.muted, fontSize: 11, textAlign: 'right' }}>{store.city || 'متجر محلي'}</Text>
        <View style={{ width: '100%', flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: colors.brand, fontSize: 10, fontWeight: '800' }}>{store._count?.products ? `${store._count.products} منتجات` : 'تصفّح المتجر'}</Text>
          {ratingLabel ? <Text style={{ color: colors.ink, fontSize: 10, fontWeight: '800' }}>{ratingLabel}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function HomeCommunitySections() {
  const { accessToken, isRestoring, user } = useAuth();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [storiesOwnerId, setStoriesOwnerId] = useState<string | null>(null);
  const [failedStoryAvatars, setFailedStoryAvatars] = useState<string[]>([]);
  // Never render a private feed unless it belongs to the currently authenticated account.
  const visibleStories = accessToken && user?.id && storiesOwnerId === user.id ? stories : [];

  useEffect(() => {
    if (isRestoring) return;
    let active = true;
    let requestInFlight = false;
    let refreshQueued = false;
    let previousOnline: boolean | null = null;
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

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      const wasOnline = previousOnline;
      previousOnline = online;
      if (wasOnline === false && online) void refresh(true);
    });

    return () => { active = false; unsubscribe(); };
  }, [accessToken, isRestoring, user?.id]);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
          <View style={{ minHeight: 36, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '900', textAlign: 'right' }}>متاجر تستحق الاكتشاف</Text>
              <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'right' }}>تعرّف على المتاجر المحلية ومنتجاتها</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/stores')} hitSlop={8}>
              <Text style={{ color: colors.brand, fontWeight: '800', fontSize: 12 }}>عرض الكل</Text>
            </Pressable>
          </View>
          {stores.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', gap: spacing.sm, paddingVertical: 2 }}>
              {stores.map((store) => <StoreCard key={store.id} store={store} />)}
            </ScrollView>
          ) : (
            <View style={{ minHeight: 68, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md, justifyContent: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'right' }}>لا توجد متاجر متاحة للعرض حاليًا. سيظهر هنا أحدث المتاجر عند توفرها.</Text>
            </View>
          )}
        </View>

      {visibleStories.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ minHeight: 36, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '900', textAlign: 'right' }}>قصص وتحديثات جديدة</Text>
              <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'right' }}>تابع آخر ما يشاركه الأشخاص الذين تتابعهم</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/stories')} hitSlop={8}>
              <Text style={{ color: colors.brand, fontWeight: '800', fontSize: 12 }}>عرض الكل</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', gap: spacing.md, paddingVertical: 2 }}>
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
                    {avatar ? <Image source={{ uri: avatar }} onError={() => setFailedStoryAvatars((current) => current.includes(group.user.id) ? current : [...current, group.user.id])} style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandSoft }} /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontWeight: '900', fontSize: 20 }}>{group.user.name?.trim()?.charAt(0) || 'م'}</Text></View>}
                  </View>
                  <Text numberOfLines={1} style={{ width: '100%', color: colors.ink, fontSize: 11, fontWeight: group.hasUnseen ? '800' : '500', textAlign: 'center' }}>{group.user.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
