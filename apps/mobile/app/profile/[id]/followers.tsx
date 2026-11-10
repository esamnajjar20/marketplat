import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { FlatList, RefreshControl, View } from 'react-native';
import { Spinner } from '@/components/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchUserFollowList, type FollowListItem } from '@/features/account/social.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { AppImage } from '@/components/AppImage';
import { usePaginatedList } from '@/hooks/usePaginatedList';

const PAGE_SIZE = 20;
const itemKey = (item: FollowListItem) => item.id;

export default function FollowersScreen() {
  const { colors } = useAppTheme();

  const p = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(p.id) ? p.id[0] : p.id;
  const list = usePaginatedList<FollowListItem>({
    key: `user-followers:${id ?? 'missing'}`,
    pageSize: PAGE_SIZE,
    enabled: Boolean(id),
    fetchPage: async (requestedPage, signal) => {
      if (!id) throw new Error('معرّف المستخدم غير موجود.');
      const result = await fetchUserFollowList(id, 'followers', requestedPage, PAGE_SIZE, signal);
      return { items: result.items.filter((item) => Boolean(item.follower)), meta: result.meta };
    },
    getItemKey: itemKey,
  });

  return (
    <PageShell title="المتابعون" scroll={false}>
      {!id ? <Notice>معرّف المستخدم غير موجود.</Notice> : null}
      <FlatList
        data={list.items}
        keyExtractor={itemKey}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            {list.loading ? <Spinner color={colors.brand} /> : null}
            {list.error ? <Notice>{list.error}</Notice> : null}
            {list.error && list.items.length === 0 ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.refresh()} /> : null}
          </View>
        }
        ListEmptyComponent={!list.loading && !list.error && id ? <Notice tone="muted">لا يوجد متابعون بعد.</Notice> : undefined}
        renderItem={({ item }) => {
          const person = item.follower!;
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`عرض الملف الشخصي لـ ${person.name || 'مستخدم'}`} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: person.id } })}>
              <SectionCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
                  {person.avatarUrl ? (
                    <AppImage uri={person.avatarUrl} style={{ width: 54, height: 54, borderRadius: 27 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.ink, fontWeight: '700' }}>{(person.name || '?').slice(0, 1)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ textAlign: 'right', fontWeight: '700', fontSize: fontSizes[15], color: colors.ink }}>{person.name || 'مستخدم'}</Text>
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
          list.loadingMore ? <Spinner color={colors.brand} /> : list.loadMoreError ? (
            <View style={{ gap: spacing.sm }}>
              <Notice>{list.loadMoreError}</Notice>
              <PrimaryButton label="إعادة محاولة تحميل المزيد" variant="secondary" onPress={() => void list.loadMore()} />
            </View>
          ) : list.hasNextPage ? <PrimaryButton label="تحميل المزيد" variant="secondary" onPress={() => void list.loadMore()} /> : undefined
        }
        onEndReached={() => { void list.loadMore(); }}
        onEndReachedThreshold={0.4}
      />
    </PageShell>
  );
}
