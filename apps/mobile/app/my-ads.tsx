import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError } from '@/api/client';
import { deleteAd, fetchMyAds, type ManagedAd } from '@/features/ads/manage-ads.api';
import { enqueueMutation } from '@/storage/mutation-outbox';
import { useAuth } from '@/features/auth/AuthContext';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '@/components/MobileUI';
import { colors, spacing, typography } from '@/theme/tokens';

export default function MyAdsScreen() {
  const { user, accessToken, csrfToken } = useAuth();
  const netInfo = useNetInfo();
  const online = netInfo.isConnected === true && netInfo.isInternetReachable !== false;
  const [ads, setAds] = useState<ManagedAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setError('سجّل الدخول لعرض إعلاناتك.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setAds(await fetchMyAds(accessToken));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل إعلاناتك.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = (ad: ManagedAd) => {
    Alert.alert(
      'حذف الإعلان',
      online
        ? `هل تريد حذف «${ad.title}»؟`
        : `لا يوجد اتصال. هل تريد حفظ طلب حذف «${ad.title}» للمزامنة عند عودة الإنترنت؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: online ? 'حذف' : 'حفظ طلب الحذف',
          style: 'destructive',
          onPress: () => {
            if (!accessToken || !user?.id) return;
            setBusyId(ad.id);
            const work = online
              ? deleteAd(ad.id, accessToken, csrfToken).then(() =>
                  setAds((current) => current.filter((item) => item.id !== ad.id)),
                )
              : enqueueMutation({
                  ownerId: String(user.id),
                  id: `offline-delete:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`,
                  operation: 'delete-ad',
                  resourceId: ad.id,
                  payload: { title: ad.title },
                  idempotencyKey: `offline-op:delete:${ad.id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
                }).then(() => {
                  Alert.alert(
                    'تم حفظ طلب الحذف',
                    'لم يُحذف الإعلان من الخادم بعد. سيُرسل طلب الحذف عند عودة الاتصال وتوفر جلسة دخول صالحة.',
                  );
                });
            void work
              .catch((e) =>
                Alert.alert(
                  'تعذر حفظ طلب الحذف',
                  e instanceof ApiError || e instanceof Error ? e.message : 'حاول مرة أخرى.',
                ),
              )
              .finally(() => setBusyId(null));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="إعلاناتي"
        right={
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/offline-queue')} hitSlop={6}>
              <Text style={styles.link}>دون اتصال</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/ad-editor')} hitSlop={6}>
              <Text style={styles.link}>＋ إضافة</Text>
            </Pressable>
          </View>
        }
      />

      {!user ? (
        <EmptyState
          title="سجّل الدخول أولًا"
          description="إدارة إعلاناتك تتطلب حسابًا مسجّلًا."
          actionLabel="تسجيل الدخول"
          onAction={() => router.push('/login')}
        />
      ) : loading ? (
        <LoadingState message="جاري تحميل إعلاناتك…" />
      ) : error ? (
        <ErrorState title="تعذر تحميل الإعلانات" description={error} onAction={() => void load()} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {ads.length === 0 ? (
            <EmptyState
              title="لم تنشر أي إعلان بعد"
              description="ابدأ بنشر إعلانك الأول ليظهر في السوق."
              actionLabel="إضافة إعلان"
              onAction={() => router.push('/ad-editor')}
            />
          ) : (
            ads.map((ad) => (
              <SectionCard key={ad.id}>
                <Text style={styles.adTitle}>{ad.title}</Text>
                <Text style={styles.meta}>
                  {[ad.city, ad.status || 'الحالة غير متاحة'].filter(Boolean).join(' · ')}
                </Text>
                <View style={styles.actions}>
                  <SecondaryButton
                    label="تعديل"
                    onPress={() => router.push({ pathname: '/ad-editor', params: { id: ad.id } })}
                  />
                  <PrimaryButton
                    label={busyId === ad.id ? 'جارٍ الحذف…' : online ? 'حذف' : 'حفظ طلب الحذف'}
                    variant="danger"
                    busy={busyId === ad.id}
                    onPress={() => remove(ad)}
                  />
                </View>
              </SectionCard>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  headerActions: { flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'center' },
  link: { color: colors.brand, ...typography.captionStrong },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  adTitle: { ...typography.bodyStrong, color: colors.ink, textAlign: 'right' },
  meta: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  actions: { gap: spacing.sm },
});
