import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';

import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { Avatar, Spinner, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { confirmAlert } from '@/lib/confirm';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchBlockedUsers, unblockUser, type BlockedUserItem } from '@/features/account/social.api';
import { spacing } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { AppFlashList } from '@/components/ui/AppFlashList';

const blockedKeyExtractor = (item: BlockedUserItem) => item.id;
const PAGE_SIZE = 50;

export default function BlockedUsersScreen() {
  const { colors } = useAppTheme();

  const { accessToken, csrfToken } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const list = usePaginatedList<BlockedUserItem>({
    key: accessToken ?? 'signed-out',
    pageSize: PAGE_SIZE,
    enabled: Boolean(accessToken),
    fetchPage: async (page, signal) => {
      if (!accessToken) throw new Error('سجّل الدخول لإدارة قائمة الحظر.');
      return fetchBlockedUsers(accessToken, page, PAGE_SIZE, signal);
    },
    getItemKey: (item) => item.id,
    mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل قائمة الحظر.'),
  });
  const error = actionError || list.error || '';
  const items = list.items.filter((item) => item.blocked);
  const refreshList = useCallback(() => { void list.refresh(); }, [list.refresh]);

  const unblock = (item: BlockedUserItem) => {
    const person = item.blocked;
    if (!person) return;
    confirmAlert('إلغاء الحظر', `هل تريد إلغاء حظر ${person.name || 'هذا المستخدم'}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إلغاء الحظر',
        onPress: () => {
          void (async () => {
            if (!accessToken) {
              pushOnce('/login');
              return;
            }
            setBusyId(person.id);
            setActionError('');
            try {
              await unblockUser(person.id, accessToken, csrfToken);
              list.updateItems((current) => current.filter((row) => row.blockedId !== person.id));
              // Refill page 1 so offset-based pagination cannot skip the row
              // that shifted up after this deletion.
              await list.refresh();
            } catch (e) {
              setActionError(e instanceof Error ? e.message : 'تعذر إلغاء الحظر.');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <PageShell title="المستخدمون المحظورون" scroll={false}>
      {!accessToken ? (
        <>
          <Notice>سجّل الدخول لإدارة قائمة الحظر.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
        </>
      ) : (
        <AppFlashList refreshControl={<BrandRefreshControl refreshing={list.refreshing} onRefresh={refreshList} />}
          data={items}
          keyExtractor={blockedKeyExtractor}
          contentContainerStyle={{ paddingBottom: spacing.x4l }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              {list.loading ? <Spinner color={colors.brand} /> : null}
              {error ? <Notice>{error}</Notice> : null}
            </View>
          }
          ListEmptyComponent={
            !list.loading && !list.error ? <Notice tone="muted">لا يوجد مستخدمون محظورون حاليًا.</Notice> : undefined
          }
          renderItem={({ item }) => {
            const person = item.blocked!;
            return (
              <SectionCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}>
                  <Avatar uri={person.avatarUrl} name={person.name} size="md" />
                  <View style={{ flex: 1, alignItems: 'flex-start' }}>
                    <Text tone="ink" strong>
                      {person.name || 'مستخدم'}
                    </Text>
                  </View>
                  <PrimaryButton
                    label={busyId === person.id ? '…' : 'إلغاء الحظر'}
                    variant="secondary"
                    busy={busyId === person.id}
                    onPress={() => unblock(item)}
                  />
                </View>
              </SectionCard>
            );
          }}
          ItemSeparatorComponent={ListGapMd}
          onEndReached={() => { void list.loadMore(); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={list.loadingMore ? <Spinner color={colors.brand} /> : list.loadMoreError ? (
            <View style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
              <Notice>{list.loadMoreError}</Notice>
              <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.loadMore()} />
            </View>
          ) : list.hasNextPage ? <PrimaryButton label="تحميل المزيد" variant="secondary" onPress={() => void list.loadMore()} /> : undefined}
        />
      )}
    </PageShell>
  );
}
