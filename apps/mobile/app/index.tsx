import { formatDate } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { AppImage } from '@/components/AppImage';
import { DrawerMenuButton } from '@/components/MobileDrawer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontSizes, colors, radius, spacing, ux } from '@/theme/tokens';
import { EmptyState, ErrorState, LoadingState, SectionHeader, SkeletonList } from '@/components/MobileUI';
import { AdCard } from '@/components/MarketCards';
import { useAuth } from '@/features/auth/AuthContext';
import HomeCommunitySections from '@/features/discovery/HomeCommunitySections';
import HomeMarketplaceSections from '@/features/discovery/HomeMarketplaceSections';
import { formatPrice, formatServicePrice } from '@/features/discovery/homeFormatters';
import type { AdListItem } from '@/features/ads/ads.api';
import { marketListPerf } from '@/lib/listPerformance';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { useHomeAds } from '@/features/discovery/useHomeAds';
import { useHomeServices } from '@/features/discovery/useHomeServices';
import { useHomeScreenState } from '@/features/discovery/useHomeScreenState';
import { useOnlineResync } from '@/lib/useOnlineResync';

type HomeListRow =
  | { type: 'header' }
  | { type: 'sections' }
  | { type: 'ad'; key: string; ad: AdListItem }
  | { type: 'footer' };

/**
 * Home — orchestration only (Phase 2).
 * State: useHomeScreenState (search/filters/sort/favorites)
 * Data: useHomeAds + useHomeServices
 */
export default function HomeScreen() {
  const { user, isRestoring } = useAuth();

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
  const { loadServices } = useHomeServices();

  const loadAdsRef = useRef(loadAds);
  const loadServicesRef = useRef(loadServices);
  useEffect(() => {
    loadAdsRef.current = loadAds;
  }, [loadAds]);
  useEffect(() => {
    loadServicesRef.current = loadServices;
  }, [loadServices]);

  const resyncPublic = useCallback(() => {
    void loadAdsRef.current(true);
    void loadServicesRef.current(true);
  }, []);
  useOnlineResync(resyncPublic);

  const listRows = useMemo<HomeListRow[]>(() => [
    { type: 'header' },
    { type: 'sections' },
    ...ads.map((ad) => ({ type: 'ad' as const, key: ad.id, ad })),
    { type: 'footer' },
  ], [ads]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FlatList
        data={listRows}
        keyExtractor={(item) => item.type === 'ad' ? `ad:${item.key}` : item.type}
        {...marketListPerf}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void Promise.all([loadAds(true), loadServices(true)]); }} tintColor={colors.brand} />}
        ItemSeparatorComponent={({ leadingItem }) => {
          if (leadingItem && typeof leadingItem === 'object' && 'type' in leadingItem && leadingItem.type === 'ad') {
            return <View style={{ height: spacing.md }} />;
          }
          return <View style={{ height: spacing.lg }} />;
        }}
        onEndReached={() => {
          if (!loading && !refreshing && !loadingMore && !errorMessage && ads.length > 0 && page < totalPages) {
            void loadMoreAds();
          }
        }}
        onEndReachedThreshold={0.35}
        renderItem={({ item }) => {
          if (item.type === 'ad') {
            const ad = item.ad;
            const imageUri = !failedImageIds.includes(ad.id) && Array.isArray(ad.images)
              ? ad.images.find((url) => typeof url === 'string' && /^(https?:|file:|content:)/i.test(url))
              : undefined;
            return (
              <AdCard
                title={ad.title}
                price={formatPrice(ad.price)}
                meta={[ad.city, ad.category?.nameAr || ad.category?.name].filter(Boolean).join(' · ') || 'إعلان محلي'}
                imageUri={imageUri}
                isFavorite={favoriteIds.includes(ad.id)}
                isNegotiable={Boolean(ad.isNegotiable)}
                onPress={() => router.push(`/ads/${encodeURIComponent(ad.id)}`)}
                onToggleFavorite={() => { void toggleFavorite(ad.id); }}
                onImageError={() => markImageFailed(ad.id)}
              />
            );
          }

          if (item.type === 'header') {
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
                      onPress={() => router.push(user ? '/account' : '/login')}
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
                    {user ? `أهلًا، ${user.name?.split(' ')[0] || user.name}` : 'أهلاً بك في سوقك المحلي'}
                  </Text>
                </View>

                <View style={styles.searchBox}>
                  <Text style={styles.searchIcon}>⌕</Text>
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
                      <Text style={styles.clearSearch}>×</Text>
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
                    accessibilityLabel="استكشف السوق"
                    onPress={() => router.push('/explore')}
                    style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
                  >
                    <Text style={styles.quickChipGlyph}>⌕</Text>
                    <Text maxFontSizeMultiplier={1.25} style={styles.quickChipTitle}>استكشف</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="بحث وفلاتر متقدمة"
                    onPress={() => router.push('/search')}
                    style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
                  >
                    <Text style={styles.quickChipGlyph}>⚙</Text>
                    <Text maxFontSizeMultiplier={1.25} style={styles.quickChipTitle}>فلاتر</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="إضافة إعلان أو منتج أو خدمة"
                    onPress={() => router.push(user ? '/add' : '/login')}
                    style={({ pressed }) => [styles.quickChip, styles.quickChipPrimary, pressed && styles.pressed]}
                  >
                    <Text style={[styles.quickChipGlyph, styles.quickChipGlyphPrimary]}>＋</Text>
                    <Text maxFontSizeMultiplier={1.25} style={[styles.quickChipTitle, styles.quickChipTitlePrimary]}>إضافة</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="محتوى مخصص لك"
                    onPress={() => router.push('/for-you')}
                    style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
                  >
                    <Text style={styles.quickChipGlyph}>✦</Text>
                    <Text maxFontSizeMultiplier={1.25} style={styles.quickChipTitle}>مخصص</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          if (item.type === 'sections') {
            return (
              <View style={styles.sectionsBlock}>
                <HomeCommunitySections />
                <HomeMarketplaceSections />
              </View>
            );
          }

          // footer: عنوان الإعلانات + فلاتر + حالات التحميل + تحميل المزيد
          return (
            <View style={styles.adsBlock}>
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
                    onPress={() => router.push('/ads')}
                    style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}
                  >
                    <Text style={styles.link}>الكل</Text>
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

              {adsSavedAt !== null && !loading ? (
                <View style={styles.cacheStatus} accessibilityLiveRegion="polite">
                  <Text style={styles.cacheStatusText}>
                    {adsFromCache ? 'نسخة محفوظة على الجهاز' : 'تمت مزامنة الإعلانات'}
                    {' · '}
                    {formatDate(adsSavedAt, 'dateTime')}
                  </Text>
                </View>
              ) : null}

              {loading && ads.length === 0 ? <SkeletonList count={4} /> : null}
              {errorMessage && ads.length === 0 ? (
                <ErrorState title="لم نتمكن من تحميل الإعلانات" description={errorMessage} onAction={() => { void loadAds(); }} />
              ) : null}
              {!loading && !errorMessage && ads.length === 0 ? (
                <EmptyState title="لا توجد إعلانات مطابقة" description="جرّب كلمة بحث أخرى أو اسحب الشاشة للأسفل للتحديث." />
              ) : null}
              {errorMessage && ads.length > 0 ? (
                <ErrorState title="تعذر تحديث الإعلانات" description={errorMessage} onAction={() => { void loadAds(true); }} />
              ) : null}

              {loadingMore ? (
                <View style={styles.loadMoreRow}>
                  <ActivityIndicator color={colors.brand} />
                  <Text style={styles.link}>تحميل المزيد…</Text>
                </View>
              ) : null}
              {!loadingMore && !loading && !errorMessage && ads.length > 0 && page < totalPages ? (
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
        }}
      />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: ux.pressedOpacity },
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 88,
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
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.white,
    fontSize: fontSizes[20],
    fontWeight: '700',
  },
  brandTextCol: { gap: 1 },
  brandName: {
    color: colors.ink,
    fontSize: fontSizes[17],
    fontWeight: '700',
    textAlign: 'right',
  },
  brandSubtitle: {
    color: colors.muted,
    fontSize: fontSizes[11],
    textAlign: 'right',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountButton: {
    minHeight: 40,
    minWidth: 60,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountButtonText: {
    color: colors.brandOnSoft,
    fontSize: fontSizes[13],
    fontWeight: '700',
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
    borderColor: colors.borderStrong ?? colors.border,
  },
  searchIcon: {
    color: colors.muted,
    fontSize: fontSizes[18],
    fontWeight: '600',
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: fontSizes[15],
    paddingVertical: spacing.sm,
  },
  clearSearch: {
    color: colors.muted,
    fontSize: fontSizes[22],
    lineHeight: 26,
    paddingHorizontal: spacing.xs,
  },
  searchSubmit: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSubmitText: {
    color: colors.white,
    fontSize: fontSizes[13],
    fontWeight: '700',
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
    gap: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipPrimary: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  quickChipGlyph: {
    color: colors.brand,
    fontSize: fontSizes[15],
    fontWeight: '700',
  },
  quickChipGlyphPrimary: {
    color: colors.white,
  },
  quickChipTitle: {
    color: colors.ink,
    fontSize: fontSizes[12],
    fontWeight: '600',
  },
  quickChipTitlePrimary: {
    color: colors.white,
  },

  // أقسام المجتمع والسوق
  sectionsBlock: {
    gap: spacing.xxl,
    paddingBottom: spacing.sm,
  },

  // كتلة الإعلانات
  adsBlock: {
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
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
    paddingTop: 2,
  },
  filterToggle: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  link: {
    color: colors.brand,
    fontSize: fontSizes[12],
    fontWeight: '600',
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
    borderColor: colors.borderStrong ?? colors.border,
    borderRadius: 12,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: fontSizes[14],
  },
  priceRow: { flexDirection: 'row', gap: spacing.sm },
  priceInput: { flex: 1 },
  filterError: {
    color: colors.danger,
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
    fontWeight: '600',
  },
  filterChip: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
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
    fontWeight: '600',
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
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearFiltersText: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: fontSizes[13],
  },
  applyFiltersButton: {
    flex: 2,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFiltersText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: fontSizes[13],
  },

  cacheStatus: {
    alignSelf: 'flex-end',
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  cacheStatusText: {
    color: colors.brandDark,
    fontSize: fontSizes[11],
    fontWeight: '600',
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
    borderColor: colors.brandSoftActive ?? colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  loadMoreText: {
    color: colors.brandOnSoft,
    fontWeight: '700',
    fontSize: fontSizes[14],
  },
});

