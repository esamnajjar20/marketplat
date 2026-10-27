import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { AdListItem, fetchPublicAds, getCachedPublicAdsWithMetadata } from '@/features/ads/ads.api';
import { colors, radius, spacing } from '@/theme/tokens';
import { useAuth } from '@/features/auth/AuthContext';
import { enqueueFavoriteState, readFavoriteAdIds, writeFavoriteAdIds } from '@/features/ads/favorites.store';
import HomeCommunitySections from '@/features/discovery/HomeCommunitySections';
import HomeMarketplaceSections from '@/features/discovery/HomeMarketplaceSections';

function formatPrice(price: AdListItem['price']): string {
  if (price === null || price === undefined || price === '') return 'السعر عند التواصل';
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return String(price);
  return `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(numericPrice)} ₪`;
}

export default function HomeScreen() {
  const { user, logout, isBusy, isRestoring } = useAuth();
  const [query, setQuery] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [ads, setAds] = useState<AdListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [adsSavedAt, setAdsSavedAt] = useState<number | null>(null);
  const [adsFromCache, setAdsFromCache] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [filters, setFilters] = useState<{ city?: string; minPrice?: number; maxPrice?: number }>({});
  const [filterError, setFilterError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'createdAt' | 'price' | 'views'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<string[]>([]);
  const adsRequestSequence = useRef(0);
  const connectivityRef = useRef<boolean | null>(null);

  // Keep derived lists stable between unrelated UI updates (search typing,
  // favorite taps, and filter-panel toggles) to avoid repeated scans and child renders.
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const visibleAds = useMemo(
    () => (showFavorites ? ads.filter((ad) => favoriteIdSet.has(ad.id)) : ads),
    [ads, showFavorites, favoriteIdSet],
  );

  const loadAds = useCallback(async (isRefresh = false) => {
    const requestSequence = ++adsRequestSequence.current;
    const isCurrentRequest = () => requestSequence === adsRequestSequence.current;
    if (isRefresh) setRefreshing(true);
    setErrorMessage(null);
    setRefreshNotice(null);
    setLoadingMore(false);
    setPage(1);
    setTotalPages(1);
    const options = { page: 1, limit: 8, search: submittedSearch } as {
      page: number; limit: number; search: string;
      city?: string; minPrice?: number; maxPrice?: number;
      sortBy: 'createdAt' | 'price' | 'views'; sortOrder: 'asc' | 'desc';
    };
    Object.assign(options, { city: filters.city, minPrice: filters.minPrice, maxPrice: filters.maxPrice, sortBy, sortOrder });
    let hasCachedData = false;
    let previousSavedAt: number | null = null;
    try {
      const cached = await getCachedPublicAdsWithMetadata(options);
      if (!isCurrentRequest()) return;
      if (cached) {
        hasCachedData = true;
        previousSavedAt = cached.savedAt;
        setAds(cached.result.items);
        setPage(cached.result.page || 1);
        setTotalPages(cached.result.totalPages ?? (cached.result.items.length >= options.limit ? 2 : 1));
        setAdsSavedAt(cached.savedAt);
        setAdsFromCache(true);
        setLoading(false);
      }
    } catch { /* Cache is optional; continue with network. */ }
    if (!hasCachedData && !isRefresh) setLoading(true);
    try {
      // Avoid a guaranteed failing GET when the device already reports no network.
      // Cached results remain visible; an uncached first visit gets a clear offline message.
      const networkState = await NetInfo.fetch();
      if (!isCurrentRequest()) return;
      if (networkState.isConnected === false) {
        if (!hasCachedData) setErrorMessage('أنت غير متصل بالإنترنت ولا توجد نسخة محفوظة من هذه النتائج على الجهاز. اتصل بالإنترنت ثم أعد المحاولة.');
        else setRefreshNotice('أنت غير متصل حاليًا؛ نعرض آخر نسخة محفوظة من الإعلانات.');
        return;
      }
      const result = await fetchPublicAds(options);
      if (!isCurrentRequest()) return;
      setRefreshNotice(null);
      setAds(result.items);
      setPage(result.page || 1);
      setTotalPages(result.totalPages ?? (result.items.length >= options.limit ? (result.page || 1) + 1 : (result.page || 1)));
      const latestCache = await getCachedPublicAdsWithMetadata(options);
      if (!isCurrentRequest()) return;
      if (latestCache) {
        setAdsSavedAt(latestCache.savedAt);
        setAdsFromCache(hasCachedData && latestCache.savedAt === previousSavedAt);
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (hasCachedData) {
        setRefreshNotice('تعذر تحديث الإعلانات الآن؛ ما زلنا نعرض النسخة المحفوظة على الجهاز.');
      } else {
        setErrorMessage(error instanceof ApiError || error instanceof Error
          ? error.message
          : 'تعذر تحميل الإعلانات. حاول مرة أخرى.');
      }
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [submittedSearch, filters, sortBy, sortOrder]);

  const loadMoreAds = useCallback(async () => {
    if (loadingMore || loading || page >= totalPages || showFavorites) return;
    setLoadingMore(true);
    setErrorMessage(null);
    const requestSequence = adsRequestSequence.current;
    const nextPage = page + 1;
    const options = { page: nextPage, limit: 8, search: submittedSearch } as {
      page: number; limit: number; search: string;
      city?: string; minPrice?: number; maxPrice?: number;
      sortBy: 'createdAt' | 'price' | 'views'; sortOrder: 'asc' | 'desc';
    };
    Object.assign(options, { city: filters.city, minPrice: filters.minPrice, maxPrice: filters.maxPrice, sortBy, sortOrder });
    try {
      const result = await fetchPublicAds(options);
      if (requestSequence !== adsRequestSequence.current) return;
      setAds((current) => {
        const seen = new Set(current.map((item) => item.id));
        const additions: AdListItem[] = [];
        for (const item of result.items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          additions.push(item);
        }
        return [...current, ...additions];
      });
      setPage(result.page || nextPage);
      setTotalPages(result.totalPages ?? (result.items.length >= options.limit ? nextPage + 1 : nextPage));
    } catch (error) {
      if (requestSequence === adsRequestSequence.current) {
        setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل المزيد من الإعلانات.');
      }
    } finally {
      if (requestSequence === adsRequestSequence.current) setLoadingMore(false);
    }
  }, [loadingMore, loading, page, totalPages, showFavorites, submittedSearch, filters, sortBy, sortOrder]);

  const applyFilters = useCallback(() => {
    const minText = minPriceInput.trim();
    const maxText = maxPriceInput.trim();
    const min = minText ? Number(minText) : undefined;
    const max = maxText ? Number(maxText) : undefined;
    if ((minText && (!Number.isFinite(min) || min! < 0)) || (maxText && (!Number.isFinite(max) || max! < 0))) {
      setFilterError('أدخل أسعارًا رقمية صحيحة وغير سالبة.');
      return;
    }
    if (min !== undefined && max !== undefined && min > max) {
      setFilterError('الحد الأدنى للسعر لا يمكن أن يتجاوز الحد الأعلى.');
      return;
    }
    setFilterError(null);
    setFilters({ city: cityInput.trim() || undefined, minPrice: min, maxPrice: max });
  }, [cityInput, minPriceInput, maxPriceInput]);

  useEffect(() => { void loadAds(); }, [loadAds]);

  // Re-sync public read-only data after a real offline -> online transition.
  // Keep the previous connectivity value across renders so changing search/filter
  // subscriptions cannot masquerade as a reconnect.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      const previous = connectivityRef.current;
      connectivityRef.current = online;
      if (previous === false && online) {
        void loadAds(true);
      }
    });
    return () => { unsubscribe(); };
  }, [loadAds]);

  useEffect(() => {
    let active = true;
    readFavoriteAdIds(user?.id).then((ids) => { if (active) setFavoriteIds(ids); });
    return () => { active = false; };
  }, [user?.id]);

  const toggleFavorite = useCallback(async (id: string) => {
    const previous = favoriteIds;
    const favorited = !previous.includes(id);
    const next = favorited ? [...previous, id] : previous.filter((item) => item !== id);
    // Render the tap immediately, but persist account intent before treating it as durable.
    setFavoriteIds(next);
    try {
      if (user?.id) {
        const operationId = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await enqueueFavoriteState({ userId: user.id, adId: id, favorited, previousFavorited: previous.includes(id), operationId });
      }
      await writeFavoriteAdIds(next, user?.id);
    } catch (error) {
      // Do not leave an optimistic state on screen when it could not be saved durably.
      const cached = await readFavoriteAdIds(user?.id);
      setFavoriteIds(cached);
      Alert.alert('تعذر حفظ المفضلة', error instanceof Error ? error.message : 'لم يتم حفظ التغيير على الجهاز.');
    }
  }, [favoriteIds, user?.id]);


  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void loadAds(true); }} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logo}><Text style={styles.logoText}>م</Text></View>
            <View>
              <Text style={styles.brandName}>MarketPlat</Text>
              <Text style={styles.brandSubtitle}>سوقك، أقرب وأسهل</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {user ? <Pressable accessibilityRole="button" accessibilityLabel="المحادثات" onPress={() => router.push('/messages')} style={styles.myAdsButton}><Text style={styles.myAdsButtonText}>الرسائل</Text></Pressable> : null}
            {user ? <Pressable accessibilityRole="button" accessibilityLabel="الإشعارات" onPress={() => router.push('/notifications')} style={styles.myAdsButton}><Text style={styles.myAdsButtonText}>الإشعارات</Text></Pressable> : null}
            {user ? <Pressable accessibilityRole="button" accessibilityLabel="إعلاناتي" onPress={() => router.push('/my-ads')} style={styles.myAdsButton}><Text style={styles.myAdsButtonText}>إعلاناتي</Text></Pressable> : null}
            {user ? <Pressable accessibilityRole="button" accessibilityLabel="المفضلة" onPress={() => router.push('/favorites')} style={styles.myAdsButton}><Text style={styles.myAdsButtonText}>♥ المفضلة</Text></Pressable> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={user ? 'تسجيل الخروج' : 'تسجيل الدخول'}
              disabled={isBusy || isRestoring}
              onPress={() => {
                if (user) void logout().catch(() => {});
                else router.push('/login');
              }}
              style={styles.accountButton}
            >
              <Text style={styles.accountButtonText}>{isRestoring ? '…' : user ? 'خروج' : 'دخول'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{user ? `أهلًا ${user.name}` : 'أهلاً بك في سوقك المحلي'}</Text>
          <Text style={styles.heroTitle}>تلاقي اللي بدك إياه</Text>
          <Text style={styles.heroBody}>اكتشف الإعلانات والمتاجر والمنتجات والخدمات من مكان واحد.</Text>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              accessibilityLabel="ابحث عن إعلان أو متجر أو منتج أو خدمة"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => { setSubmittedSearch(query.trim()); }}
              placeholder="منتج، متجر، خدمة أو إعلان..."
              placeholderTextColor="#858D98"
              returnKeyType="search"
              style={styles.searchInput}
              textAlign="right"
            />
            {query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="مسح البحث" onPress={() => { setQuery(''); setSubmittedSearch(''); }}><Text style={styles.clearSearch}>×</Text></Pressable>}
          </View>
        </View>

        <View style={styles.homeShortcuts}>
          {[
            { title: 'الإعلانات', subtitle: 'أحدث ما نُشر', glyph: '◇', tint: '#E7F0FF', color: '#2856A6', path: '/search?type=ads' },
            { title: 'المتاجر', subtitle: 'متاجر محلية', glyph: '▣', tint: '#DFF5EC', color: '#176B50', path: '/stores' },
            { title: 'المنتجات', subtitle: 'تسوّق المنتجات', glyph: '▦', tint: '#F1E8FF', color: '#6841A5', path: '/products' },
            { title: 'الخدمات', subtitle: 'خبرات ومهن', glyph: '✦', tint: '#FFF0D6', color: '#9A5A00', path: '/services' },
            { title: 'طلبات السوق', subtitle: 'ما يبحث عنه الناس', glyph: '▤', tint: '#E7F0FF', color: '#2856A6', path: '/requests' },
            { title: 'القصص', subtitle: 'تحديثات جديدة', glyph: '◉', tint: '#F1E8FF', color: '#6841A5', path: '/stories' },
            { title: 'البائعون', subtitle: 'اكتشف البائعين', glyph: '♙', tint: '#DFF5EC', color: '#176B50', path: '/sellers-ranking' },
            { title: 'كل الأقسام', subtitle: 'تصفّح السوق', glyph: '⊞', tint: '#FBEBD9', color: '#9A5A00', path: '/explore' },
          ].map((item) => (
            <Pressable key={item.title} accessibilityRole="button" onPress={() => router.push(item.path as never)} style={styles.homeShortcut}>
              <View style={[styles.homeShortcutIcon, { backgroundColor: item.tint }]}><Text style={[styles.homeShortcutGlyph, { color: item.color }]}>{item.glyph}</Text></View>
              <Text numberOfLines={1} style={styles.homeShortcutTitle}>{item.title}</Text>
              <Text numberOfLines={1} style={styles.homeShortcutSubtitle}>{item.subtitle}</Text>
            </Pressable>
          ))}
        </View>

        <HomeCommunitySections />

        <HomeMarketplaceSections />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{showFavorites ? 'إعلاناتي المفضلة على هذا الجهاز' : 'أحدث الإعلانات'}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void loadAds(true); }}><Text style={styles.link}>تحديث</Text></Pressable>
        </View>
        <View style={styles.filterRow}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: !showFavorites }} onPress={() => setShowFavorites(false)} style={[styles.filterChip, !showFavorites && styles.filterChipSelected]}><Text style={[styles.filterText, !showFavorites && styles.filterTextSelected]}>كل الإعلانات</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: showFavorites }} onPress={() => setShowFavorites(true)} style={[styles.filterChip, showFavorites && styles.filterChipSelected]}><Text style={[styles.filterText, showFavorites && styles.filterTextSelected]}>♥ المفضلة ({favoriteIds.length})</Text></Pressable>
        </View>

        {!showFavorites ? <View style={styles.filterPanel}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters((value) => !value)} style={styles.filterToggle}>
            <Text style={styles.filterToggleText}>{showFilters ? 'إخفاء التصفية' : 'تصفية وترتيب النتائج'}</Text>
            <Text style={styles.filterToggleGlyph}>{showFilters ? '−' : '＋'}</Text>
          </Pressable>
          {showFilters ? <View style={styles.advancedFilters}>
          <Text style={styles.filterHeading}>تصفية النتائج</Text>
          <TextInput accessibilityLabel="المدينة" value={cityInput} onChangeText={setCityInput} placeholder="المدينة (مثلاً: غزة)" placeholderTextColor="#858D98" textAlign="right" style={styles.filterInput} returnKeyType="done" />
          <View style={styles.priceInputs}>
            <TextInput accessibilityLabel="أقل سعر" value={minPriceInput} onChangeText={setMinPriceInput} keyboardType="decimal-pad" placeholder="أقل سعر" placeholderTextColor="#858D98" textAlign="right" style={[styles.filterInput, styles.priceInput]} />
            <TextInput accessibilityLabel="أعلى سعر" value={maxPriceInput} onChangeText={setMaxPriceInput} keyboardType="decimal-pad" placeholder="أعلى سعر" placeholderTextColor="#858D98" textAlign="right" style={[styles.filterInput, styles.priceInput]} />
          </View>
          {filterError ? <Text style={styles.filterError} accessibilityLiveRegion="polite">{filterError}</Text> : null}
          <View style={styles.sortRow}>
            <Text style={styles.filterCaption}>الترتيب:</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: sortBy === 'createdAt' }} onPress={() => { setSortBy('createdAt'); setSortOrder('desc'); }} style={[styles.filterChip, sortBy === 'createdAt' && styles.filterChipSelected]}><Text style={[styles.filterText, sortBy === 'createdAt' && styles.filterTextSelected]}>الأحدث</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: sortBy === 'price' }} onPress={() => { setSortBy('price'); setSortOrder('asc'); }} style={[styles.filterChip, sortBy === 'price' && styles.filterChipSelected]}><Text style={[styles.filterText, sortBy === 'price' && styles.filterTextSelected]}>الأقل سعرًا</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: sortBy === 'views' }} onPress={() => { setSortBy('views'); setSortOrder('desc'); }} style={[styles.filterChip, sortBy === 'views' && styles.filterChipSelected]}><Text style={[styles.filterText, sortBy === 'views' && styles.filterTextSelected]}>الأكثر مشاهدة</Text></Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={applyFilters} style={styles.applyFiltersButton}><Text style={styles.applyFiltersText}>تطبيق الفلاتر</Text></Pressable>
          </View> : null}
        </View> : null}

        {adsSavedAt !== null && !loading ? (
          <View style={styles.cacheStatus} accessibilityLiveRegion="polite">
            <Text style={styles.cacheStatusText}>
              {adsFromCache ? 'نسخة محفوظة على الجهاز' : 'تمت مزامنة الإعلانات'}
              {' · '}{new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(adsSavedAt))}
            </Text>
          </View>
        ) : null}
        {refreshNotice ? (
          <View style={styles.refreshNotice} accessibilityLiveRegion="polite">
            <Text style={styles.refreshNoticeText}>{refreshNotice}</Text>
          </View>
        ) : null}
        {loading ? (
          <View style={styles.statusCard}><ActivityIndicator size="large" color={colors.brand} /><Text style={styles.statusText}>جاري تحميل الإعلانات…</Text></View>
        ) : errorMessage ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>لم نتمكن من تحميل الإعلانات</Text>
            <Text style={styles.statusText}>{errorMessage}</Text>
            <Pressable accessibilityRole="button" onPress={() => { void loadAds(); }} style={styles.retryButton}><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable>
            <Text style={styles.helperText}>تأكد من إعداد EXPO_PUBLIC_API_URL في apps/mobile/.env وأن الخادم متاح من جهازك.</Text>
          </View>
        ) : visibleAds.length === 0 ? (
          <View style={styles.statusCard}><Text style={styles.statusEmoji}>{showFavorites ? '♡' : '🛍️'}</Text><Text style={styles.statusTitle}>{showFavorites ? 'لا توجد مفضلات ضمن الإعلانات المحمّلة' : 'لا توجد إعلانات مطابقة'}</Text><Text style={styles.statusText}>{showFavorites ? 'المفضلة محفوظة على هذا الجهاز، وقد تحتاج إلى تحميل الإعلانات التي تحتوي عليها.' : 'جرّب كلمة بحث أخرى أو اسحب الشاشة للأسفل للتحديث.'}</Text></View>
        ) : (
          <View style={styles.adsList}>
            {visibleAds.map((ad) => {
              const imageUri = !failedImageIds.includes(ad.id) && Array.isArray(ad.images) ? ad.images.find((url) => typeof url === 'string' && /^(https?:|file:|content:)/i.test(url)) : undefined;
              return (
                <View key={ad.id} style={styles.adCard}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`عرض الإعلان: ${ad.title}`} onPress={() => router.push(`/ads/${encodeURIComponent(ad.id)}`)} style={styles.adMain}>
                    {imageUri ? <Image source={{ uri: imageUri }} onError={() => setFailedImageIds((current) => current.includes(ad.id) ? current : [...current, ad.id])} style={styles.adImage} resizeMode="cover" /> : <View style={styles.adImagePlaceholder}><Text style={styles.placeholderEmoji}>🛍️</Text></View>}
                    <View style={styles.adInfo}>
                      <Text numberOfLines={2} style={styles.adTitle}>{ad.title}</Text>
                      <Text style={styles.adPrice}>{formatPrice(ad.price)}</Text>
                      <Text numberOfLines={1} style={styles.adMeta}>{[ad.city, ad.category?.nameAr || ad.category?.name].filter(Boolean).join(' · ') || 'إعلان محلي'}</Text>
                      {ad.isNegotiable ? <Text style={styles.negotiable}>السعر قابل للتفاوض</Text> : null}
                    </View>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={favoriteIds.includes(ad.id) ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'} accessibilityState={{ selected: favoriteIdSet.has(ad.id) }} onPress={() => toggleFavorite(ad.id)} style={styles.favoriteButton}><Text style={[styles.favoriteText, favoriteIdSet.has(ad.id) && styles.favoriteActive]}>{favoriteIdSet.has(ad.id) ? '♥' : '♡'}</Text></Pressable>
                </View>
              );
            })}
          </View>
        )}
        {!showFavorites && !loading && !errorMessage && ads.length > 0 && page < totalPages ? (
          <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => { void loadMoreAds(); }} style={[styles.loadMoreButton, loadingMore && styles.busyButton]}>
            {loadingMore ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.loadMoreText}>تحميل المزيد من الإعلانات</Text>}
          </Pressable>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 44, gap: spacing.xl },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm, minHeight: 58, gap: spacing.sm },
  brandRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  logo: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#FFFFFF', fontSize: 25, fontWeight: '800' },
  brandName: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  brandSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2, textAlign: 'right' },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  myAdsButton: { borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' },
  myAdsButtonText: { color: colors.brand, fontSize: 12, fontWeight: '800' },
  accountButton: { minHeight: 44, minWidth: 64, paddingHorizontal: spacing.md, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  accountButtonText: { color: colors.brand, fontSize: 13, fontWeight: '800' },
  homeShortcuts: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  homeShortcut: { width: '23.5%', flexGrow: 1, flexBasis: '21%', minWidth: 72, minHeight: 106, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 3, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  homeShortcutIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  homeShortcutGlyph: { fontSize: 22, fontWeight: '800' },
  homeShortcutTitle: { color: colors.ink, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  homeShortcutSubtitle: { color: colors.muted, fontSize: 9, textAlign: 'center' },
  hero: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.xl, overflow: 'hidden', gap: spacing.sm },
  eyebrow: { color: '#D4EEE6', fontSize: 13, textAlign: 'right' },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'right' },
  heroBody: { color: '#E0F2EC', fontSize: 14, lineHeight: 22, textAlign: 'right' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: spacing.md, marginTop: spacing.sm, minHeight: 52, gap: spacing.sm },
  searchIcon: { fontSize: 26, color: colors.brand, width: 25, textAlign: 'center' },
  searchInput: { flex: 1, color: colors.ink, fontSize: 15, paddingVertical: 12, writingDirection: 'rtl' },
  clearSearch: { color: colors.muted, fontSize: 24, paddingHorizontal: 4 },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: -spacing.sm, minHeight: 38, gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  link: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  filterPanel: { gap: spacing.sm },
  filterToggle: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  filterToggleText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  filterToggleGlyph: { color: colors.brand, fontSize: 20, fontWeight: '900' },
  advancedFilters: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  filterHeading: { color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  filterInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas, borderRadius: radius.sm, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 13 },
  priceInputs: { flexDirection: 'row-reverse', gap: spacing.sm },
  priceInput: { flex: 1 },
  filterError: { color: colors.danger, fontSize: 12, textAlign: 'right' },
  sortRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  filterCaption: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  applyFiltersButton: { minHeight: 48, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  applyFiltersText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  loadMoreButton: { minHeight: 48, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  loadMoreText: { color: colors.brand, fontSize: 14, fontWeight: '800' },
  busyButton: { opacity: 0.65 },
  adsList: { gap: spacing.md },
  filterRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  filterChip: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 42, justifyContent: 'center' },
  filterChipSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  filterTextSelected: { color: colors.brandDark },
  adCard: { position: 'relative', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  adMain: { flexDirection: 'row-reverse', minHeight: 136 },
  favoriteButton: { position: 'absolute', top: 6, right: 6, zIndex: 2, width: 40, height: 40, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  favoriteText: { color: colors.muted, fontSize: 20, lineHeight: 24 },
  favoriteActive: { color: '#D92D55' },
  adImage: { width: 112, minHeight: 136, backgroundColor: '#EEF1F3' },
  adImagePlaceholder: { width: 112, minHeight: 136, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  placeholderEmoji: { fontSize: 32 },
  adInfo: { flex: 1, minWidth: 0, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs, alignItems: 'flex-end', justifyContent: 'center' },
  adTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'right', width: '100%' },
  adPrice: { color: colors.brand, fontSize: 15, fontWeight: '800', textAlign: 'right' },
  adMeta: { color: colors.muted, fontSize: 12, textAlign: 'right', width: '100%' },
  negotiable: { color: colors.brandDark, backgroundColor: colors.brandSoft, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, overflow: 'hidden' },
  cacheStatus: { alignSelf: 'flex-end', backgroundColor: '#EAF5F1', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  cacheStatusText: { color: '#246A55', fontSize: 11, fontWeight: '600', textAlign: 'right' },
  refreshNotice: { backgroundColor: '#FFF8E8', borderRadius: radius.md, borderWidth: 1, borderColor: '#F4E2B5', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  refreshNoticeText: { color: '#795F24', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  statusCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  statusEmoji: { fontSize: 32 },
  statusTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  statusText: { color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: 'center' },
  retryButton: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  helperText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  notice: { backgroundColor: '#FFF8E8', borderColor: '#F4E2B5', borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  noticeTitle: { color: '#7C5700', fontSize: 13, fontWeight: '800', textAlign: 'right' },
  noticeText: { color: '#795F24', fontSize: 12, lineHeight: 19, textAlign: 'right' },
});
