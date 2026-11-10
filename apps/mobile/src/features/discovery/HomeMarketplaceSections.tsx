import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useOnlineResync } from '@/lib/useOnlineResync';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { fontSizes, colors, elevation, radius, sizes, spacing, typography, ux } from '@/theme/tokens';
import { SectionHeader } from '@/components/MobileUI';
import { readPublicCacheEntry, writePublicCache } from '@/storage/public-cache';
import { fetchProducts, type ProductSummary } from '@/features/commerce/commerce.api';
import { fetchServiceListings, type ServiceListing } from '@/features/services/services.api';
import { fetchOpenRequests, type MarketplaceRequest } from '@/features/requests/requests.api';
import { useAuth } from '@/features/auth/AuthContext';
import { AppImage } from '@/components/AppImage';
import { HorizontalMarketCard } from '@/components/MarketCards';
import { formatMoney } from '@/lib/formatters';

type SectionData = { products: ProductSummary[]; services: ServiceListing[]; requests: MarketplaceRequest[] };

function publicProductSnapshot(item: ProductSummary): ProductSummary {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    discountPrice: item.discountPrice,
    effectivePrice: item.effectivePrice,
    images: item.images?.slice(0, 2),
    category: item.category ? { name: item.category.name, nameAr: item.category.nameAr } : null,
    store: item.store ? { name: item.store.name, city: item.store.city } : null,
  };
}
function publicServiceSnapshot(item: ServiceListing): ServiceListing {
  return {
    id: item.id,
    title: item.title,
    price: item.price,
    pricingType: item.pricingType,
    images: item.images?.slice(0, 2),
    category: item.category ? { name: item.category.name, nameAr: item.category.nameAr } : null,
    provider: item.provider
      ? {
          businessName: item.provider.businessName,
          sellerProfile: item.provider.sellerProfile
            ? { displayName: item.provider.sellerProfile.displayName }
            : undefined,
        }
      : undefined,
  };
}
function publicRequestSnapshot(item: MarketplaceRequest): MarketplaceRequest {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    city: item.city,
    status: item.status,
    budgetMin: item.budgetMin,
    budgetMax: item.budgetMax,
    categoryId: item.categoryId,
    _count: item._count ? { offers: item._count.offers } : undefined,
  };
}

type SectionKey = keyof SectionData;
const CACHE_KEYS: Record<SectionKey, string> = {
  products: 'home:public-products:v1',
  services: 'home:public-services:v1',
  requests: 'home:public-market-requests:v1',
};
const PUBLIC_LIST_TTL_MS = 15 * 60 * 1000;
const EMPTY: SectionData = { products: [], services: [], requests: [] };

function money(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? formatMoney(amount) : String(value);
}
function firstImage(images?: string[] | null): string | null {
  return images?.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value)) ?? null;
}

function MarketplaceSectionHeader({
  title,
  subtitle,
  onAll,
}: {
  title: string;
  subtitle: string;
  onAll: () => void;
}) {
  return <SectionHeader title={title} subtitle={subtitle} actionLabel="عرض الكل" onAction={onAll} />;
}

function EmptySection({ label, offline }: { label: string; offline: boolean }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>
        {offline
          ? `لا توجد نسخة محفوظة من ${label} على هذا الجهاز بعد. افتح القسم أثناء الاتصال ليبقى متاحًا لاحقًا.`
          : `لا توجد عناصر ${label} للعرض حاليًا.`}
      </Text>
    </View>
  );
}

export default function HomeMarketplaceSections() {
  const { user } = useAuth();
  const [data, setData] = useState<SectionData>(EMPTY);
  const [loaded, setLoaded] = useState<Record<SectionKey, boolean>>({
    products: false,
    services: false,
    requests: false,
  });
  const [offline, setOffline] = useState(false);
  const savedAt = useRef<Partial<Record<SectionKey, number>>>({});
  const activeRef = useRef(true);
  const loadingRef = useRef(false);

  const refreshStale = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      let state: Awaited<ReturnType<typeof NetInfo.fetch>> | null = null;
      try {
        state = await NetInfo.fetch();
      } catch {
        /* Unknown connectivity */
      }
      if (!activeRef.current) return;
      if (state?.isConnected === false) {
        setOffline(true);
        return;
      }
      setOffline(false);
      const now = Date.now();
      const tasks: Promise<void>[] = [];
      if (!savedAt.current.products || now - savedAt.current.products >= PUBLIC_LIST_TTL_MS) {
        tasks.push(
          fetchProducts({ page: 1, limit: 8, sortBy: 'createdAt', sortOrder: 'desc' })
            .then(async (result) => {
              const items = result.items.slice(0, 4).map(publicProductSnapshot);
              await writePublicCache(CACHE_KEYS.products, items);
              if (activeRef.current) {
                savedAt.current.products = Date.now();
                setData((current) => ({ ...current, products: items }));
                setLoaded((current) => ({ ...current, products: true }));
              }
            })
            .catch(() => {
              if (activeRef.current) setLoaded((current) => ({ ...current, products: true }));
            }),
        );
      }
      if (!savedAt.current.services || now - savedAt.current.services >= PUBLIC_LIST_TTL_MS) {
        tasks.push(
          fetchServiceListings({ page: 1, limit: 8 })
            .then(async (items) => {
              const limited = items.slice(0, 4).map(publicServiceSnapshot);
              await writePublicCache(CACHE_KEYS.services, limited);
              if (activeRef.current) {
                savedAt.current.services = Date.now();
                setData((current) => ({ ...current, services: limited }));
                setLoaded((current) => ({ ...current, services: true }));
              }
            })
            .catch(() => {
              if (activeRef.current) setLoaded((current) => ({ ...current, services: true }));
            }),
        );
      }
      if (!savedAt.current.requests || now - savedAt.current.requests >= PUBLIC_LIST_TTL_MS) {
        tasks.push(
          fetchOpenRequests({ page: 1, limit: 8, sort: 'newest' })
            .then(async (result) => {
              const items = result.items.slice(0, 4).map(publicRequestSnapshot);
              await writePublicCache(CACHE_KEYS.requests, items);
              if (activeRef.current) {
                savedAt.current.requests = Date.now();
                setData((current) => ({ ...current, requests: items }));
                setLoaded((current) => ({ ...current, requests: true }));
              }
            })
            .catch(() => {
              if (activeRef.current) setLoaded((current) => ({ ...current, requests: true }));
            }),
        );
      }
      await Promise.all(tasks);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useOnlineResync(() => {
    void refreshStale();
  });

  useEffect(() => {
    activeRef.current = true;
    void (async () => {
      const keys: SectionKey[] = ['products', 'services', 'requests'];
      await Promise.all(
        keys.map(async (key) => {
          const cached = await readPublicCacheEntry<SectionData[typeof key]>(CACHE_KEYS[key]);
          if (!activeRef.current) return;
          if (cached && Array.isArray(cached.value)) {
            savedAt.current[key] = cached.savedAt;
            setData((current) => ({ ...current, [key]: cached.value.slice(0, 4) }));
            setLoaded((current) => ({ ...current, [key]: true }));
          }
        }),
      );
      await refreshStale();
    })();
    return () => {
      activeRef.current = false;
    };
  }, [refreshStale]);

  const hasProducts = data.products.length > 0;
  const hasServices = data.services.length > 0;
  const hasRequests = data.requests.length > 0;

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <MarketplaceSectionHeader
          title="منتجات مميزة"
          subtitle="منتجات من متاجر السوق المحلية"
          onAll={() => router.push('/products')}
        />
        {hasProducts ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {data.products.map((item) => (
              <HorizontalMarketCard
                key={item.id}
                title={item.name}
                subtitle={[item.store?.name, item.store?.city].filter(Boolean).join(' · ') || 'متجر محلي'}
                imageUri={firstImage(item.images)}
                price={money(item.effectivePrice?.price ?? item.discountPrice ?? item.price)}
                glyph="◇"
                onPress={() => router.push({ pathname: '/products/[id]', params: { id: item.id } })}
              />
            ))}
          </ScrollView>
        ) : (
          <EmptySection label="المنتجات" offline={offline} />
        )}
      </View>

      <View style={styles.section}>
        <MarketplaceSectionHeader
          title="خدمات قريبة"
          subtitle="مقدمو خدمات في منطقتك"
          onAll={() => router.push('/services')}
        />
        {hasServices ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {data.services.map((item) => (
              <HorizontalMarketCard
                key={item.id}
                title={item.title}
                subtitle={
                  item.provider?.businessName ||
                  item.provider?.sellerProfile?.displayName ||
                  'مقدم خدمة'
                }
                imageUri={firstImage(item.images)}
                price={money(item.price)}
                glyph="✦"
                onPress={() => router.push({ pathname: '/services/[id]', params: { id: item.id } })}
              />
            ))}
          </ScrollView>
        ) : (
          <EmptySection label="الخدمات" offline={offline} />
        )}
      </View>

      <View style={styles.section}>
        <MarketplaceSectionHeader
          title="طلبات السوق"
          subtitle="طلبات مفتوحة من المشترين"
          onAll={() => router.push('/requests')}
        />
        {hasRequests ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {data.requests.map((item) => (
              <HorizontalMarketCard
                key={item.id}
                title={item.title}
                subtitle={[
                  item.city,
                  item.type === 'SERVICE'
                    ? 'طلب خدمة'
                    : item.type === 'PRODUCT'
                      ? 'طلب منتج'
                      : 'طلب استئجار',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                price={
                  item.budgetMax
                    ? `حتى ${money(item.budgetMax)}`
                    : item.budgetMin
                      ? `من ${money(item.budgetMin)}`
                      : null
                }
                glyph="▤"
                onPress={() => router.push({ pathname: '/requests/[id]', params: { id: item.id } })}
              />
            ))}
          </ScrollView>
        ) : (
          <EmptySection label="طلبات السوق" offline={offline} />
        )}
      </View>

      {user ? (
        <View style={styles.ctaCard}>
          <Text style={styles.ctaTitle}>تابع طلباتك ومشترياتك</Text>
          <Text style={styles.ctaBody}>
            وصل سريع للطلبات التي أنشأتها، وطلبات الشراء ومتابعة حالتها دون استعلامات إضافية من الرئيسية.
          </Text>
          <View style={styles.ctaRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/orders')}
              style={({ pressed }) => [styles.ctaPrimary, pressed && styles.pressed]}
            >
              <Text style={styles.ctaPrimaryText}>طلباتي ومشترياتي</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/my-requests')}
              style={({ pressed }) => [styles.ctaSecondary, pressed && styles.pressed]}
            >
              <Text style={styles.ctaSecondaryText}>طلبات السوق التي أنشأتها</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/login')}
          style={({ pressed }) => [styles.ctaCard, pressed && styles.pressed]}
        >
          <Text style={styles.ctaTitle}>ابدأ بإدارة طلباتك</Text>
          <Text style={styles.ctaLink}>سجّل الدخول لمتابعة مشترياتك وطلباتك ←</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xxl,
  },
  section: {
    gap: spacing.md,
  },
  hScroll: { flexDirection: 'row', gap: spacing.md, paddingVertical: 2, paddingEnd: spacing.sm },
  emptyBox: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'right',
    lineHeight: 19,
  },
  miniCard: {
    width: 160,
    minHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...elevation.sm,
  },
  miniImage: {
    width: '100%',
    height: sizes.cardImageGrid - 20,
    backgroundColor: colors.border,
  },
  miniPlaceholder: {
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniGlyph: {
    color: colors.brandOnSoft,
    fontSize: fontSizes[28],
    fontWeight: '600',
  },
  miniBody: {
    flex: 1,
    padding: spacing.sm,
    gap: 4,
    alignItems: 'flex-end',
  },
  miniTitle: {
    width: '100%',
    minHeight: 36,
    ...typography.bodyStrong,
    fontSize: fontSizes[13],
    lineHeight: 18,
    color: colors.ink,
    textAlign: 'right',
  },
  miniSubtitle: {
    width: '100%',
    ...typography.caption,
    fontSize: fontSizes[11],
    color: colors.muted,
    textAlign: 'right',
  },
  miniPrice: {
    ...typography.bodyStrong,
    fontSize: fontSizes[13],
    color: colors.brand,
    textAlign: 'right',
    marginTop: 2,
  },
  pressed: { opacity: ux.pressedOpacity },
  ctaCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
    ...elevation.sm,
  },
  ctaTitle: {
    ...typography.subtitle,
    color: colors.ink,
    textAlign: 'right',
  },
  ctaBody: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'right',
    lineHeight: 19,
  },
  ctaLink: {
    ...typography.captionStrong,
    color: colors.brand,
    textAlign: 'right',
  },
  ctaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  ctaPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  ctaPrimaryText: {
    ...typography.captionStrong,
    color: colors.white,
  },
  ctaSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  ctaSecondaryText: {
    ...typography.captionStrong,
    color: colors.brand,
  },
});
