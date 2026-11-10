import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useRef, useState , useMemo} from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';
import { marketListPerf } from '@/lib/listPerformance';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError } from '@/api/client';
import { deleteAd, fetchMyAdsPage, mergeRefreshedAdsPage, type ManagedAd } from '@/features/ads/manage-ads.api';
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
import { spacing, typography } from '@/theme/tokens';

export default function MyAdsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

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
  const pageAbortRef = useRef<AbortController | null>(null);
  const adsRef = useRef<ManagedAd[]>(ads);
  const pageRef = useRef(page);
  adsRef.current = ads;
  pageRef.current = page;
  const hasLoadedRef = useRef(false);
  const load = useCallback(async (options: { preservePages?: boolean; signal?: AbortSignal } = {}) => {
    const current = ++seq.current;
    const preservePages = options.preservePages === true;
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
      const result = await fetchMyAdsPage(token, 1, 30, options.signal);
      if (current === seq.current) {
        if (preservePages && adsRef.current.length > 0) {
          // Refresh page one without discarding pages the user already loaded or
          // resetting the FlatList scroll position after returning from a detail.
          setAds(mergeRefreshedAdsPage(adsRef.current, result.items, result.totalPages, 30));
          setPage(Math.max(1, Math.min(pageRef.current, result.totalPages || 1)));
        } else {
          setAds(result.items);
          setPage(result.page);
        }
        setTotalPages(result.totalPages);
        // Mark the list loaded as soon as its page data is ready; local outbox
        // inspection below must not delay the refresh/pagination preservation state.
        hasLoadedRef.current = true;
        setLoading(false);
      }
      if (current === seq.current && user?.id) {
        try {
          const queued = await listAllOutboxMutations(String(user.id), { unlimited: true });
          const deletes = queued.filter((mutation) => mutation.operation === 'delete-ad');
          setPendingDeleteIds(new Set(deletes.map((mutation) => mutation.resourceId).filter((id): id is string => id !== null)));
          setFailedDeleteIds(new Set(deletes.filter((mutation) => mutation.state === 'failed').map((mutation) => mutation.resourceId).filter((id): id is string => id !== null)));
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
      const controller = new AbortController();
      void load({ preservePages: hasLoadedRef.current, signal: controller.signal });
      return () => {
        controller.abort();
        pageAbortRef.current?.abort();
        pageAbortRef.current = null;
        seq.current += 1;
        setLoadingMore(false);
      };
    }, [load]),
  );

  const loadMore = async () => {
    const token = getAccessToken(); if (!token || loadingMore || page >= totalPages) return;
    const current = seq.current;
    const controller = new AbortController();
    pageAbortRef.current = controller;
    setLoadingMore(true); setMoreError(null);
    try {
      const result = await fetchMyAdsPage(token, page + 1, 30, controller.signal);
      if (current === seq.current) {
        setAds((old) => { const ids = new Set(old.map((item) => item.id)); return [...old, ...result.items.filter((item) => !ids.has(item.id))]; });
        setPage(result.page); setTotalPages(result.totalPages);
      }
    } catch (e) {
      if (current === seq.current && !(e instanceof ApiError && e.code === 'REQUEST_CANCELLED')) {
        setMoreError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من الإعلانات.');
      }
    } finally {
      if (pageAbortRef.current === controller) pageAbortRef.current = null;
      if (current === seq.current) setLoadingMore(false);
    }
  };

  const remove = (ad: ManagedAd) => {
    confirmAlert(
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
                showToast('تم حفظ طلب الحذف', 'لم يُحذف الإعلان من الخادم بعد. سيُرسل طلب الحذف عند عودة الاتصال وتوفر جلسة دخول صالحة.', 'info');
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
                showToast('تعذر حفظ طلب الحذف', e instanceof ApiError || e instanceof Error ? e.message : 'حاول مرة أخرى.', 'error'),
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
          ListHeaderComponent={error || queueReadError ? <View style={{ gap: spacing.sm }}>{error ? <ErrorState title="تعذر تحديث الإعلانات" description={error} onAction={() => void load()} /> : null}{queueReadError ? <Text tone="danger">{queueReadError}</Text> : null}</View> : undefined}
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
          ) : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  headerActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  link: { color: colors.brand, ...typography.captionStrong },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.x4l },
  adTitle: { ...typography.bodyStrong, color: colors.ink, textAlign: 'right' },
  meta: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  actions: { gap: spacing.sm },
});
