import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { marketListPerf } from '@/lib/listPerformance';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError } from '@/api/client';
import { deleteAd, fetchMyAdsPage, type ManagedAd } from '@/features/ads/manage-ads.api';
import { enqueueMutation, listAllOutboxMutations } from '@/storage/outbox-manager';
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
  const { user, getAccessToken, csrfToken, isRestoring } = useAuth();
  const netInfo = useNetInfo();
  const online = netInfo.isConnected === true && netInfo.isInternetReachable !== false;
  const [ads, setAds] = useState<ManagedAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(() => new Set());
  const [failedDeleteIds, setFailedDeleteIds] = useState<Set<string>>(() => new Set());
  const [queueReadError, setQueueReadError] = useState('');
  const [moreError, setMoreError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seq = useRef(0);
  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    const current = ++seq.current;
    const token = getAccessToken();
    if (isRestoring) return;
    if (!token) {
      setLoading(false);
      setError('سجّل الدخول لعرض إعلاناتك.');
      return;
    }
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const result = await fetchMyAdsPage(token, 1, 30);
      if (current === seq.current) { setAds(result.items); setPage(result.page); setTotalPages(result.totalPages); }
      if (user?.id) {
        try {
          const queued = await listAllOutboxMutations(String(user.id), { unlimited: true });
          const deletes = queued.filter((mutation) => mutation.operation === 'delete-ad');
          setPendingDeleteIds(new Set(deletes.map((mutation) => mutation.resourceId)));
          setFailedDeleteIds(new Set(deletes.filter((mutation) => mutation.state === 'failed').map((mutation) => mutation.resourceId)));
          setQueueReadError('');
        } catch { setQueueReadError('تعذر قراءة حالة عمليات الحذف المحفوظة. افتح مركز العمليات للتحقق منها.'); }
      }
    } catch (e) {
      if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل إعلاناتك.');
    } finally {
      if (current === seq.current) { hasLoadedRef.current = true; setLoading(false); }
    }
  }, [getAccessToken, isRestoring, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { seq.current += 1; };
    }, [load]),
  );

  const loadMore = async () => {
    const token = getAccessToken(); if (!token || loadingMore || page >= totalPages) return;
    const current = seq.current; setLoadingMore(true); setMoreError(null);
    try { const result = await fetchMyAdsPage(token, page + 1, 30); if (current === seq.current) { setAds((old) => { const ids = new Set(old.map((item) => item.id)); return [...old, ...result.items.filter((item) => !ids.has(item.id))]; }); setPage(result.page); setTotalPages(result.totalPages); } }
    catch (e) { if (current === seq.current) setMoreError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من الإعلانات.'); }
    finally { if (current === seq.current) setLoadingMore(false); }
  };

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
            const token = getAccessToken();
            if (!token || !user?.id || busyId) return;
            setBusyId(ad.id);
            const enqueueOfflineDelete = () =>
              enqueueMutation({
                ownerId: String(user.id),
                id: `offline-delete:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`,
                operation: 'delete-ad',
                resourceId: ad.id,
                payload: { title: ad.title },
                idempotencyKey: `offline-op:delete:${ad.id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
              }).then(() => {
                // Keep queue state separate from server-owned status fields.
                setPendingDeleteIds((current) => new Set(current).add(ad.id));
                Alert.alert(
                  'تم حفظ طلب الحذف',
                  'لم يُحذف الإعلان من الخادم بعد. سيُرسل طلب الحذف عند عودة الاتصال وتوفر جلسة دخول صالحة.',
                );
              });
            const work = online
              ? deleteAd(ad.id, token, csrfToken)
                  .then(() => setAds((current) => current.filter((item) => item.id !== ad.id)))
                  .catch((err) => {
                    // Session expired mid-action — preserve delete intent in outbox.
                    if (err instanceof ApiError && (err.status === undefined || err.status === 401)) {
                      return enqueueOfflineDelete();
                    }
                    throw err;
                  })
              : enqueueOfflineDelete();
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

      {isRestoring ? (
        <LoadingState message="جارٍ استعادة الجلسة…" />
      ) : !user ? (
        <EmptyState
          title="سجّل الدخول أولًا"
          description="إدارة إعلاناتك تتطلب حسابًا مسجّلًا."
          actionLabel="تسجيل الدخول"
          onAction={() => router.push('/login')}
        />
      ) : loading ? (
        <LoadingState message="جاري تحميل إعلاناتك…" />
      ) : error && ads.length === 0 ? (
        <ErrorState title="تعذر تحميل الإعلانات" description={error} onAction={() => void load()} />
      ) : (
        <FlatList
          data={ads}
          keyExtractor={(ad) => ad.id}
          {...marketListPerf}
          contentContainerStyle={styles.list}
          ListHeaderComponent={error || queueReadError ? <View style={{ gap: spacing.sm }}>{error ? <ErrorState title="تعذر تحديث الإعلانات" description={error} onAction={() => void load()} /> : null}{queueReadError ? <Text style={{ color: colors.danger, textAlign: 'right' }}>{queueReadError}</Text> : null}</View> : null}
          ListEmptyComponent={
            <EmptyState
              title="لم تنشر أي إعلان بعد"
              description="ابدأ بنشر إعلانك الأول ليظهر في السوق."
              actionLabel="إضافة إعلان"
              onAction={() => router.push('/ad-editor')}
            />
          }
          renderItem={({ item: ad }) => (
            <SectionCard>
              <Text style={styles.adTitle}>{ad.title}</Text>
              <Text style={styles.meta}>
                {[ad.city, failedDeleteIds.has(ad.id) ? 'تعذر الحذف — راجع مركز العمليات' : pendingDeleteIds.has(ad.id) ? 'قيد الحذف — بانتظار المزامنة' : ({ ACTIVE: 'نشط', PENDING: 'قيد المراجعة', SOLD: 'مباع', EXPIRED: 'منتهي', REJECTED: 'مرفوض', DELETED: 'محذوف' } as Record<string, string>)[ad.status || ''] || ad.status || 'الحالة غير متاحة'].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.actions}>
                <SecondaryButton
                  label="تعديل"
                  onPress={() => router.push({ pathname: '/ad-editor', params: { id: ad.id } })}
                />
                <PrimaryButton
                  label={failedDeleteIds.has(ad.id) ? 'مراجعة عملية الحذف' : pendingDeleteIds.has(ad.id) ? 'بانتظار المزامنة' : busyId === ad.id ? 'جارٍ الحذف…' : online ? 'حذف' : 'حفظ طلب الحذف'}
                  variant="danger"
                  busy={busyId === ad.id}
                  disabled={busyId === ad.id || pendingDeleteIds.has(ad.id)}
                  onPress={() => failedDeleteIds.has(ad.id) ? router.push('/offline-queue') : remove(ad)}
                />
              </View>
            </SectionCard>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListFooterComponent={ads.length ? (
            <View style={{ gap: spacing.sm }}>
              {moreError ? <ErrorState title="تعذر تحميل المزيد" description={moreError} onAction={() => void loadMore()} /> : null}
              {page < totalPages ? <PrimaryButton label={loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'} variant="secondary" busy={loadingMore} onPress={() => void loadMore()} /> : null}
            </View>
          ) : null}
        />
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
