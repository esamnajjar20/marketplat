import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppImage } from '@/components/AppImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AdListItem } from '@/features/ads/ads.api';
import { colors, radius, spacing, typography, ux } from '@/theme/tokens';
import { EmptyState, ErrorState, LoadingState, SectionHeader, SkeletonList } from '@/components/MobileUI';
import { AdCard } from '@/components/MarketCards';
import { useAuth } from '@/features/auth/AuthContext';
import { enqueueFavoriteState, readFavoriteAdIds, writeFavoriteAdIds } from '@/features/ads/favorites.store';
import type { ServiceListing } from '@/features/services/services.api';
import HomeCommunitySections from '@/features/discovery/HomeCommunitySections';
import HomeMarketplaceSections from '@/features/discovery/HomeMarketplaceSections';
import { formatPrice, formatServicePrice } from '@/features/discovery/homeFormatters';
import { useHomeAds } from '@/features/discovery/useHomeAds';
import { useHomeServices } from '@/features/discovery/useHomeServices';
import { homeFilterSchema, validate } from '@/lib/validation';
import { useOnlineResync } from '@/lib/useOnlineResync';

export default function HomeScreen() {
  const { user, logout, isBusy, isRestoring } = useAuth();
  const [query, setQuery] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const favoriteIdsRef = useRef<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [filters, setFilters] = useState<{ city?: string; minPrice?: number; maxPrice?: number }>({});
  const [filterError, setFilterError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'createdAt' | 'price' | 'views'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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
  const { serviceItems, servicesLoading, servicesError, loadServices } = useHomeServices();

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

  useEffect(() => {
    let active = true;
    readFavoriteAdIds(user?.id).then((ids) => {
      if (!active) return;
      favoriteIdsRef.current = ids;
      setFavoriteIds(ids);
    });
    return () => { active = false; };
  }, [user?.id]);

  // Mirror favoriteIds into ref for race-safe toggles.
  useEffect(() => { favoriteIdsRef.current = favoriteIds; }, [favoriteIds]);

  const toggleFavorite = useCallback(async (id: string) => {
    // Read from ref (not state) to guarantee latest value on rapid double-tap.
    const previous = favoriteIdsRef.current;
    const wasFavorited = previous.includes(id);
    const favorited = !wasFavorited;
    const next = favorited ? [...previous, id] : previous.filter((item) => item !== id);
    favoriteIdsRef.current = next;
    setFavoriteIds(next);
    try {
      if (user?.id) {
        const operationId = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await enqueueFavoriteState({ userId: user.id, adId: id, favorited, previousFavorited: wasFavorited, operationId });
      }
      await writeFavoriteAdIds(next, user?.id);
    } catch (error) {
      const cached = await readFavoriteAdIds(user?.id);
      favoriteIdsRef.current = cached;
      setFavoriteIds(cached);
      Alert.alert('تعذر حفظ المفضلة', error instanceof Error ? error.message : 'لم يتم حفظ التغيير على الجهاز.');
    }
  }, [user?.id]);


  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void Promise.all([loadAds(true), loadServices(true)]); }} tintColor={colors.brand} />}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={user ? 'تسجيل الخروج' : 'تسجيل الدخول'}
              disabled={isBusy || isRestoring}
              onPress={async () => {
                if (!user) { router.push('/login'); return; }
                await logout();
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
          <Text style={styles.heroBody}>تصفّح الإعلانات أو ابحث عن شيء محدد بسهولة.</Text>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              accessibilityLabel="ابحث عن إعلان"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => { setSubmittedSearch(query.trim()); }}
              placeholder="ابحث عن إعلان أو سلعة…"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={styles.searchInput}
              textAlign="right"
            />
            {query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="مسح البحث" onPress={() => { setQuery(''); setSubmittedSearch(''); }}><Text style={styles.clearSearch}>×</Text></Pressable>}
          </View>
        </View>

        <View style={styles.quickActions}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/explore')} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
            <View style={[styles.quickIcon, { backgroundColor: colors.brandSoft }]}><Text style={[styles.quickGlyph, { color: colors.brand }]}>⌕</Text></View>
            <View style={styles.quickTextWrap}><Text style={styles.quickTitle}>استكشف السوق</Text><Text style={styles.quickSubtitle}>المتاجر والخدمات والمنتجات والقصص</Text></View>
            <Text style={styles.quickArrow}>‹</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/search')} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
            <View style={[styles.quickIcon, { backgroundColor: colors.infoSoft }]}><Text style={[styles.quickGlyph, { color: colors.info }]}>⚙</Text></View>
            <View style={styles.quickTextWrap}><Text style={styles.quickTitle}>بحث وفلاتر متقدمة</Text><Text style={styles.quickSubtitle}>حدد المدينة والسعر ونوع المحتوى</Text></View>
            <Text style={styles.quickArrow}>‹</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push(user ? '/add' : '/login')} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
            <View style={[styles.quickIcon, { backgroundColor: colors.warningSoft }]}><Text style={[styles.quickGlyph, { color: colors.warning }]}>＋</Text></View>
            <View style={styles.quickTextWrap}><Text style={styles.quickTitle}>إضافة جديد</Text><Text style={styles.quickSubtitle}>انشر إعلانًا أو أضف منتجًا أو خدمة</Text></View>
            <Text style={styles.quickArrow}>‹</Text>
          </Pressable>
        </View>



        <View style={styles.sectionHeader}>
          <SectionHeader title="أحدث الإعلانات" subtitle="من السوق المحلي" />
          <View style={styles.sectionActions}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters((value) => !value)}><Text style={styles.link}>{showFilters ? 'إخفاء الفلاتر' : 'تصفية النتائج'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { void loadAds(true); }}><Text style={styles.link}>تحديث</Text></Pressable>
          </View>
        </View>

        {showFilters ? <View style={styles.advancedFilters}>
          <Text style={styles.filterHeading}>تصفية النتائج</Text>
          <TextInput accessibilityLabel="المدينة" value={cityInput} onChangeText={setCityInput} placeholder="المدينة (مثلاً: غزة)" placeholderTextColor={colors.muted} textAlign="right" style={styles.filterInput} returnKeyType="done" />
          <View style={styles.priceInputs}>
            <TextInput accessibilityLabel="أقل سعر" value={minPriceInput} onChangeText={setMinPriceInput} keyboardType="decimal-pad" placeholder="أقل سعر" placeholderTextColor={colors.muted} textAlign="right" style={[styles.filterInput, styles.priceInput]} />
            <TextInput accessibilityLabel="أعلى سعر" value={maxPriceInput} onChangeText={setMaxPriceInput} keyboardType="decimal-pad" placeholder="أعلى سعر" placeholderTextColor={colors.muted} textAlign="right" style={[styles.filterInput, styles.priceInput]} />
          </View>
          {filterError ? <Text style={styles.filterError} accessibilityLiveRegion="polite">{filterError}</Text> : null}
          <View style={styles.sortRow}>
            <Text style={styles.filterCaption}>الترتيب:</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: sortBy === 'createdAt' }} onPress={() => { setSortBy('createdAt'); setSortOrder('desc'); }} style={[styles.filterChip, sortBy === 'createdAt' && styles.filterChipSelected]}><Text style={[styles.filterText, sortBy === 'createdAt' && styles.filterTextSelected]}>الأحدث</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: sortBy === 'price' }} onPress={() => { setSortBy('price'); setSortOrder('asc'); }} style={[styles.filterChip, sortBy === 'price' && styles.filterChipSelected]}><Text style={[styles.filterText, sortBy === 'price' && styles.filterTextSelected]}>الأقل سعرًا</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: sortBy === 'views' }} onPress={() => { setSortBy('views'); setSortOrder('desc'); }} style={[styles.filterChip, sortBy === 'views' && styles.filterChipSelected]}><Text style={[styles.filterText, sortBy === 'views' && styles.filterTextSelected]}>الأكثر مشاهدة</Text></Pressable>
          </View>
          <View style={styles.filterActions}><Pressable accessibilityRole="button" onPress={() => { setCityInput(''); setMinPriceInput(''); setMaxPriceInput(''); setFilters({}); setFilterError(null); setSortBy('createdAt'); setSortOrder('desc'); }} style={styles.clearFiltersButton}><Text style={styles.clearFiltersText}>مسح</Text></Pressable><Pressable accessibilityRole="button" onPress={applyFilters} style={styles.applyFiltersButton}><Text style={styles.applyFiltersText}>تطبيق الفلاتر</Text></Pressable></View>
        </View> : null}

        {adsSavedAt !== null && !loading ? (
          <View style={styles.cacheStatus} accessibilityLiveRegion="polite">
            <Text style={styles.cacheStatusText}>
              {adsFromCache ? 'نسخة محفوظة على الجهاز' : 'تمت مزامنة الإعلانات'}
              {' · '}{new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(adsSavedAt))}
            </Text>
          </View>
        ) : null}
        {loading ? (
          <SkeletonList count={4} />
        ) : errorMessage ? (
          <ErrorState
            title="لم نتمكن من تحميل الإعلانات"
            description={errorMessage}
            onAction={() => { void loadAds(); }}
          />
        ) : ads.length === 0 ? (
          <EmptyState
            title="لا توجد إعلانات مطابقة"
            description="جرّب كلمة بحث أخرى أو اسحب الشاشة للأسفل للتحديث."
          />
        ) : (
          <View style={styles.adsList}>
            {ads.map((ad) => {
              const imageUri = !failedImageIds.includes(ad.id) && Array.isArray(ad.images) ? ad.images.find((url) => typeof url === 'string' && /^(https?:|file:|content:)/i.test(url)) : undefined;
              return (
                <AdCard
                  key={ad.id}
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
            })}
          </View>
        )}
        {/* قسم المتاجر والقصص + المنتجات والخدمات والطلبات */}
        <HomeCommunitySections />
        <HomeMarketplaceSections />
        <View style={styles.servicesSection}>
          <View style={styles.sectionHeader}>
            <SectionHeader title="خدمات قريبة منك" actionLabel="كل الخدمات" onAction={() => router.push('/services')} />
          </View>
          {servicesLoading && serviceItems.length === 0 ? <View style={styles.serviceState}><ActivityIndicator size="small" color={colors.brand} /><Text style={styles.helperText}>جاري تحميل الخدمات…</Text></View> : null}
          {!servicesLoading && servicesError && serviceItems.length === 0 ? <View style={styles.serviceState}><Text style={styles.helperText}>تعذر تحميل الخدمات الآن.</Text><Pressable accessibilityRole="button" onPress={() => { void loadServices(true); }}><Text style={styles.link}>إعادة المحاولة</Text></Pressable></View> : null}
          {!servicesLoading && !servicesError && serviceItems.length === 0 ? <View style={styles.serviceState}><Text style={styles.helperText}>لا توجد خدمات متاحة حاليًا.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/services')}><Text style={styles.link}>تصفح الخدمات</Text></Pressable></View> : null}
          {serviceItems.length > 0 ? <View style={styles.serviceList}>{serviceItems.map((item) => {
            const imageUri = item.images?.find((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
            const provider = item.provider?.businessName || item.provider?.sellerProfile?.displayName || 'مقدم خدمة';
            return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`عرض الخدمة: ${item.title}`} onPress={() => router.push(`/services/${encodeURIComponent(item.id)}`)} style={styles.serviceCard}>
              {imageUri ? <AppImage uri={imageUri} style={styles.serviceImage} resizeMode="cover" /> : <View style={styles.serviceImagePlaceholder}><Text style={styles.servicePlaceholderGlyph}>✦</Text></View>}
              <View style={styles.serviceInfo}><Text numberOfLines={2} style={styles.serviceTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.serviceProvider}>{provider}</Text><Text style={styles.servicePrice}>{formatServicePrice(item)}</Text></View>
            </Pressable>;
          })}</View> : null}
          {user ? <Pressable accessibilityRole="button" onPress={() => router.push('/service-requests')} style={styles.serviceRequestsLink}><Text style={styles.serviceRequestsText}>متابعة طلبات الخدمات ←</Text></Pressable> : null}
        </View>

        {!loading && !errorMessage && ads.length > 0 && page < totalPages ? (
          <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => { void loadMoreAds(); }} style={[styles.loadMoreButton, loadingMore && styles.busyButton]}>
            {loadingMore ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.loadMoreText}>تحميل المزيد من الإعلانات</Text>}
          </Pressable>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: ux.pressedOpacity },
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 44, gap: spacing.xl },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm, minHeight: 58, gap: spacing.sm },
  brandRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  logo: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.white, fontSize: 25, fontWeight: '800' },
  brandName: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  brandSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2, textAlign: 'right' },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  accountButton: { minHeight: 44, minWidth: 64, paddingHorizontal: spacing.md, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  accountButtonText: { color: colors.brand, fontSize: 13, fontWeight: '800' },
  quickActions: { gap: spacing.sm },
  quickAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 64, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  quickIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickGlyph: { color: colors.brand, fontSize: 23, fontWeight: '800' },
  quickTextWrap: { flex: 1, gap: 4 },
  quickTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  quickSubtitle: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  quickArrow: { color: colors.muted, fontSize: 25 },
  hero: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.lg, overflow: 'hidden', gap: spacing.sm },
  eyebrow: { color: colors.brandSoft, fontSize: 13, textAlign: 'right' },
  heroTitle: { color: colors.white, fontSize: 22, fontWeight: '800', textAlign: 'right', lineHeight: 30 },
  heroBody: { color: colors.brandSoft, fontSize: 13, lineHeight: 20, textAlign: 'right' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: ux.minTouch + 8, gap: spacing.sm },
  searchIcon: { fontSize: 26, color: colors.brand, width: 25, textAlign: 'center' },
  searchInput: { flex: 1, color: colors.ink, fontSize: 15, paddingVertical: 12, writingDirection: 'rtl' },
  clearSearch: { color: colors.muted, fontSize: 24, paddingHorizontal: 4 },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: -spacing.sm, minHeight: 38, gap: spacing.sm },
  sectionActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  link: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  advancedFilters: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  filterHeading: { color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  filterInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas, borderRadius: radius.sm, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 13 },
  priceInputs: { flexDirection: 'row-reverse', gap: spacing.sm },
  priceInput: { flex: 1 },
  filterError: { color: colors.danger, fontSize: 12, textAlign: 'right' },
  sortRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  filterCaption: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  filterActions: { flexDirection: 'row-reverse', gap: spacing.sm },
  clearFiltersButton: { minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  clearFiltersText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  applyFiltersButton: { flex: 1, minHeight: 48, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  applyFiltersText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  servicesSection: { gap: spacing.md },
  serviceList: { gap: spacing.sm },
  serviceRequestsLink: { minHeight: 42, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: spacing.sm },
  serviceRequestsText: { color: colors.brand, fontSize: 13, fontWeight: '800' },
  serviceCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.sm, minHeight: 96, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  serviceImage: { width: 82, height: 82, borderRadius: radius.md, backgroundColor: colors.border },
  serviceImagePlaceholder: { width: 82, height: 82, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  servicePlaceholderGlyph: { color: colors.brand, fontSize: 28 },
  serviceInfo: { flex: 1, alignItems: 'flex-end', gap: 4 },
  serviceTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'right', width: '100%' },
  serviceProvider: { color: colors.muted, fontSize: 11, textAlign: 'right', width: '100%' },
  servicePrice: { color: colors.brand, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  serviceState: { minHeight: 60, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  loadMoreButton: { minHeight: Math.max(ux.minTouch + 8, 48), borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  loadMoreText: { color: colors.brand, fontSize: 14, fontWeight: '800' },
  busyButton: { opacity: 0.65 },
  adsList: { gap: spacing.md },
  filterRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  filterChip: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 42, justifyContent: 'center' },
  filterChipSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  filterTextSelected: { color: colors.brandDark },
  adCard: { position: 'relative', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', minHeight: 126 },
  adMain: { flexDirection: 'row-reverse', minHeight: 132, paddingTop: 30 },
  favoriteButton: { position: 'absolute', top: 5, right: 6, width: 38, height: 36, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  favoriteText: { color: colors.muted, fontSize: 20, lineHeight: 24 },
  favoriteActive: { color: colors.danger },
  adImage: { width: 120, minHeight: 132, backgroundColor: colors.border },
  adImagePlaceholder: { width: 120, minHeight: 132, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  placeholderEmoji: { fontSize: 32 },
  adInfo: { flex: 1, padding: spacing.md, gap: spacing.xs, alignItems: 'flex-end', justifyContent: 'center' },
  adTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'right', width: '100%' },
  adPrice: { color: colors.brand, fontSize: 15, fontWeight: '800', textAlign: 'right' },
  adMeta: { color: colors.muted, fontSize: 12, textAlign: 'right', width: '100%' },
  negotiable: { color: colors.brandDark, backgroundColor: colors.brandSoft, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, overflow: 'hidden' },
  cacheStatus: { alignSelf: 'flex-end', backgroundColor: colors.successSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  cacheStatusText: { color: colors.brandDark, fontSize: 11, fontWeight: '600', textAlign: 'right' },
  statusCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  statusEmoji: { fontSize: 32 },
  statusTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  statusText: { color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: 'center' },
  retryButton: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  retryText: { color: colors.white, fontWeight: '800' },
  helperText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  notice: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  noticeTitle: { color: colors.warning, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  noticeText: { color: colors.warning, fontSize: 12, lineHeight: 19, textAlign: 'right' },
});
