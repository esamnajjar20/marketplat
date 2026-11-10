import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useEffect, useRef, useState , useMemo} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useOnlineResync } from '@/lib/useOnlineResync';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchStores, type StoreSummary } from '@/features/commerce/commerce.api';
import { fetchStoryFeed, type StoryGroup } from '@/features/stories/stories.api';
import { fontSizes, elevation, radius, sizes, spacing, typography, ux } from '@/theme/tokens';
import { readPublicCacheEntry, writePublicCache } from '@/storage/public-cache';
import { AppImage } from '@/components/AppImage';
import { HorizontalMarketCard } from '@/components/MarketCards';
import { SectionHeader } from '@/components/MobileUI';

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { accessToken, isRestoring, user } = useAuth();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [storiesOwnerId, setStoriesOwnerId] = useState<string | null>(null);
  const [failedStoryAvatars, setFailedStoryAvatars] = useState<string[]>([]);
  const reconnectRefreshRef = useRef<() => void>(() => undefined);
  useOnlineResync(() => reconnectRefreshRef.current());
  const visibleStories = accessToken && user?.id && storiesOwnerId === user.id ? stories : [];
  const [communityExpanded, setCommunityExpanded] = useState(false);
  const visibleStores = communityExpanded ? stores : stores.slice(0, 4);

  useEffect(() => {
    if (isRestoring) return;
    let active = true;
    let requestInFlight = false;
    let refreshQueued = false;
    let lastStoresSuccessfulAt = 0;
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
        try {
          networkState = await NetInfo.fetch();
        } catch {
          /* Unknown connectivity */
        }
        if (!active || (networkState !== null && networkState.isConnected === false)) {
          if (active && !accessToken) setStories([]);
          return;
        }

        const tasks: Promise<void>[] = [];
        const storesCacheIsFresh =
          lastStoresSuccessfulAt > 0 && Date.now() - lastStoresSuccessfulAt < PUBLIC_STORES_TTL_MS;
        if (force || !storesCacheIsFresh) {
          tasks.push(
            fetchStores({ page: 1, limit: 10 })
              .then(async (result) => {
                const nextStores = result.items.slice(0, 6);
                if (!active) return;
                lastStoresSuccessfulAt = Date.now();
                await writePublicCache(PUBLIC_STORES_CACHE_KEY, nextStores);
                if (active) setStores(nextStores);
              })
              .catch(() => {
                /* Preserve last snapshot */
              }),
          );
        }

        if (accessToken) {
          tasks.push(
            fetchStoryFeed(accessToken)
              .then((result) => {
                if (active && user?.id) {
                  setStories(result.slice(0, 8));
                  setStoriesOwnerId(user.id);
                }
              })
              .catch(() => {
                /* Preserve session stories */
              }),
          );
        } else {
          setStories([]);
        }
        await Promise.all(tasks);
      } catch {
        /* keep cached */
      } finally {
        requestInFlight = false;
        if (active && refreshQueued) {
          refreshQueued = false;
          void refresh(true);
        }
      }
    };

    void (async () => {
      const cachedStores = await readPublicCacheEntry<StoreSummary[]>(PUBLIC_STORES_CACHE_KEY);
      if (active && cachedStores && Array.isArray(cachedStores.value)) {
        setStores(cachedStores.value.slice(0, 6));
        lastStoresSuccessfulAt = cachedStores.savedAt;
      }
      if (active && !accessToken) setStories([]);
      await refresh();
    })();

    reconnectRefreshRef.current = () => {
      void refresh(true);
    };
    return () => {
      active = false;
      reconnectRefreshRef.current = () => undefined;
    };
  }, [accessToken, isRestoring, user?.id]);

  return (
    <View style={styles.root}>
      {/* القصص أولاً إن وُجدت — عنصر اجتماعي خفيف */}
      {visibleStories.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="قصص المجتمع" subtitle="ماذا ينشر الجيران الآن" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {visibleStories.map((group) => {
              const latest = group.stories[0];
              if (!latest) return null;
              const avatar = failedStoryAvatars.includes(group.user.id)
                ? null
                : group.user.avatarUrl || latest.mediaUrl || null;
              return (
                <Pressable
                  key={group.user.id}
                  accessibilityRole="button"
                  accessibilityLabel={`عرض قصص ${group.user.name}`}
                  onPress={() =>
                    router.push({
                      pathname: '/stories/[id]',
                      params: { id: latest.id, userId: latest.userId },
                    })
                  }
                  style={({ pressed }) => [styles.storyItem, pressed && styles.pressed]}
                >
                  <View
                    style={[
                      styles.storyRing,
                      { borderColor: group.hasUnseen ? colors.brand : colors.border },
                    ]}
                  >
                    {avatar ? (
                      <AppImage
                        uri={avatar}
                        onError={() =>
                          setFailedStoryAvatars((current) =>
                            current.includes(group.user.id) ? current : [...current, group.user.id],
                          )
                        }
                        style={styles.storyAvatar}
                      />
                    ) : (
                      <View style={styles.storyPlaceholder}>
                        <Text style={styles.storyInitial}>
                          {group.user.name?.trim()?.charAt(0) || 'م'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.storyName, group.hasUnseen && styles.storyNameUnseen]}
                  >
                    {group.user.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* المتاجر */}
      <View style={styles.section}>
        <SectionHeader
          title="متاجر تستحق الاكتشاف"
          subtitle="تعرّف على المتاجر المحلية"
          actionLabel="عرض الكل"
          onAction={() => router.push('/stores')}
        />
        {visibleStores.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {visibleStores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              لا توجد متاجر متاحة للعرض حاليًا. سيظهر هنا أحدث المتاجر عند توفرها.
            </Text>
          </View>
        )}
      </View>

      {stores.length > 4 || visibleStories.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: communityExpanded }}
          onPress={() => setCommunityExpanded((v) => !v)}
          style={({ pressed }) => [styles.expandBtn, pressed && styles.pressed]}
        >
          <Text style={styles.expandText}>
            {communityExpanded ? 'عرض أقل' : 'المزيد من المجتمع'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  root: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  hScroll: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  storyItem: {
    width: 76,
    alignItems: 'center',
    gap: 6,
  },
  storyRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 3,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brandSoft,
  },
  storyPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyInitial: {
    color: colors.brandOnSoft,
    fontWeight: '700',
    fontSize: fontSizes[18],
  },
  storyName: {
    width: '100%',
    color: colors.ink,
    fontSize: fontSizes[11],
    fontWeight: '500',
    textAlign: 'center',
  },
  storyNameUnseen: {
    fontWeight: '700',
  },
  emptyBox: {
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: spacing.md,
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: fontSizes[12],
    lineHeight: 19,
    textAlign: 'right',
  },
  expandBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
  },
  expandText: {
    color: colors.brandOnSoft,
    fontWeight: '600',
    fontSize: fontSizes[13],
  },
  pressed: { opacity: ux.pressedOpacity },
});
