import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { SaveOfflineButton } from '@/components/ui/SaveOfflineButton';
import { ShareButton } from '@/components/ui/ShareButton';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Linking, StyleSheet, TextInput, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
import { formatDate, formatMoney } from '@/lib/formatters';
import { ErrorState, LoadingState, Notice, PageShell, Spinner } from '@/components/ui';
import { createStoreReview, fetchProducts, fetchStore, fetchStoreFollowStatus, fetchStoreReviews, toggleStoreFollow, type ProductSummary, type StoreReview, type StoreSummary } from '@/features/commerce/commerce.api';
import { ApiError } from '@/api/client';
import { deletePublicCacheEntry, deletePublicCacheEntriesByPrefix } from '@/storage/public-cache';
import { fetchPublicAds, type AdListItem } from '@/features/ads/ads.api';
import { fetchPublicCollections, type StoreCollection } from '@/features/commerce/store-management.api';
import { telUrl, whatsappUrl } from '@/lib/contact-links';
import { startConversationWithUser } from '@/features/messaging/messaging.api';
import { getProductPricing } from '@/features/commerce/product-pricing';
import { showToast } from '@/lib/toast';
import { COPY } from '@/lib/copy';
type Tab = 'products' | 'offers' | 'collections' | 'ads' | 'reviews' | 'about';
const STORE_DAYS: { key: string; label: string }[] = [{ key: 'sat', label: 'السبت' }, { key: 'sun', label: 'الأحد' }, { key: 'mon', label: 'الاثنين' }, { key: 'tue', label: 'الثلاثاء' }, { key: 'wed', label: 'الأربعاء' }, { key: 'thu', label: 'الخميس' }, { key: 'fri', label: 'الجمعة' }];
function safePhone(value?: string | null): string {
  const raw = (value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  const normalized = `${raw.startsWith('+') ? '+' : ''}${digits}`;
  return /^\+?\d{7,15}$/.test(normalized) ? normalized : '';
}
function paymentLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const value = entry as Record<string, unknown>;
    const label = typeof value.label === 'string' ? value.label.trim() : typeof value.kind === 'string' ? ({ jawwal: 'جوال بي', palpay: 'بال بي', bank: 'بنك فلسطين', custom: 'طريقة دفع أخرى' } as Record<string, string>)[value.kind] : '';
    return label ? [label] : [];
  }).filter((label, index, list) => list.indexOf(label) === index);
}
function price(value: number | string | null | undefined) {
  return value == null || value === '' ? 'السعر عند التواصل' : formatMoney(value);
}
function dateLabel(value?: string) {
  return value ? formatDate(value, 'date') : '';
}
export default function StoreDetailScreen() {
  const { colors } = useAppTheme();
  const s = useMemo(() => createThemeS(colors), [colors]);
  const params = useLocalSearchParams<{
    id: string | string[];
  }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, getAccessToken, csrfToken, isRestoring } = useAuth();
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [promotedProducts, setPromotedProducts] = useState<ProductSummary[]>([]);
  const [storeAds, setStoreAds] = useState<AdListItem[]>([]);
  const [collections, setCollections] = useState<StoreCollection[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('products');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPages, setReviewPages] = useState(1);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewSent, setReviewSent] = useState(false);
  const sequence = useRef(0);
  const reviewsSequence = useRef(0);
  const reviewsAutoLoadRef = useRef(false);
  const loadedTabsRef = useRef(new Set<Tab>());
  const tabSequence = useRef(0);
  const hasLoadedRef = useRef(false);
  const load = useCallback(async (refresh = false) => {
    if (!id || isRestoring)
      return;
    const token = getAccessToken();
    const current = ++sequence.current;
    if (refresh)
      setRefreshing(true);
    else if (!hasLoadedRef.current)
      setLoading(true);
    setError(null);
    setProductsError(null);
    if (!refresh) {
      setStore(null);
      setProducts([]);
      setReviews([]);
      setPromotedProducts([]);
      setStoreAds([]);
      setCollections([]);
    }
    try {
      const settled = await Promise.allSettled([fetchStore(id), fetchProducts({
          page: 1, limit: 12, storeId: id
        })]);
      if (current !== sequence.current)
        return;
      const [storeR, productsR] = settled;
      if (storeR.status === 'rejected')
        throw storeR.reason;
      setStore(storeR.value);
      if (productsR.status === 'fulfilled')
        setProducts(productsR.value.items);
      else {
        setProducts([]);
        setProductsError(productsR.reason instanceof Error ? productsR.reason.message : 'تعذر تحميل منتجات المتجر.');
      }
      if (token && user?.id) {
        try {
          const status = await fetchStoreFollowStatus(id, token);
          if (current === sequence.current)
            setFollowing(status.following);
        }
        catch {
          if (current === sequence.current)
            setFollowing(null);
        }
      }
      else
        setFollowing(null);
    }
    catch (e) {
      if (current === sequence.current) {
        if (e instanceof ApiError && e.code === 'PUBLIC_ACCOUNT_BLOCKED') {
          setStore(null);
          setProducts([]);
          setReviews([]);
          setPromotedProducts([]);
          setStoreAds([]);
          setCollections([]);
          setError('هذا الحساب محظور، وتم إخفاء المتجر وجميع محتوياته.');
          await Promise.all([
            deletePublicCacheEntry(`api-public:/api/v1/stores/${encodeURIComponent(id)}`),
            deletePublicCacheEntriesByPrefix('api-public:/api/v1/stores?'),
          ]);
        } else setError(e instanceof Error ? e.message : 'تعذر تحميل المتجر.');
      }
    }
    finally {
      if (current === sequence.current) {
        hasLoadedRef.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [id, getAccessToken, isRestoring, user?.id]);
  const loadReviews = useCallback(async (page = 1, append = false) => {
    if (!id)
      return;
    const current = ++reviewsSequence.current;
    setReviewsLoading(true);
    try {
      const result = await fetchStoreReviews(id, {
        page, limit: 10
      });
      if (current !== reviewsSequence.current)
        return;
      setReviews(current2 => append ? [...current2, ...result.items.filter(item => !current2.some(old => old.id === item.id))] : result.items);
      setReviewPage(result.page);
      setReviewPages(result.totalPages);
    }
    catch (e) {
      if (current === reviewsSequence.current)
        showToast('تعذر تحميل التقييمات', e instanceof Error ? e.message : COPY.tryAgain, 'error');
    }
    finally {
      if (current === reviewsSequence.current)
        setReviewsLoading(false);
    }
  }, [id]);
  const loadTab = useCallback(async (target: Tab, force = false) => {
    if (!id || !['offers', 'collections', 'ads'].includes(target) || (!force && loadedTabsRef.current.has(target))) return;
    const current = ++tabSequence.current;
    setTabLoading(true); setTabError(null);
    try {
      if (target === 'offers') {
        const result = await fetchProducts({ page: 1, limit: 12, storeId: id, hasPromotion: true });
        if (current === tabSequence.current) setPromotedProducts(result.items);
      } else if (target === 'collections') {
        const result = await fetchPublicCollections(id);
        if (current === tabSequence.current) setCollections(result);
      } else if (target === 'ads') {
        const result = await fetchPublicAds({ page: 1, limit: 12, storeId: id });
        if (current === tabSequence.current) setStoreAds(result.items);
      }
      if (current === tabSequence.current) loadedTabsRef.current.add(target);
    } catch (e) {
      if (current === tabSequence.current) setTabError(e instanceof Error ? e.message : 'تعذر تحميل محتوى المتجر.');
    } finally {
      if (current === tabSequence.current) setTabLoading(false);
    }
  }, [id]);
  const openExternal = useCallback(async (url: string) => {
    try { await Linking.openURL(url); }
    catch { showToast('تعذر فتح الرابط', 'تحقق من وجود تطبيق مناسب وحاول مرة أخرى.', 'error'); }
  }, []);
  const messageStore = useCallback(async () => {
    const token = getAccessToken();
    const targetUserId = store?.sellerProfile?.userId;
    if (!token) { router.push('/login'); return; }
    if (!targetUserId) { showToast('المراسلة غير متاحة', 'تعذر تحديد حساب صاحب المتجر.', 'warning'); return; }
    try {
      const conversation = await startConversationWithUser(targetUserId, token, undefined, csrfToken);
      router.push({ pathname: '/messages/[id]', params: { id: conversation.id } });
    } catch (e) { showToast('تعذر بدء المحادثة', e instanceof Error ? e.message : COPY.tryAgain, 'error'); }
  }, [getAccessToken, store?.sellerProfile?.userId, csrfToken]);

  useEffect(() => {
    setStore(null);
    setProducts([]);
    setReviews([]);
    setPromotedProducts([]);
    setStoreAds([]);
    setCollections([]);
    setFollowing(null);
    setTab('products');
    setTabError(null);
    setProductsError(null);
    setReviewPage(1);
    setReviewPages(1);
    hasLoadedRef.current = false;
    loadedTabsRef.current.clear();
    tabSequence.current += 1;
    reviewsSequence.current += 1;
  }, [id]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
      reviewsSequence.current += 1;
    };
  }, [load]);
  useEffect(() => {
    reviewsAutoLoadRef.current = false;
  }, [id]);
  useEffect(() => {
    if (tab !== 'reviews' || reviewsAutoLoadRef.current)
      return;
    reviewsAutoLoadRef.current = true;
    void loadReviews(1);
  }, [tab, loadReviews]);
  useEffect(() => {
    if (tab === 'offers' || tab === 'collections' || tab === 'ads') void loadTab(tab);
  }, [tab, loadTab]);
  useEffect(() => () => { tabSequence.current += 1; }, []);
  const isOwnStore = !!(user?.id && store?.sellerProfile?.userId === user.id);
  const onFollow = async () => {
    const token = getAccessToken();
    if (!token) {
      router.push('/login');
      return;
    }
    if (!id || followLoading || following === null)
      return;
    const old = following;
    setFollowing(!old);
    setFollowLoading(true);
    try {
      const result = await toggleStoreFollow(id, token, csrfToken);
      setFollowing(result.action === 'followed');
    }
    catch (e) {
      setFollowing(old);
      showToast('تعذر تحديث المتابعة', e instanceof Error ? e.message : COPY.tryAgain, 'error');
    }
    finally {
      setFollowLoading(false);
    }
  };
  const submitReview = async () => {
    const token = getAccessToken();
    if (!token) {
      router.push('/login');
      return;
    }
    if (!id || reviewSaving)
      return;
    setReviewSaving(true);
    try {
      await createStoreReview(id, {
        score, comment: comment.trim() || undefined
      }, token, csrfToken);
      setReviewSent(true);
      setComment('');
      await loadReviews(1);
      showToast('شكرًا لك', 'تم إرسال تقييمك للمتجر.', 'success');
    }
    catch (e) {
      showToast('تعذر إرسال التقييم', e instanceof Error ? e.message : 'قد تكون قيّمت هذا المتجر من قبل.', 'error');
    }
    finally {
      setReviewSaving(false);
    }
  };
  return <PageShell title="صفحة المتجر" right={<Pressable accessibilityRole="button" onPress={() => router.push('/stores')} style={s.smallButton}><Text style={s.smallButtonText}>كل المتاجر</Text></Pressable>} refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={() => void load(true)}/>}>
  <View style={s.content}>
  {loading ? <LoadingState message="جاري تحميل المتجر…"/> : error ? <ErrorState title={error.startsWith('هذا الحساب محظور') ? 'هذا الحساب محظور' : 'تعذر تحميل المتجر'} description={error} onAction={() => void load()}/> : store ? <>
   <View style={s.hero}>{store.coverImageUrl ? <AppImage uri={store.coverImageUrl} style={s.cover} resizeMode="cover"/> : <View style={[s.cover, s.coverFallback]}><Text style={s.coverMark}>MARKETPLAT</Text></View>}
    <View style={s.storeCard}>{store.logoUrl ? <AppImage uri={store.logoUrl} style={s.logo}/> : <View style={s.logoPlaceholder}><Text style={s.glyph}>▣</Text></View>}<View style={s.storeTitleRow}><Text style={[s.heading, s.storeTitle]}>{store.name}</Text><FavoriteButton entityType="stores" entityId={store.id} label="المتجر" /></View><Text style={s.muted}>{store.description || 'متجر محلي على MarketPlat'}</Text><Text style={s.location}>{[store.city, store.address].filter(Boolean).join(' · ') || 'الموقع غير محدد'}</Text>{store.phone ? <Text style={s.muted}>للتواصل: {store.phone}</Text> : null}
     {!!safePhone(store.phone) ? <View style={s.contactActions}>
       <Pressable accessibilityRole="button" onPress={() => void openExternal(telUrl(safePhone(store.phone)))} style={s.contactButton}><Text style={s.contactButtonText}>اتصال</Text></Pressable>
       {!isOwnStore ? <Pressable accessibilityRole="button" onPress={() => void openExternal(whatsappUrl(safePhone(store.phone)))} style={s.contactButton}><Text style={s.contactButtonText}>واتساب</Text></Pressable> : null}
       {!isOwnStore && store.sellerProfile?.userId ? <Pressable accessibilityRole="button" onPress={() => void messageStore()} style={s.contactButton}><Text style={s.contactButtonText}>مراسلة</Text></Pressable> : null}
     </View> : null}
     <View style={s.stats}><View style={s.stat}><Text style={s.statValue}>{store._count?.products ?? products.length}</Text><Text style={s.statLabel}>منتج</Text></View><View style={s.stat}><Text style={s.statValue}>{store._count?.followers ?? 0}</Text><Text style={s.statLabel}>متابع</Text></View><View style={s.stat}><Text style={s.statValue}>{typeof store.views === 'number' ? store.views : '—'}</Text><Text style={s.statLabel}>زيارة</Text></View><View style={s.stat}><Text style={s.statValue}>{store.sellerProfile?.averageRating == null ? '—' : Number(store.sellerProfile.averageRating).toFixed(1)}</Text><Text style={s.statLabel}>التقييم</Text></View><View style={s.stat}><Text style={s.statValue}>{store.sellerProfile?.totalRatings ?? 0}</Text><Text style={s.statLabel}>مقيّم</Text></View></View>
     <ShareButton resource="stores" id={store.id} title={store.name}/><SaveOfflineButton id={store.id} kind="store" title={store.name} payload={{ id: store.id, title: store.name, description: store.description ?? '', city: store.city ?? null, images: [store.logoUrl, store.coverImageUrl].filter((u): u is string => typeof u === 'string' && u.length > 0) }} />{!isOwnStore ? <Pressable accessibilityRole="button" disabled={followLoading || following === null} onPress={() => void onFollow()} style={[s.primary, s.followButton, (followLoading || following === null) && s.disabled]}><Text style={s.primaryText}>{followLoading ? 'جاري التحديث…' : following === null ? 'حالة المتابعة غير متاحة' : following ? '✓ تتابع هذا المتجر' : '＋ متابعة المتجر'}</Text></Pressable> : <Pressable accessibilityRole="button" onPress={() => router.push('/my-store')} style={s.secondary}><Text style={s.secondaryText}>إدارة متجري</Text></Pressable>}
    </View>
   </View>
   {store.slug ? <Pressable accessibilityRole="button" onPress={() => router.push({
      pathname: '/store/[slug]/stats', params: { slug: store.slug! }
    })} style={s.secondary}><Text style={s.secondaryText}>إحصاءات المبيعات العامة</Text></Pressable> : null}
{!isOwnStore ? <Pressable accessibilityRole="button" onPress={() => router.push({
      pathname: '/report/[targetType]/[targetId]', params: {
        targetType: 'stores', targetId: id
      }
    })} style={s.secondary}><Text style={s.secondaryText}>الإبلاغ عن المتجر</Text></Pressable> : null}<View style={s.tabs}>{([{ key: 'products', label: 'المنتجات' }, { key: 'offers', label: 'العروض' }, { key: 'collections', label: 'المجموعات' }, { key: 'ads', label: 'الإعلانات' }, { key: 'reviews', label: 'التقييمات' }, { key: 'about', label: 'عن المتجر' }] as const).map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.key }} onPress={() => setTab(item.key)} style={[s.tab, tab === item.key && s.activeTab]}><Text style={[s.tabText, tab === item.key && s.activeTabText]}>{item.label}</Text></Pressable>)}</View>
   {tab === 'products' ? <><View style={s.section}><Text style={s.sectionTitle}>منتجات المتجر</Text><Text style={s.muted}>عرض {products.length} من أصل {store._count?.products ?? products.length} منتج</Text></View>{productsError ? <Notice>{productsError}</Notice> : products.length === 0 ? <View style={s.state}><Text style={s.muted}>لا توجد منتجات منشورة لهذا المتجر حاليًا.</Text></View> : products.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/products/${encodeURIComponent(item.id)}`)} style={s.productCard}>{item.images?.[0] ? <AppImage variant="list" uri={item.images[0]} style={s.productImage}/> : <View style={s.productPlaceholder}><Text style={s.glyph}>◇</Text></View>}<View style={s.productBody}><Text style={s.productTitle} numberOfLines={2}>{item.name}</Text><Text style={s.price}>{price(getProductPricing(item).currentPrice)}</Text>{getProductPricing(item).hasDiscount ? <Text style={s.oldPrice}>{price(getProductPricing(item).originalPrice)}</Text> : null}<Text style={s.muted}>{item.availability === 'OUT_OF_STOCK' ? 'غير متوفر' : item.availability === 'LIMITED' ? 'كمية محدودة' : 'متوفر'}</Text></View><AppIcon name="forward" size={18} color={colors.muted}/></Pressable>)}<Pressable accessibilityRole="button" onPress={() => router.push({
      pathname: '/products', params: { storeId: id }
    })} style={s.secondary}><Text style={s.secondaryText}>تصفح جميع منتجات هذا المتجر</Text></Pressable></> : null}
   {tab === 'about' ? <View style={s.aboutCard}>
     <Text style={s.sectionTitle}>نبذة عن المتجر</Text><Text style={s.aboutText}>{store.description || 'لم يضف المتجر نبذة تعريفية بعد.'}</Text>
     <View style={s.aboutRow}><Text style={s.aboutLabel}>المدينة</Text><Text style={s.aboutValue}>{store.city || 'غير محددة'}</Text></View>
     <View style={s.aboutRow}><Text style={s.aboutLabel}>العنوان</Text><Text style={s.aboutValue}>{store.address || 'غير محدد'}</Text></View>
     <View style={s.aboutRow}><Text style={s.aboutLabel}>رقم التواصل</Text><Text style={s.aboutValue}>{store.phone || 'غير متاح'}</Text></View>
     <View style={s.aboutRow}><Text style={s.aboutLabel}>حالة المتجر</Text><Text style={s.aboutValue}>{store.isOpen === true ? 'مفتوح الآن' : store.isOpen === false ? 'مغلق الآن' : 'ساعات العمل غير محددة'}</Text></View>
     {store.latitude != null && String(store.latitude).trim() !== '' && store.longitude != null && String(store.longitude).trim() !== '' && Number.isFinite(Number(store.latitude)) && Number.isFinite(Number(store.longitude)) && Math.abs(Number(store.latitude)) <= 90 && Math.abs(Number(store.longitude)) <= 180 ? <Pressable accessibilityRole="link" onPress={() => void openExternal(`https://www.openstreetmap.org/?mlat=${Number(store.latitude)}&mlon=${Number(store.longitude)}#map=16/${Number(store.latitude)}/${Number(store.longitude)}`)} style={s.secondary}><Text style={s.secondaryText}>فتح موقع المتجر على الخريطة</Text></Pressable> : null}
     {store.workingHours ? <View style={s.hoursSection}><Text style={s.sectionTitle}>ساعات العمل الأسبوعية</Text>{STORE_DAYS.map(day => { const schedule = store.workingHours?.[day.key]; return <View key={day.key} style={s.aboutRow}><Text style={s.aboutLabel}>{day.label}</Text><Text style={s.aboutValue}>{schedule ? `${schedule.open} – ${schedule.close}` : 'مغلق'}</Text></View>; })}</View> : null}
     {paymentLabels(store.sellerProfile?.paymentMethods).length ? <View style={s.hoursSection}><Text style={s.sectionTitle}>وسائل الدفع المتاحة</Text><View style={s.paymentChips}>{paymentLabels(store.sellerProfile?.paymentMethods).map(label => <View key={label} style={s.paymentChip}><Text style={s.paymentChipText}>{label}</Text></View>)}</View></View> : null}
   </View> : null}
   {tab === 'offers' ? <>
     <View style={s.section}><Text style={s.sectionTitle}>عروض المتجر</Text><Text style={s.muted}>{promotedProducts.length} عرضًا معروضًا</Text></View>
     {tabLoading ? <Spinner color={colors.brand}/> : tabError ? <Notice>{tabError}</Notice> : promotedProducts.length === 0 ? <View style={s.state}><Text style={s.muted}>لا توجد عروض ترويجية نشطة حاليًا.</Text></View> : promotedProducts.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/products/${encodeURIComponent(item.id)}`)} style={s.productCard}>{item.images?.[0] ? <AppImage variant="list" uri={item.images[0]} style={s.productImage}/> : <View style={s.productPlaceholder}><Text style={s.glyph}>◇</Text></View>}<View style={s.productBody}><Text style={s.productTitle} numberOfLines={2}>{item.name}</Text><Text style={s.price}>{price(getProductPricing(item).currentPrice)}</Text>{getProductPricing(item).hasDiscount ? <Text style={s.oldPrice}>{price(getProductPricing(item).originalPrice)}</Text> : null}<Text style={s.muted}>عرض ترويجي</Text></View></Pressable>)}
     {tabError ? <Pressable accessibilityRole="button" onPress={() => void loadTab('offers', true)} style={s.secondary}><Text style={s.secondaryText}>إعادة المحاولة</Text></Pressable> : null}
   </> : null}
   {tab === 'collections' ? <>
     <View style={s.section}><Text style={s.sectionTitle}>مجموعات المنتجات</Text><Text style={s.muted}>{collections.length} مجموعة</Text></View>
     {tabLoading ? <Spinner color={colors.brand}/> : tabError ? <Notice>{tabError}</Notice> : collections.length === 0 ? <View style={s.state}><Text style={s.muted}>لم ينشر المتجر مجموعات منتجات بعد.</Text></View> : collections.map(collection => <Pressable key={collection.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/collections/[id]', params: { id: collection.id } })} style={s.productCard}>{collection.imageUrl ? <AppImage uri={collection.imageUrl} style={s.productImage}/> : <View style={s.productPlaceholder}><Text style={s.glyph}>▤</Text></View>}<View style={s.productBody}><Text style={s.productTitle}>{collection.name}</Text><Text style={s.muted}>{collection.description || 'مجموعة منتجات'} · {collection._count?.products ?? 0} منتج</Text></View></Pressable>)}
     {tabError ? <Pressable accessibilityRole="button" onPress={() => void loadTab('collections', true)} style={s.secondary}><Text style={s.secondaryText}>إعادة المحاولة</Text></Pressable> : null}
   </> : null}
   {tab === 'ads' ? <>
     <View style={s.section}><Text style={s.sectionTitle}>إعلانات المتجر</Text><Text style={s.muted}>{storeAds.length} إعلانًا معروضًا</Text></View>
     {tabLoading ? <Spinner color={colors.brand}/> : tabError ? <Notice>{tabError}</Notice> : storeAds.length === 0 ? <View style={s.state}><Text style={s.muted}>لا توجد إعلانات منشورة لهذا المتجر حاليًا.</Text></View> : storeAds.map(ad => <Pressable key={ad.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/ads/[id]', params: { id: ad.id } })} style={s.productCard}>{ad.images?.[0] ? <AppImage variant="list" uri={ad.images[0]} style={s.productImage}/> : <View style={s.productPlaceholder}><Text style={s.glyph}>◇</Text></View>}<View style={s.productBody}><Text style={s.productTitle} numberOfLines={2}>{ad.title}</Text><Text style={s.price}>{price(ad.price)}</Text><Text style={s.muted}>{ad.city || ''}</Text></View></Pressable>)}
     {tabError ? <Pressable accessibilityRole="button" onPress={() => void loadTab('ads', true)} style={s.secondary}><Text style={s.secondaryText}>إعادة المحاولة</Text></Pressable> : null}
   </> : null}
   {tab === 'reviews' ? <><View style={s.section}><Text style={s.sectionTitle}>تقييمات المشترين</Text><Text style={s.muted}>{reviews.length} تقييم معروض</Text></View>{reviews.length === 0 && !reviewsLoading ? <View style={s.state}><Text style={s.muted}>لا توجد تقييمات لهذا المتجر حتى الآن.</Text></View> : reviews.map(review => <View key={review.id} style={s.reviewCard}><View style={s.reviewHeader}><Text style={s.reviewName}>{review.rater?.name || 'مستخدم'}</Text><Text style={s.reviewScore}>{'★'.repeat(Math.max(0, Math.min(5, review.score)))}{'☆'.repeat(5 - Math.max(0, Math.min(5, review.score)))}</Text></View>{review.comment ? <Text style={s.aboutText}>{review.comment}</Text> : <Text style={s.muted}>لم يضف تعليقًا.</Text>}<Text style={s.date}>{dateLabel(review.createdAt)}</Text></View>)}{reviewsLoading ? <Spinner color={colors.brand}/> : reviewPage < reviewPages ? <Pressable accessibilityRole="button" onPress={() => void loadReviews(reviewPage + 1, true)} style={s.secondary}><Text style={s.secondaryText}>تحميل تقييمات إضافية</Text></Pressable> : null}
    {!isOwnStore && !reviewSent ? <View style={s.reviewForm}><Text style={s.sectionTitle}>أضف تقييمك</Text><Text style={s.muted}>اختر تقييمًا من نجمة إلى خمس نجوم.</Text><View style={s.ratingChoices}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityRole="button" accessibilityLabel={`التقييم ${n} من 5 نجوم`} accessibilityState={{ selected: score === n }} onPress={() => setScore(n)} style={{
        minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center'
      }}><Text style={[s.ratingStar, n <= score && s.ratingSelected]}>★</Text></Pressable>)}</View><TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="تعليق على المتجر" value={comment} onChangeText={setComment} maxLength={500} multiline placeholder="اكتب تعليقك (اختياري)…" placeholderTextColor={colors.muted} style={s.commentInput} textAlign="right"/><Text style={s.muted}>{comment.length}/500</Text><Pressable accessibilityRole="button" disabled={reviewSaving} onPress={() => void submitReview()} style={[s.primary, reviewSaving && s.disabled]}><Text style={s.primaryText}>{reviewSaving ? 'جاري الإرسال…' : 'إرسال التقييم'}</Text></Pressable></View> : null}
   </> : null}
  </> : null}
 </View></PageShell>;
}
const createThemeS = (colors: ColorPalette) => StyleSheet.create({
  content: {
    gap: spacing.md
  }, smallButton: {
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm
  }, smallButtonText: {
    fontSize: fontSizes[12], fontWeight: fontWeights.semibold, color: colors.brand
  }, hero: { gap: 0 }, cover: {
    width: '100%', height: 184, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.border
  }, coverFallback: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft
  }, coverMark: {
    fontWeight: fontWeights.bold, letterSpacing: 3, color: colors.brand, opacity: .65
  }, storeCard: {
    alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, padding: spacing.lg, shadowColor: colors.ink, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: {
      width: 0, height: 4
    }, elevation: 1
  }, logo: {
    width: 82, height: 82, borderRadius: radius.hero, backgroundColor: colors.border
  }, logoPlaceholder: {
    width: 82, height: 82, borderRadius: radius.hero, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center'
  }, glyph: {
    fontSize: fontSizes[28], color: colors.brand
  }, storeTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, alignSelf: 'stretch' }, storeTitle: { flex: 1 }, heading: {
    fontSize: fontSizes[20], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'center'
  }, muted: {
    fontSize: fontSizes[13], color: colors.muted, textAlign: 'right', lineHeight: 20
  }, location: {
    fontSize: fontSizes[13], color: colors.brand, fontWeight: fontWeights.bold, textAlign: 'center'
  }, stats: {
    flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-around', marginTop: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border
  }, stat: {
    alignItems: 'center', gap: spacing.xs
  }, statValue: {
    fontSize: fontSizes[17], fontWeight: fontWeights.bold, color: colors.ink
  }, statLabel: {
    fontSize: fontSizes[11], color: colors.muted
  }, primary: {
    backgroundColor: colors.brand, padding: spacing.md, borderRadius: radius.md, alignItems: 'center'
  }, primaryText: {
    color: colors.onBrand, fontWeight: fontWeights.semibold
  }, followButton: {
    alignSelf: 'stretch', marginTop: spacing.sm
  }, secondary: {
    borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md, alignItems: 'center'
  }, secondaryText: {
    color: colors.brand, fontWeight: fontWeights.semibold
  }, disabled: { opacity: .55 }, contactActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.xs }, contactButton: { minHeight: 44, minWidth: 88, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' }, contactButtonText: { color: colors.brand, fontWeight: fontWeights.bold, fontSize: fontSizes[13] }, tabs: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.xs
  }, tab: {
    flexGrow: 1, minWidth: '30%', minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, borderRadius: radius.sm
  }, activeTab: { backgroundColor: colors.brandSoft }, tabText: {
    fontSize: fontSizes[13], fontWeight: fontWeights.bold, color: colors.muted
  }, activeTabText: { color: colors.brand }, section: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  }, sectionTitle: {
    fontSize: fontSizes[17], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right'
  }, productCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: {
      width: 0, height: 3
    }, elevation: 1
  }, productImage: {
    width: 76, height: 80, borderRadius: radius.md, backgroundColor: colors.border
  }, productPlaceholder: {
    width: 76, height: 80, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center'
  }, productBody: {
    flex: 1, alignItems: 'flex-start', gap: spacing.xs
  }, productTitle: {
    fontSize: fontSizes[15], fontWeight: fontWeights.semibold, color: colors.ink, textAlign: 'right'
  }, price: {
    fontSize: fontSizes[14], fontWeight: fontWeights.bold, color: colors.brand
  }, oldPrice: { fontSize: fontSizes[12], color: colors.muted, textDecorationLine: 'line-through' }, state: {
    alignItems: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card
  }, aboutCard: {
    gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card
  }, aboutText: {
    fontSize: fontSizes[14], color: colors.ink, textAlign: 'right', lineHeight: 24
  }, aboutRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm
  }, aboutLabel: {
    fontSize: fontSizes[12], color: colors.muted
  }, aboutValue: {
    flex: 1, fontSize: fontSizes[13], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'left'
  }, hoursSection: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }, paymentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, paymentChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.brandSoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, paymentChipText: { color: colors.brand, fontSize: fontSizes[12], fontWeight: fontWeights.bold }, reviewCard: {
    gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md
  }, reviewHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  }, reviewName: {
    fontSize: fontSizes[14], fontWeight: fontWeights.semibold, color: colors.ink
  }, reviewScore: {
    fontSize: fontSizes[17], color: colors.accent
  }, date: {
    fontSize: fontSizes[11], color: colors.muted, textAlign: 'right'
  }, reviewForm: {
    gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surface
  }, ratingChoices: {
    flexDirection: 'row', justifyContent: 'center', gap: spacing.md
  }, ratingStar: {
    fontSize: fontSizes[32], color: colors.muted
  }, ratingSelected: { color: colors.accent }, commentInput: {
    minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.ink, textAlignVertical: 'top', writingDirection: 'rtl'
  }
});
