import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchUserFollowList, type FollowListItem } from '@/features/account/social.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { AppImage } from '@/components/AppImage';

export default function FollowingScreen() {
  const p = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(p.id) ? p.id[0] : p.id;
  const [items, setItems] = useState<FollowListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const limit = 20;

  const load = useCallback(async (reset = true) => {
    if (!id) {
      setError('معرّف المستخدم غير موجود.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (reset) {
      setRefreshing(items.length > 0);
      setLoading(items.length === 0);
      setError('');
    } else {
      if (loadingMore || loading || page >= totalPages) return;
      setLoadingMore(true);
    }
    const requestedPage = reset ? 1 : page + 1;
    try {
      const result = await fetchUserFollowList(id, 'following', requestedPage, limit);
      const pageItems = result.items.filter((item) => item.targetType === 'USER' && item.target);
      setItems((old) => {
        if (reset) return pageItems;
        const ids = new Set(old.map((item) => item.id));
        return [...old, ...pageItems.filter((item) => !ids.has(item.id))];
      });
      setPage(result.meta?.page ?? requestedPage);
      setTotalPages(result.meta?.totalPages ?? (pageItems.length < limit ? requestedPage : requestedPage + 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل القائمة.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [id, items.length, loading, loadingMore, page, totalPages]);

  // The effect resets only when its identity/auth scope changes; load also depends on paging state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(true); }, [id]);

  return (
    <PageShell title="يتابع هذا المستخدم" scroll={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            {loading ? <ActivityIndicator color={colors.brand} /> : null}
            {error ? <Notice>{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={!loading && !error ? <Notice tone="muted">لا توجد حسابات يتابعها هذا المستخدم.</Notice> : undefined}
        renderItem={({ item }) => {
          const person = item.target!;
          return (
            <Pressable onPress={() => router.push({ pathname: '/profile/[id]', params: { id: person.id } })}>
              <SectionCard>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 14, minHeight: 56 }}>
                  {person.avatarUrl ? (
                    <AppImage uri={person.avatarUrl} style={{ width: 54, height: 54, borderRadius: 27 }} />
                  ) : (
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: colors.ink, fontWeight: '900' }}>{(person.name || '?').slice(0, 1)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ textAlign: 'right', fontWeight: '900', fontSize: fontSizes[15], color: colors.ink }}>
                      {person.name || 'مستخدم'}
                    </Text>
                    <Text style={{ textAlign: 'right', color: colors.muted }}>{person.city || ''}</Text>
                  </View>
                  <Text style={{ color: colors.brand }}>عرض ←</Text>
                </View>
              </SectionCard>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.brand} /> : page < totalPages ? (
            <PrimaryButton label="تحميل المزيد" variant="secondary" onPress={() => void load(false)} />
          ) : items.length > 0 ? <PrimaryButton label="تحديث" variant="secondary" onPress={() => void load(true)} /> : undefined
        }
        onEndReached={() => { if (!loading && !loadingMore && page < totalPages) void load(false); }}
        onEndReachedThreshold={0.4}
      />
    </PageShell>
  );
}
