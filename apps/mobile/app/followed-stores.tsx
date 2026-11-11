import { useAppTheme } from '@/theme/ThemeProvider';
import { marketListPerf } from '@/lib/listPerformance';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { router } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { fetchMyFollowedStores, toggleStoreFollow, type FollowedStoreRow } from '@/features/commerce/commerce.api';
import { AppHeader, EmptyState, ErrorState, LoadingState, PrimaryButton, SearchBar } from '@/components/MobileUI';
import { AppImage } from '@/components/AppImage';
import { fontSizes, radius, spacing } from '@/theme/tokens';
export default function FollowedStoresScreen() {
  const { colors } = useAppTheme();

  const { getAccessToken, user, csrfToken, isRestoring } = useAuth();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const {
    items,
    loading,
    refreshing,
    loadingMore,
    error,
    loadMoreError,
    hasNextPage,
    refresh,
    loadMore,
    updateItems,
  } = usePaginatedList<FollowedStoreRow>({
    key: user?.id ?? 'guest',
    enabled: !isRestoring && Boolean(user),
    pageSize: 30,
    fetchPage: async (page, signal) => {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
      const result = await fetchMyFollowedStores(token, page, 30, signal);
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages } };
    },
    getItemKey: (item) => item.store.id,
  });

  const unfollow = async (row: FollowedStoreRow) => {
    const token = getAccessToken();
    if (!token || busyId) return;
    setBusyId(row.store.id);
    setActionError('');
    try {
      await toggleStoreFollow(row.store.id, token, csrfToken);
      updateItems((current) => current.filter((item) => item.store.id !== row.store.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'تعذر إلغاء متابعة المتجر.');
    } finally {
      setBusyId(null);
    }
  };

  const visible = items.filter((item) =>
    `${item.store.name} ${item.store.city || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <ScreenFrame>
      <AppHeader title="المتاجر التي أتابعها" />
      {isRestoring ? (
        <LoadingState message="جارٍ استعادة الجلسة…" />
      ) : !user ? (
        <EmptyState title="سجّل الدخول لعرض متابعاتك" actionLabel="تسجيل الدخول" onAction={() => pushOnce('/login')} />
      ) : loading && items.length === 0 ? (
        <LoadingState message="جاري تحميل المتاجر…" />
      ) : error && items.length === 0 ? (
        <ErrorState title="تعذر تحميل المتاجر" description={error} onAction={() => void refresh()} />
      ) : (
        <FlatList
          {...marketListPerf}
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.x4l }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.brand} />}
          ListHeaderComponent={(
            <View style={{ gap: spacing.md }}>
              <SearchBar value={query} onChangeText={setQuery} onSubmit={() => undefined} onClear={() => setQuery('')} placeholder="ابحث باسم المتجر أو المدينة…" />
              {error ? <ErrorState title="تعذر تحديث القائمة" description={error} onAction={() => void refresh()} /> : null}
              {actionError ? <ErrorState title="تعذر إلغاء المتابعة" description={actionError} onAction={() => setActionError('')} /> : null}
            </View>
          )}
          ListEmptyComponent={(
            <EmptyState
              title={query ? 'لا توجد متاجر مطابقة' : 'لم تتابع أي متجر بعد'}
              description={query ? 'جرّب اسمًا آخر.' : 'اكتشف المتاجر وتابع ما يهمك.'}
              actionLabel="اكتشاف المتاجر"
              onAction={() => router.push('/stores')}
            />
          )}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
              <Pressable accessibilityRole="button" onPress={() => router.push(`/stores/${encodeURIComponent(item.store.id)}`)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <AppImage uri={item.store.logoUrl} style={{ width: 64, height: 64, borderRadius: radius.md }} />
                <View style={{ flex: 1, alignItems: 'flex-end', gap: 5 }}>
                  <Text tone="ink" strong>{item.store.name}</Text>
                  <Text numberOfLines={2} tone="muted">{item.store.description || 'متجر محلي'}</Text>
                  <Text style={{ color: colors.brand, fontSize: fontSizes[12] }}>{item.store.city || 'الموقع غير محدد'}</Text>
                </View>
              </Pressable>
              <PrimaryButton label={busyId === item.store.id ? '…' : 'إلغاء المتابعة'} variant="secondary" disabled={Boolean(busyId)} busy={busyId === item.store.id} onPress={() => void unfollow(item)} />
            </View>
          )}
          ListFooterComponent={hasNextPage || loadMoreError ? (
            <View style={{ gap: spacing.sm }}>
              {loadMoreError ? <ErrorState title="تعذر تحميل المزيد" description={loadMoreError} onAction={() => void loadMore()} /> : null}
              {hasNextPage ? <PrimaryButton label={loadingMore ? 'جارٍ التحميل…' : loadMoreError ? 'إعادة المحاولة' : 'تحميل المزيد'} variant="secondary" busy={loadingMore} onPress={() => void loadMore()} /> : null}
            </View>
          ) : undefined}
        />
      )}
    </ScreenFrame>
  );
}