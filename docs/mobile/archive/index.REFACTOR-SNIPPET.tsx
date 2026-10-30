/**
 * مقتطف توضيحي — كيف تصبح بداية app/index.tsx بعد ربط useHomeScreenState.
 * انسخ الجزء المتعلق بالـ state فقط؛ اترك JSX كما هو مع استبدال أسماء الدوال.
 */
import { useCallback, useEffect, useRef } from 'react';
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
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, ux } from '@/theme/tokens';
import { AppImage } from '@/components/AppImage';
import { AdCard } from '@/components/MarketCards';
import { useAuth } from '@/features/auth/AuthContext';
import type { ServiceListing } from '@/features/services/services.api';
import HomeCommunitySections from '@/features/discovery/HomeCommunitySections';
import HomeMarketplaceSections from '@/features/discovery/HomeMarketplaceSections';
import { formatPrice, formatServicePrice } from '@/features/discovery/homeFormatters';
import { useHomeAds } from '@/features/discovery/useHomeAds';
import { useHomeServices } from '@/features/discovery/useHomeServices';
import { useHomeScreenState } from '@/features/discovery/useHomeScreenState';
import { useOnlineResync } from '@/lib/useOnlineResync';

export default function HomeScreen() {
  const { user, logout, isBusy, isRestoring } = useAuth();

  // ——— الحالة مستخرجة إلى hook ———
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
    resetFilters,
    sortBy,
    sortOrder,
    setSort,
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

  // ——— بقية JSX كما في الملف الأصلي مع التعديلات التالية ———
  // onSubmitEditing={() => submitSearch()}
  // onPress clear → clearSearch()
  // زر تطبيق الفلاتر → applyFilters()
  // زر إعادة تعيين → resetFilters()
  // onToggleFavorite={() => void toggleFavorite(ad.id)}
  // isFavorite={favoriteIds.includes(ad.id)}

  return null; // استبدل بـ JSX الأصلي بعد الربط
}
