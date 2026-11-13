import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { RefreshControl, View } from 'react-native';
import { Avatar, ListEmpty, ListStaleError, PaginatedFooter, Notice, PageShell, SectionCard } from '@/components/ui';
import { useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { fetchUserFollowList, type FollowListItem } from '@/features/account/social.api';
import { spacing } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';

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
      <AppFlashList
        data={list.items}
        keyExtractor={itemKey}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <ListStaleError list={list} />
          </View>
        }
        ListEmptyComponent={id ? <ListEmpty list={list} loadingMessage="جاري تحميل المتابعين…" errorTitle="تعذر تحميل المتابعين" emptyTitle="لا يوجد متابعون بعد" /> : undefined}
        renderItem={({ item }) => {
          const person = item.follower!;
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`عرض الملف الشخصي لـ ${person.name || 'مستخدم'}`} onPress={() => pushOnce({ pathname: '/profile/[id]', params: { id: person.id } })}>
              <SectionCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 56 }}>
                  <Avatar uri={person.avatarUrl} name={person.name} size="md" />
                  <View style={{ flex: 1 }}>
                    <Text tone="ink" strong size={15}>{person.name || 'مستخدم'}</Text>
                    <Text tone="muted">{person.city || ''}</Text>
                  </View>
                  <Text style={{ color: colors.brand }}>عرض ←</Text>
                </View>
              </SectionCard>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={ListGapMd}
        ListFooterComponent={
          <PaginatedFooter list={list} />
        }
        onEndReached={() => { void list.loadMore(); }}
        onEndReachedThreshold={0.4}
      />
    </PageShell>
  );
}
