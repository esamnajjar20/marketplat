import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchFavoriteAds, setFavoriteAdState, type FavoriteRecord } from '@/features/ads/favorites.api';
import {
  enqueueFavoriteState,
  listPendingFavoriteStates,
  readFavoriteAdIds,
  writeFavoriteAdIds,
} from '@/features/ads/favorites.store';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
} from '@/components/MobileUI';
import { AdCard } from '@/components/MarketCards';
import { colors, spacing, typography } from '@/theme/tokens';

function priceLabel(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'السعر عند التواصل';
  const n = Number(value);
  return Number.isFinite(n)
    ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(n)} ₪`
    : String(value);
}

export default function FavoritesScreen() {
  const { user, accessToken, csrfToken } = useAuth();
  const net = useNetInfo();
  const online = net.isConnected === true && net.isInternetReachable !== false;
  const [items, setItems] = useState<FavoriteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      setItems([]);
      setLoading(false);
      setError('سجّل الدخول لعرض المفضلة المتزامنة مع حسابك.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [records, pending] = await Promise.all([
        fetchFavoriteAds(accessToken),
        user?.id ? listPendingFavoriteStates(user.id) : Promise.resolve([]),
      ]);
      const desiredState = new Map(pending.map((operation) => [operation.adId, operation.favorited]));
      setItems(records.filter((record) => desiredState.get(record.adId) !== false));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المفضلة.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = (record: FavoriteRecord) => {
    if (!record.adId || !user?.id) return;
    Alert.alert('إزالة من المفضلة', `إزالة «${record.ad?.title || 'هذا الإعلان'}» من المفضلة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: online ? 'إزالة' : 'حفظ للتزامن',
        style: 'destructive',
        onPress: () => {
          setBusyId(record.adId);
          const operationId = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const work =
            online && accessToken
              ? setFavoriteAdState(record.adId, false, accessToken, operationId, csrfToken)
              : enqueueFavoriteState({
                  userId: user.id,
                  adId: record.adId,
                  favorited: false,
                  previousFavorited: true,
                  operationId,
                });
          void Promise.resolve(work)
            .then(async () => {
              const ids = await readFavoriteAdIds(user.id);
              await writeFavoriteAdIds(
                ids.filter((id) => id !== record.adId),
                user.id,
              );
              setItems((current) => current.filter((item) => item.adId !== record.adId));
            })
            .catch((e) =>
              Alert.alert(
                'تعذر إزالة الإعلان',
                e instanceof ApiError || e instanceof Error ? e.message : 'حاول مرة أخرى.',
              ),
            )
            .finally(() => setBusyId(null));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="المفضلة"
        right={
          user ? (
            <Pressable accessibilityRole="button" onPress={() => void load()} hitSlop={8}>
              <Text style={styles.link}>تحديث</Text>
            </Pressable>
          ) : undefined
        }
      />

      {!user ? (
        <View style={styles.center}>
          <EmptyState
            title="سجّل الدخول لعرض مفضلتك"
            description="المفضلة تُزامَن مع حسابك عبر الأجهزة."
            actionLabel="تسجيل الدخول"
            onAction={() => router.push('/login')}
          />
        </View>
      ) : loading ? (
        <LoadingState message="جاري تحميل المفضلة…" />
      ) : error ? (
        <ErrorState title="تعذر تحميل المفضلة" description={error} onAction={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد عناصر في المفضلة"
          description="احفظ الإعلانات التي تهمك من صفحة التفاصيل أو الرئيسية."
          actionLabel="تصفح الإعلانات"
          onAction={() => router.replace('/')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.count}>{items.length} إعلان محفوظ</Text>
          <View style={styles.list}>
            {items.map((record) => {
              const ad = record.ad;
              const title = ad?.title || 'إعلان محفوظ';
              const imageUri = ad?.images?.find(
                (url) => typeof url === 'string' && /^https?:\/\//i.test(url),
              );
              return (
                <AdCard
                  key={record.adId}
                  title={title}
                  price={priceLabel(ad?.price)}
                  meta={[ad?.city, ad?.category?.nameAr || ad?.category?.name]
                    .filter(Boolean)
                    .join(' · ') || 'إعلان محلي'}
                  imageUri={imageUri}
                  isFavorite
                  isNegotiable={Boolean(ad?.isNegotiable)}
                  onPress={() => router.push(`/ads/${encodeURIComponent(record.adId)}`)}
                  onToggleFavorite={
                    busyId === record.adId ? undefined : () => remove(record)
                  }
                />
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  link: { color: colors.brand, ...typography.captionStrong },
  center: { flex: 1, justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  count: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  list: { gap: spacing.md },
});
