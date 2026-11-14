import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatDate } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { pushOnce } from '@/lib/navigation';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { Spinner, EmptyState, ErrorState, SectionHeader, SkeletonList } from '@/components/ui';

import { DrawerMenuButton } from '@/components/MobileDrawer';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { fontSizes, radius, sizes, spacing, ux, fontWeights } from '@/theme/tokens';
import { AppIcon } from '@/components/Icons';
import { HORIZONTAL_AD_CARD_WIDTH, HorizontalAdCard } from '@/components/MarketCards';
import { useAuth } from '@/features/auth/AuthContext';
import HomeCommunitySections from '@/features/discovery/HomeCommunitySections';
import HomeMarketplaceSections from '@/features/discovery/HomeMarketplaceSections';
import { formatPrice } from '@/features/discovery/homeFormatters';

import { marketListPerf } from '@/lib/listPerformance';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { deferToIdle } from '@/lib/idle';
import { pickAnyImageUri } from '@/lib/list-image';
import { runWhenScrollIdle, withScrollActivity } from '@/lib/scrollActivity';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { useHomeAds } from '@/features/discovery/useHomeAds';
import type { AdListItem } from '@/features/ads/ads.api';
import { useHomeScreenState } from '@/features/discovery/useHomeScreenState';
import { useOnlineResync } from '@/lib/useOnlineResync';

type HomeListRow =
  | { type: 'header' }
  | { type: 'adsHeader' }
  | { type: 'adsCarousel' }
  | { type: 'sections' }
  | { type: 'footer' };

const HOME_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1 } as const;

/** تأخير بسيط بعد استقرار الإعلانات قبل تركيب الأقسام الثانوية (بعد أول رسم + تفاعلات). */
const SECONDARY_SECTIONS_DELAY_MS = 300;

/** الأقسام الثقيلة memo: لا تُعاد عند كل حرف يُكتب في البحث. */
const MemoHomeCommunitySections = memo(HomeCommunitySections);
const MemoHomeMarketplaceSections = memo(HomeMarketplaceSections);

type AuthUser = ReturnType<typeof useAuth>['user'];

/* ───────────────────────── رأس الصفحة + البحث ───────────────────────── */

type HomeSearchHeaderProps = {
  user: AuthUser;
  isRestoring: boolean;
  query: string;
  onChangeQuery: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
};

const HomeSearchHeader = memo(function HomeSearchHeader({
  user,
  isRestoring,
  query,
  onChangeQuery,
  onSubmit,
  onClear,
}: HomeSearchHeaderProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  const setQuery = onChangeQuery;
  const submitSearch = onSubmit;
  const clearSearch = onClear;
  return (
    <View style={styles.headerBlock}>
      {/* شريط علوي نظيف */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>م</Text>
          </View>
          <View style={styles.brandTextCol}>
            <Text style={styles.brandName}>MarketPlat</Text>
            <Text style={styles.brandSubtitle}>سوقك المحلي</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <DrawerMenuButton />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={user ? 'فتح حسابي' : 'تسجيل الدخول'}
            disabled={isRestoring}
            onPress={() => pushOnce(user ? '/account' : '/login')}
            style={({ pressed }) => [styles.accountButton, pressed && styles.pressed]}
          >
            <Text style={styles.accountButtonText}>
              {isRestoring ? '…' : user ? 'حسابي' : 'دخول'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ترحيب مختصر + بحث بارز */}
      <View style={styles.welcomeRow}>
        <Text style={styles.welcomeText}>
          {user ? `أهلًا، ${user.name?.split(' ')[0] || user.name}` : 'أهلًا بك في سوقك المحلي'}
        </Text>
      </View>

      <View style={styles.searchBox}>
        <AppIcon name="search" size={20} color={colors.muted} />
        <TextInput
          allowFontScaling
          accessibilityLabel="ابحث عن إعلان"
          maxFontSizeMultiplier={1.3}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => { submitSearch(); }}
          placeholder="ابحث عن إعلان أو سلعة…"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={styles.searchInput}
          textAlign="right"
        />
        {query.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="مسح البحث" onPress={clearSearch} hitSlop={8}>
            <AppIcon name="close" size={22} color={colors.muted} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تنفيذ البحث"
          onPress={() => { submitSearch(); }}
          style={({ pressed }) => [styles.searchSubmit, pressed && styles.pressed]}
        >
          <Text style={styles.searchSubmitText}>بحث</Text>
        </Pressable>
      </View>

      {/* اختصارات مضغوطة بدل بطاقات كبيرة */}
      <View style={styles.quickActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="استكشف جميع أقسام السوق"
          onPress={() => pushOnce('/explore')}
          style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
        >
          <AppIcon name="search" size={16} color={colors.brand} />
          <Text maxFontSizeMultiplier={1.25} style={styles.quickChipTitle}>استكشف</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="بحث وفلاتر متقدمة"
          onPress={() => pushOnce('/search')}
          style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
        >
          <AppIcon name="settings" size={16} color={colors.brand} />
          <Text maxFontSizeMultiplier={1.25} style={styles.quickChipTitle}>فلاتر</Text>
        </Pressable>
            <Pressable
          accessibilityRole="button"
          accessibilityLabel="محتوى مخصص لك"
          onPress={() => pushOnce('/for-you')}
          style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
        >
          <AppIcon name="service" size={16} color={colors.brand} />
          <Text maxFontSizeMultiplier={1.25} style={styles.quickChipTitle}>مخصص</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="الإعلانات والمنتجات والخدمات الرائجة الآن"
          onPress={() => pushOnce('/trending')}
          style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
        >
          <AppIcon name="star" size={16} color={colors.brand} />
          <Text maxFontSizeMultiplier={1.25} style={styles.quickChipTitle}>الرائج</Text>
        </Pressable>
      </View>
    </View>
  );
});

/* ───────────────────────── عنوان الإعلانات + الفلاتر ───────────────────────── */

type HomeAdsHeaderProps = {
  showFilters: boolean;
  setShowFilters: Dispatch<SetStateAction<boolean>>;
  cityInput: string;
  setCityInput: (value: string) => void;
  minPriceInput: string;
  setMinPriceInput: (value: string) => void;
  maxPriceInput: string;
  setMaxPriceInput: (value: string) => void;
  filterError: string | null;
  applyFilters: () => unknown;
  clearFilters: () => void;
  sortBy: 'createdAt' | 'price' | 'views';
  setSortBy: (value: 'createdAt' | 'price' | 'views') => void;
  setSortOrder: (value: 'asc' | 'desc') => void;
};

const HomeAdsHeader = memo(function HomeAdsHeader({
  showFilters,
  setShowFilters,
  cityInput,
  setCityInput,
  minPriceInput,
  setMinPriceInput,
  maxPriceInput,
  setMaxPriceInput,
  filterError,
  applyFilters,
  clearFilters,
  sortBy,
  setSortBy,
  setSortOrder,
}: HomeAdsHeaderProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  return (
    <View style={styles.adsHeaderBlock}>
      <View style={styles.adsHeaderRow}>
        <View style={styles.adsHeaderText}>
          <SectionHeader title="أحدث الإعلانات" subtitle="من السوق المحلي" />
        </View>
        <View style={styles.sectionActions}>
          <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showFilters }}
          onPress={() => setShowFilters((value) => !value)}
          style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}
        >
          <Text style={styles.link}>{showFilters ? 'إخفاء الفلاتر' : 'فلاتر'}</Text>
        </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => pushOnce('/ads')}
            style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}
          >
            <Text style={styles.link}>عرض الكل</Text>
          </Pressable>
        </View>
      </View>
    {showFilters ? (
      <View style={styles.filtersPanel}>
        <TextInput
          allowFontScaling
          accessibilityLabel="المدينة"
          maxFontSizeMultiplier={1.3}
          value={cityInput}
          onChangeText={setCityInput}
          placeholder="المدينة"
          placeholderTextColor={colors.muted}
          textAlign="right"
          style={styles.filterInput}
        />
        <View style={styles.priceRow}>
          <TextInput
            allowFontScaling
            accessibilityLabel="أقل سعر"
            maxFontSizeMultiplier={1.3}
            value={minPriceInput}
            onChangeText={(value) => setMinPriceInput(normalizeNumericInput(value))}
            keyboardType="decimal-pad"
            placeholder="أقل سعر"
            placeholderTextColor={colors.muted}
            textAlign="right"
            style={[styles.filterInput, styles.priceInput]}
          />
          <TextInput
            allowFontScaling
            accessibilityLabel="أعلى سعر"
            maxFontSizeMultiplier={1.3}
            value={maxPriceInput}
            onChangeText={(value) => setMaxPriceInput(normalizeNumericInput(value))}
            keyboardType="decimal-pad"
            placeholder="أعلى سعر"
            placeholderTextColor={colors.muted}
            textAlign="right"
            style={[styles.filterInput, styles.priceInput]}
          />
        </View>
        {filterError ? (
          <Text style={styles.filterError} accessibilityLiveRegion="polite">{filterError}</Text>
        ) : null}
        <View style={styles.sortRow}>
          <Text style={styles.filterCaption}>الترتيب:</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: sortBy === 'createdAt' }}
            onPress={() => { setSortBy('createdAt'); setSortOrder('desc'); }}
            style={[styles.filterChip, sortBy === 'createdAt' && styles.filterChipSelected]}
          >
            <Text style={[styles.filterText, sortBy === 'createdAt' && styles.filterTextSelected]}>الأحدث</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: sortBy === 'price' }}
            onPress={() => { setSortBy('price'); setSortOrder('asc'); }}
            style={[styles.filterChip, sortBy === 'price' && styles.filterChipSelected]}
          >
            <Text style={[styles.filterText, sortBy === 'price' && styles.filterTextSelected]}>الأقل سعرًا</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: sortBy === 'views' }}
            onPress={() => { setSortBy('views'); setSortOrder('desc'); }}
            style={[styles.filterChip, sortBy === 'views' && styles.filterChipSelected]}
          >
            <Text style={[styles.filterText, sortBy === 'views' && styles.filterTextSelected]}>الأكثر مشاهدة</Text>
          </Pressable>
        </View>
        <View style={styles.filterActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => { clearFilters(); setSortBy('createdAt'); setSortOrder('desc'); }}
            style={styles.clearFiltersButton}
          >
            <Text style={styles.clearFiltersText}>مسح</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={applyFilters} style={styles.applyFiltersButton}>
            <Text style={styles.applyFiltersText}>تطبيق الفلاتر</Text>
          </Pressable>
        </View>
      </View>
    ) : null}
    </View>
  );
});

/* ───────────────────────── carousel الإعلانات (أفقي) ───────────────────────── */

type HomeAdsCarouselProps = {
  ads: AdListItem[];
  favoriteIds: string[];
  failedImageIds: string[];
  onOpenAd: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onImageError: (id: string) => void;
  onEndReached: () => void;
};

/** FlashList لا يدعم gap: الفاصل بين البطاقات عبر ItemSeparatorComponent. */
function CarouselSeparator() {
  return <View style={carouselSeparatorStyle} />;
}
const carouselSeparatorStyle = { width: spacing.md } as const;

const HomeAdsCarousel = memo(function HomeAdsCarousel({
  ads,
  favoriteIds,
  failedImageIds,
  onOpenAd,
  onToggleFavorite,
  onImageError,
  onEndReached,
}: HomeAdsCarouselProps) {
  const keyExtractor = useCallback((ad: AdListItem) => ad.id, []);
  // Set بدل includes: بحث O(1) لكل بطاقة بدل مسح المصفوفة كاملة في كل renderItem.
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const failedImageSet = useMemo(() => new Set(failedImageIds), [failedImageIds]);
  const renderItem = useCallback(({ item: ad }: { item: AdListItem }) => {
    const imageUri = failedImageSet.has(ad.id) ? undefined : pickAnyImageUri(ad.images);
    return (
      <HorizontalAdCard
        id={ad.id}
        title={ad.title}
        price={formatPrice(ad.price)}
        meta={[ad.city, ad.category?.nameAr || ad.category?.name].filter(Boolean).join(' · ') || 'إعلان محلي'}
        imageUri={imageUri}
        isFavorite={favoriteSet.has(ad.id)}
        isNegotiable={Boolean(ad.isNegotiable)}
        onPressItem={onOpenAd}
        onToggleFavoriteItem={onToggleFavorite}
        onImageErrorItem={onImageError}
      />
    );
  }, [failedImageSet, favoriteSet, onOpenAd, onToggleFavorite, onImageError]);
  const extraData = useMemo(() => ({ favoriteIds, failedImageIds }), [favoriteIds, failedImageIds]);
  return (
    <AppFlashList
      horizontal
      nestedScrollEnabled
      data={ads}
      extraData={extraData}
      keyExtractor={keyExtractor}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={carouselContentStyle}
      ItemSeparatorComponent={CarouselSeparator}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      renderItem={renderItem}
    />
  );
});

const carouselContentStyle = { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs } as const;

/* ───────────────────────── تذييل: حالة الكاش / الأخطاء / تحميل المزيد ───────────────────────── */

type HomeAdsFooterProps = {
  adsSavedAt: number | null;
  adsFromCache: boolean;
  loading: boolean;
  errorMessage: string | null;
  adsCount: number;
  page: number;
  totalPages: number;
  loadingMore: boolean;
  loadAds: (isRefresh?: boolean) => Promise<void>;
  loadMoreAds: () => Promise<void>;
};

const HomeAdsFooter = memo(function HomeAdsFooter({
  adsSavedAt,
  adsFromCache,
  loading,
  errorMessage,
  adsCount,
  page,
  totalPages,
  loadingMore,
  loadAds,
  loadMoreAds,
}: HomeAdsFooterProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  return (
    <View style={styles.adsBlock}>
      {adsSavedAt !== null && !loading ? (
        <View style={styles.cacheStatus} accessibilityLiveRegion="polite">
          <Text style={styles.cacheStatusText}>
            {adsFromCache ? 'نسخة محفوظة على الجهاز' : 'تمت مزامنة الإعلانات'}
            {' · '}
            {formatDate(adsSavedAt, 'dateTime')}
          </Text>
        </View>
      ) : null}

      {loading && adsCount === 0 ? <SkeletonList count={4} /> : null}
      {errorMessage && adsCount === 0 ? (
        <ErrorState title="لم نتمكن من تحميل الإعلانات" description={errorMessage} onAction={() => { void loadAds(); }} />
      ) : null}
      {!loading && !errorMessage && adsCount === 0 ? (
        <EmptyState title="لا توجد إعلانات مطابقة" description="جرّب كلمة بحث أخرى أو اسحب الشاشة للأسفل للتحديث." />
      ) : null}
      {errorMessage && adsCount > 0 ? (
        <ErrorState title="تعذر تحديث الإعلانات" description={errorMessage} onAction={() => { void loadAds(true); }} />
      ) : null}

      {loadingMore ? (
        <View style={styles.loadMoreRow}>
          <Spinner color={colors.brand} />
          <Text style={styles.link}>تحميل المزيد…</Text>
        </View>
      ) : null}
      {!loadingMore && !loading && !errorMessage && adsCount > 0 && page < totalPages ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => { void loadMoreAds(); }}
          style={({ pressed }) => [styles.loadMoreButton, pressed && styles.pressed]}
        >
          <Text style={styles.loadMoreText}>تحميل المزيد من الإعلانات</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

/* ───────────────────────── فواصل الصفوف ───────────────────────── */

function HomeRowSeparator({ leadingItem }: { leadingItem?: unknown }) {
  const afterCarousel = Boolean(
    leadingItem && typeof leadingItem === 'object' && 'type' in leadingItem && (leadingItem as HomeListRow).type === 'adsCarousel',
  );
  return <View style={{ height: afterCarousel ? spacing.md : spacing.lg }} />;
}

const HOME_LIST_ROWS: HomeListRow[] = [
  { type: 'header' },
  { type: 'adsHeader' },
  { type: 'adsCarousel' },
  { type: 'footer' },
  { type: 'sections' },
];

/**
 * Home — orchestration only.
 * State: useHomeScreenState (search/filters/sort/favorites)
 * Data: useHomeAds, plus lazy-mounted marketplace/community sections.
 * كل كتلة مرئية مكوّن memo مستقل: الكتابة في البحث لا تُعيد رسم carousel أو الأقسام.
 */
export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { user, isRestoring } = useAuth();
  const [sectionsVisible, setSectionsVisible] = useState(false);
  const [sectionsReady, setSectionsReady] = useState(false);
  const [sectionsRefreshKey, setSectionsRefreshKey] = useState(0);

  const {
    query,
    setQuery,
    submittedSearch,
    submitSearch,
    clearSearch,
    showFilters,
    setShowFilters,
    cityInput,
    setCityInput,
    minPriceInput,
    setMinPriceInput,
    maxPriceInput,
    setMaxPriceInput,
    filters,
    filterError,
    applyFilters,
    clearFilters,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    favoriteIds,
    toggleFavorite,
  } = useHomeScreenState();

  const {
    ads,
    loading,
    refreshing,
    errorMessage,
    adsSavedAt,
    adsFromCache,
    page,
    totalPages,
    loadingMore,
    failedImageIds,
    loadAds,
    loadMoreAds,
    markImageFailed,
  } = useHomeAds({
    search: submittedSearch,
    filters,
    sort: { sortBy, sortOrder },
  });

  const loadAdsRef = useRef(loadAds);
  useEffect(() => {
    loadAdsRef.current = loadAds;
  }, [loadAds]);

  // إعادة التحميل بعد عودة الاتصال لا تحدث أثناء تمرير المستخدم (تجنّب setState كبير أثناء الزخم).
  const resyncPublic = useCallback(() => {
    runWhenScrollIdle(() => {
      void loadAdsRef.current(true);
    });
  }, []);
  useOnlineResync(resyncPublic);

  // لا تُركَّب الأقسام الثانوية (وطلباتها) إلا بعد أن يصل المستخدم إليها فعلًا...
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: HomeListRow }> }) => {
      if (viewableItems.some((token) => (token.item as HomeListRow | undefined)?.type === 'sections')) {
        setSectionsVisible(true);
      }
    },
    [],
  );

  // ...وبعد أن تستقر الإعلانات (الأولوية لـ Home Ads) + مهلة قصيرة بعد أول رسم.
  useEffect(() => {
    if (!sectionsVisible || loading || sectionsReady) return;
    return deferToIdle(() => setSectionsReady(true), { delayMs: SECONDARY_SECTIONS_DELAY_MS });
  }, [sectionsVisible, loading, sectionsReady]);

  // معالجات ثابتة الهوية لبطاقات الـ carousel (memo).
  const toggleFavoriteRef = useRef(toggleFavorite);
  toggleFavoriteRef.current = toggleFavorite;
  const openAd = useCallback((id: string) => pushOnce(`/ads/${encodeURIComponent(id)}`), []);
  const onToggleFavorite = useCallback((id: string) => { void toggleFavoriteRef.current(id); }, []);
  const onCarouselEndReached = useCallback(() => {
    if (!loading && !refreshing && !loadingMore && !errorMessage && ads.length > 0 && page < totalPages) {
      void loadMoreAds();
    }
  }, [loading, refreshing, loadingMore, errorMessage, ads.length, page, totalPages, loadMoreAds]);
  const onRefresh = useCallback(() => {
    if (sectionsReady) setSectionsRefreshKey((value) => value + 1);
    void loadAds(true);
  }, [sectionsReady, loadAds]);

  const renderItem = useCallback(({ item }: { item: HomeListRow }) => {
    if (item.type === 'adsCarousel') {
      return (
        <HomeAdsCarousel
          ads={ads}
          favoriteIds={favoriteIds}
          failedImageIds={failedImageIds}
          onOpenAd={openAd}
          onToggleFavorite={onToggleFavorite}
          onImageError={markImageFailed}
          onEndReached={onCarouselEndReached}
        />
      );
    }

    if (item.type === 'header') {
      return (
        <HomeSearchHeader
          user={user}
          isRestoring={isRestoring}
          query={query}
          onChangeQuery={setQuery}
          onSubmit={submitSearch}
          onClear={clearSearch}
        />
      );
    }

    if (item.type === 'adsHeader') {
      return (
        <HomeAdsHeader
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          cityInput={cityInput}
          setCityInput={setCityInput}
          minPriceInput={minPriceInput}
          setMinPriceInput={setMinPriceInput}
          maxPriceInput={maxPriceInput}
          setMaxPriceInput={setMaxPriceInput}
          filterError={filterError}
          applyFilters={applyFilters}
          clearFilters={clearFilters}
          sortBy={sortBy}
          setSortBy={setSortBy}
          setSortOrder={setSortOrder}
        />
      );
    }

    if (item.type === 'sections') {
      if (!sectionsReady) {
        // قبل الوصول: عنصر 1px لا يكلّف شيئًا. بعد الوصول وقبل الجاهزية: هيكل تحميل ثابت الارتفاع.
        return sectionsVisible ? (
          <View style={styles.sectionsSkeleton} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SkeletonList count={2} />
          </View>
        ) : (
          <View style={styles.deferredSectionsPlaceholder} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        );
      }
      return (
        <View style={styles.sectionsBlock}>
          <MemoHomeCommunitySections />
          <MemoHomeMarketplaceSections refreshKey={sectionsRefreshKey} />
        </View>
      );
    }

    // Footer: cache status, loading/error states, and pagination controls.
    return (
      <HomeAdsFooter
        adsSavedAt={adsSavedAt}
        adsFromCache={adsFromCache}
        loading={loading}
        errorMessage={errorMessage}
        adsCount={ads.length}
        page={page}
        totalPages={totalPages}
        loadingMore={loadingMore}
        loadAds={loadAds}
        loadMoreAds={loadMoreAds}
      />
    );
  }, [
    ads, favoriteIds, failedImageIds, openAd, onToggleFavorite, markImageFailed, onCarouselEndReached,
    user, isRestoring, query, setQuery, submitSearch, clearSearch,
    showFilters, setShowFilters, cityInput, setCityInput, minPriceInput, setMinPriceInput, maxPriceInput, setMaxPriceInput,
    filterError, applyFilters, clearFilters, sortBy, setSortBy, setSortOrder,
    sectionsReady, sectionsVisible, sectionsRefreshKey, styles,
    adsSavedAt, adsFromCache, loading, errorMessage, page, totalPages, loadingMore, loadAds, loadMoreAds,
  ]);

  // extraData يضمن إعادة رسم الصفوف المتأثرة فقط عند تغيّر هذه القيم (مرجع ثابت بين الـ renders).
  const listExtraData = useMemo(() => ({
    sectionsVisible, sectionsReady, sectionsRefreshKey, ads, favoriteIds, failedImageIds, loading, refreshing, loadingMore,
    errorMessage, adsSavedAt, adsFromCache, page, totalPages, query, showFilters, cityInput, minPriceInput, maxPriceInput,
    filterError, sortBy, user, isRestoring,
  }), [
    sectionsVisible, sectionsReady, sectionsRefreshKey, ads, favoriteIds, failedImageIds, loading, refreshing, loadingMore,
    errorMessage, adsSavedAt, adsFromCache, page, totalPages, query, showFilters, cityInput, minPriceInput, maxPriceInput,
    filterError, sortBy, user, isRestoring,
  ]);

  return (
    <ScreenFrame keyboardAvoiding>
      <FlatList
        data={HOME_LIST_ROWS}
        extraData={listExtraData}
        keyExtractor={homeRowKey}
        {...marketListPerf}
        {...homeScrollHandlers}
        viewabilityConfig={HOME_VIEWABILITY_CONFIG}
        onViewableItemsChanged={onViewableItemsChanged}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={HomeRowSeparator}
        renderItem={renderItem}
      />
    </ScreenFrame>
  );
}

function homeRowKey(item: HomeListRow) {
  return item.type;
}

/** تتبّع نشاط التمرير للرئيسية (لتأجيل الأعمال الثانوية أثناء الزخم). */
const homeScrollHandlers = withScrollActivity({});

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  pressed: { opacity: ux.pressedOpacity },
  deferredSectionsPlaceholder: { minHeight: 1 },
  sectionsSkeleton: { minHeight: 240 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: sizes.bottomNavHeight + spacing.xxxl,
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },

  // —— أعلى الصفحة ——
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    gap: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  logo: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radius.control,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.onBrand,
    fontSize: fontSizes[20],
    fontWeight: fontWeights.bold,
  },
  brandTextCol: { gap: spacing.xxs },
  brandName: {
    color: colors.ink,
    fontSize: fontSizes[17],
    fontWeight: fontWeights.bold,
    textAlign: 'right',
  },
  brandSubtitle: {
    color: colors.muted,
    fontSize: fontSizes[12],
    textAlign: 'right',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountButton: {
    minHeight: sizes.touchTarget,
    minWidth: sizes.touchTargetLg + spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountButtonText: {
    color: colors.brandOnSoft,
    fontSize: fontSizes[13],
    fontWeight: fontWeights.bold,
  },

  welcomeRow: {
    marginTop: spacing.xs,
  },
  welcomeText: {
    color: colors.muted,
    fontSize: fontSizes[13],
    textAlign: 'right',
  },

  // بحث بارز
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: fontSizes[15],
    paddingVertical: spacing.sm,
  },
  searchSubmit: {
    backgroundColor: colors.brand,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    minHeight: sizes.touchTarget - spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSubmitText: {
    color: colors.onBrand,
    fontSize: fontSizes[13],
    fontWeight: fontWeights.bold,
  },

  // اختصارات مضغوطة
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickChip: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipTitle: {
    color: colors.ink,
    fontSize: fontSizes[12],
    fontWeight: fontWeights.semibold,
  },

  // أقسام المجتمع والسوق
  sectionsBlock: {
    gap: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  // كتلة الإعلانات
  adsBlock: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  adsHeaderBlock: { gap: spacing.sm },
  adsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  adsHeaderText: { flex: 1 },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xxs,
  },
  filterToggle: {
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  link: {
    color: colors.brand,
    fontSize: fontSizes[12],
    fontWeight: fontWeights.semibold,
  },

  // فلاتر
  filtersPanel: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radius.input,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: fontSizes[14],
  },
  priceRow: { flexDirection: 'row', gap: spacing.sm },
  priceInput: { flex: 1 },
  filterError: {
    color: colors.dangerText,
    fontSize: fontSizes[12],
    textAlign: 'right',
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterCaption: {
    color: colors.muted,
    fontSize: fontSizes[12],
    fontWeight: fontWeights.semibold,
  },
  filterChip: {
    minHeight: sizes.chipHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  filterText: {
    color: colors.muted,
    fontSize: fontSizes[12],
    fontWeight: fontWeights.semibold,
  },
  filterTextSelected: {
    color: colors.brandOnSoft,
  },
  filterActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  clearFiltersButton: {
    flex: 1,
    minHeight: sizes.touchTarget,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearFiltersText: {
    color: colors.ink,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes[13],
  },
  applyFiltersButton: {
    flex: 2,
    minHeight: sizes.touchTarget,
    borderRadius: radius.control,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFiltersText: {
    color: colors.onBrand,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes[13],
  },

  cacheStatus: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  cacheStatusText: {
    color: colors.brandDark,
    fontSize: fontSizes[11],
    fontWeight: fontWeights.semibold,
    textAlign: 'right',
  },

  loadMoreRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  loadMoreButton: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoftActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  loadMoreText: {
    color: colors.brandOnSoft,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes[14],
  },
});

