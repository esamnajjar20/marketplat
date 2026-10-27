import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, spacing } from '@/theme/tokens';
import { SectionHeader } from '@/components/MobileUI';
import { readPublicCacheEntry, writePublicCache } from '@/storage/public-cache';
import { fetchProducts, type ProductSummary } from '@/features/commerce/commerce.api';
import { fetchServiceListings, type ServiceListing } from '@/features/services/services.api';
import { fetchOpenRequests, type MarketplaceRequest } from '@/features/requests/requests.api';
import { useAuth } from '@/features/auth/AuthContext';

type SectionData = { products: ProductSummary[]; services: ServiceListing[]; requests: MarketplaceRequest[] };

// Keep the persisted homepage snapshot minimal: never cache customer identity, offer details,
// contact information, or unrelated fields that the homepage does not render.
function publicProductSnapshot(item: ProductSummary): ProductSummary {
  return { id: item.id, name: item.name, price: item.price, discountPrice: item.discountPrice, effectivePrice: item.effectivePrice, images: item.images?.slice(0, 2), category: item.category ? { name: item.category.name, nameAr: item.category.nameAr } : null, store: item.store ? { name: item.store.name, city: item.store.city } : null };
}
function publicServiceSnapshot(item: ServiceListing): ServiceListing {
  return { id: item.id, title: item.title, price: item.price, pricingType: item.pricingType, images: item.images?.slice(0, 2), category: item.category ? { name: item.category.name, nameAr: item.category.nameAr } : null, provider: item.provider ? { businessName: item.provider.businessName, sellerProfile: item.provider.sellerProfile ? { displayName: item.provider.sellerProfile.displayName } : null } : null };
}
function publicRequestSnapshot(item: MarketplaceRequest): MarketplaceRequest {
  return { id: item.id, type: item.type, title: item.title, city: item.city, status: item.status, budgetMin: item.budgetMin, budgetMax: item.budgetMax, categoryId: item.categoryId, _count: item._count ? { offers: item._count.offers } : undefined };
}
type SectionKey = keyof SectionData;
const CACHE_KEYS: Record<SectionKey, string> = {
  products: 'home:public-products:v1',
  services: 'home:public-services:v1',
  requests: 'home:public-market-requests:v1',
};
// Public, non-personalized lists can be shared by server/CDN cache policies and reused locally.
// A long local TTL avoids repeating queries every time the user returns to Home.
const PUBLIC_LIST_TTL_MS = 15 * 60 * 1000;
const EMPTY: SectionData = { products: [], services: [], requests: [] };

function money(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(amount)} ₪` : String(value);
}
function firstImage(images?: string[] | null): string | null {
  return images?.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value)) ?? null;
}
function MarketplaceSectionHeader({ title, subtitle, onAll }: { title: string; subtitle: string; onAll: () => void }) {
  return <SectionHeader title={title} subtitle={subtitle} actionLabel="عرض الكل" onAction={onAll} />;
}
function EmptySection({ label, offline }: { label: string; offline: boolean }) {
  return <View style={{ minHeight: 68, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md, justifyContent: 'center' }}>
    <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'right', lineHeight: 19 }}>{offline ? `لا توجد نسخة محفوظة من ${label} على هذا الجهاز بعد. افتح القسم أثناء الاتصال ليبقى متاحًا لاحقًا.` : `لا توجد عناصر ${label} للعرض حاليًا.`}</Text>
  </View>;
}
function MiniCard({ title, subtitle, image, price, glyph, onPress }: { title: string; subtitle: string; image?: string | null; price?: string | null; glyph: string; onPress: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{ width: 158, minHeight: 190, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' }}>
    {image && !imageFailed ? <Image source={{ uri: image }} onError={() => setImageFailed(true)} resizeMode="cover" style={{ width: '100%', height: 88, backgroundColor: colors.brandSoft }} /> : <View style={{ width: '100%', height: 88, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft }}><Text style={{ color: colors.brand, fontSize: 30, fontWeight: '900' }}>{glyph}</Text></View>}
    <View style={{ flex: 1, padding: spacing.sm, gap: 5, alignItems: 'flex-end' }}>
      <Text numberOfLines={2} style={{ width: '100%', minHeight: 36, color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'right' }}>{title}</Text>
      <Text numberOfLines={1} style={{ width: '100%', color: colors.muted, fontSize: 11, textAlign: 'right' }}>{subtitle}</Text>
      {price ? <Text numberOfLines={1} style={{ color: colors.brand, fontSize: 12, fontWeight: '900', textAlign: 'right' }}>{price}</Text> : null}
    </View>
  </Pressable>;
}

export default function HomeMarketplaceSections() {
  const { user } = useAuth();
  const [data, setData] = useState<SectionData>(EMPTY);
  const [loaded, setLoaded] = useState<Record<SectionKey, boolean>>({ products: false, services: false, requests: false });
  const [offline, setOffline] = useState(false);
  const savedAt = useRef<Partial<Record<SectionKey, number>>>({});
  const activeRef = useRef(true);
  const loadingRef = useRef(false);

  const refreshStale = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      let state: Awaited<ReturnType<typeof NetInfo.fetch>> | null = null;
      try { state = await NetInfo.fetch(); } catch { /* Unknown connectivity: try best-effort requests. */ }
      if (!activeRef.current) return;
      if (state?.isConnected === false) { setOffline(true); return; }
      setOffline(false);
      const now = Date.now();
      const tasks: Promise<void>[] = [];
      if (!savedAt.current.products || now - savedAt.current.products >= PUBLIC_LIST_TTL_MS) {
        tasks.push(fetchProducts({ page: 1, limit: 8, sortBy: 'createdAt', sortOrder: 'desc' }).then(async (result) => {
          const items = result.items.slice(0, 4).map(publicProductSnapshot);
          await writePublicCache(CACHE_KEYS.products, items);
          if (activeRef.current) { savedAt.current.products = Date.now(); setData((current) => ({ ...current, products: items })); setLoaded((current) => ({ ...current, products: true })); }
        }).catch(() => { if (activeRef.current) setLoaded((current) => ({ ...current, products: true })); }));
      }
      if (!savedAt.current.services || now - savedAt.current.services >= PUBLIC_LIST_TTL_MS) {
        tasks.push(fetchServiceListings({ page: 1, limit: 8 }).then(async (items) => {
          const limited = items.slice(0, 4).map(publicServiceSnapshot);
          await writePublicCache(CACHE_KEYS.services, limited);
          if (activeRef.current) { savedAt.current.services = Date.now(); setData((current) => ({ ...current, services: limited })); setLoaded((current) => ({ ...current, services: true })); }
        }).catch(() => { if (activeRef.current) setLoaded((current) => ({ ...current, services: true })); }));
      }
      if (!savedAt.current.requests || now - savedAt.current.requests >= PUBLIC_LIST_TTL_MS) {
        tasks.push(fetchOpenRequests({ page: 1, limit: 8, sort: "newest" }).then(async (result) => {
          const items = result.items.slice(0, 4).map(publicRequestSnapshot);
          await writePublicCache(CACHE_KEYS.requests, items);
          if (activeRef.current) { savedAt.current.requests = Date.now(); setData((current) => ({ ...current, requests: items })); setLoaded((current) => ({ ...current, requests: true })); }
        }).catch(() => { if (activeRef.current) setLoaded((current) => ({ ...current, requests: true })); }));
      }
      await Promise.all(tasks);
    } finally { loadingRef.current = false; }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    let previousOnline: boolean | null = null;
    void (async () => {
      const keys: SectionKey[] = ['products', 'services', 'requests'];
      await Promise.all(keys.map(async (key) => {
        const cached = await readPublicCacheEntry<SectionData[typeof key]>(CACHE_KEYS[key]);
        if (!activeRef.current) return;
        if (cached && Array.isArray(cached.value)) {
          savedAt.current[key] = cached.savedAt;
          setData((current) => ({ ...current, [key]: cached.value.slice(0, 4) }));
          setLoaded((current) => ({ ...current, [key]: true }));
        }
      }));
      await refreshStale();
    })();
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      const wasOnline = previousOnline;
      previousOnline = online;
      // Reconnect only checks stale public snapshots; it never forces fresh queries.
      if (wasOnline === false && online) void refreshStale();
    });
    return () => { activeRef.current = false; unsubscribe(); };
  }, [refreshStale]);

  const hasProducts = data.products.length > 0;
  const hasServices = data.services.length > 0;
  const hasRequests = data.requests.length > 0;
  return <View style={{ gap: spacing.xl }}>
    <View style={{ gap: spacing.sm }}>
      <MarketplaceSectionHeader title="منتجات مميزة" subtitle="منتجات من متاجر السوق المحلية" onAll={() => router.push('/products')} />
      {hasProducts ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', gap: spacing.sm, paddingVertical: 2 }}>{data.products.map((item) => <MiniCard key={item.id} title={item.name} subtitle={item.store?.name || item.category?.nameAr || item.category?.name || 'منتج محلي'} image={firstImage(item.images)} price={money(item.effectivePrice?.price ?? item.discountPrice ?? item.price)} glyph="▦" onPress={() => router.push({ pathname: '/products/[id]', params: { id: item.id } })} />)}</ScrollView> : loaded.products ? <EmptySection label="المنتجات" offline={offline} /> : <EmptySection label="المنتجات" offline />}
    </View>
    <View style={{ gap: spacing.sm }}>
      <MarketplaceSectionHeader title="خدمات متاحة" subtitle="مهن وخبرات يمكنك طلبها" onAll={() => router.push('/services')} />
      {hasServices ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', gap: spacing.sm, paddingVertical: 2 }}>{data.services.map((item) => <MiniCard key={item.id} title={item.title} subtitle={item.provider?.businessName || item.provider?.sellerProfile?.displayName || item.category?.nameAr || item.category?.name || 'مقدم خدمة'} image={firstImage(item.images)} price={money(item.price)} glyph="✦" onPress={() => router.push({ pathname: '/services/[id]', params: { id: item.id } })} />)}</ScrollView> : loaded.services ? <EmptySection label="الخدمات" offline={offline} /> : <EmptySection label="الخدمات" offline />}
    </View>
    <View style={{ gap: spacing.sm }}>
      <MarketplaceSectionHeader title="طلبات السوق" subtitle="طلبات أشخاص يبحثون عن منتج أو خدمة" onAll={() => router.push('/requests')} />
      {hasRequests ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', gap: spacing.sm, paddingVertical: 2 }}>{data.requests.map((item) => <MiniCard key={item.id} title={item.title} subtitle={[item.city, item.type === 'SERVICE' ? 'طلب خدمة' : item.type === 'PRODUCT' ? 'طلب منتج' : 'طلب استئجار'].filter(Boolean).join(' · ')} price={item.budgetMax ? `حتى ${money(item.budgetMax)}` : item.budgetMin ? `من ${money(item.budgetMin)}` : null} glyph="▤" onPress={() => router.push({ pathname: '/requests/[id]', params: { id: item.id } })} />)}</ScrollView> : loaded.requests ? <EmptySection label="طلبات السوق" offline={offline} /> : <EmptySection label="طلبات السوق" offline />}
    </View>
    {user ? <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm }}>
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '900', textAlign: 'right' }}>تابع طلباتك ومشترياتك</Text>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'right' }}>وصل سريع للطلبات التي أنشأتها، وطلبات الشراء ومتابعة حالتها دون استعلامات إضافية من الرئيسية.</Text>
      <View style={{ flexDirection: 'row-reverse', gap: spacing.sm }}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/orders')} style={{ flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>طلباتي ومشترياتي</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/my-requests')} style={{ flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontSize: 12, fontWeight: '800' }}>طلبات السوق التي أنشأتها</Text></Pressable>
      </View>
    </View> : <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.xs }}>
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '900', textAlign: 'right' }}>ابدأ بإدارة طلباتك</Text>
      <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '800', textAlign: 'right' }}>سجّل الدخول لمتابعة مشترياتك وطلباتك ←</Text>
    </Pressable>}
  </View>;
}
