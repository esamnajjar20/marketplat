import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';

import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Avatar, Spinner, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { confirmAlert } from '@/lib/confirm';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchBlockedUsers, unblockUser, type BlockedUserItem } from '@/features/account/social.api';
import { spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { useAsyncResource } from '@/hooks/useAsyncResource';

const blockedKeyExtractor = (item: BlockedUserItem) => item.id;
const BlockedSeparator = () => <View style={{ height: spacing.md }} />;

export default function BlockedUsersScreen() {
  const { colors } = useAppTheme();

  const { accessToken, csrfToken } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // دورة الجلب الموحّدة: تلغي الطلب القديم وتتجاهل الاستجابة المتأخرة عند تغيّر الحساب.
  const resource = useAsyncResource<BlockedUserItem[]>(
    async () => (await fetchBlockedUsers(accessToken as string)).items,
    {
      key: accessToken ?? '',
      manual: !accessToken,
      tag: 'blocked-users',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل قائمة الحظر.'),
    },
  );
  const { data, loading, reload, setData } = resource;
  const error = actionError || resource.error || '';
  const items = useMemo(() => (data ?? []).filter((item) => item.blocked), [data]);
  const refreshList = useCallback(() => { void reload({ soft: true }); }, [reload]);

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
              setData((current) => (current ?? []).filter((row) => row.blockedId !== person.id));
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
        <FlatList refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={refreshList} tintColor={colors.brand} />}
          data={items}
          keyExtractor={blockedKeyExtractor}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              {loading ? <Spinner color={colors.brand} /> : null}
              {error ? <Notice>{error}</Notice> : null}
            </View>
          }
          ListEmptyComponent={
            !loading ? <Notice tone="muted">لا يوجد مستخدمون محظورون حاليًا.</Notice> : undefined
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
          ItemSeparatorComponent={BlockedSeparator}
        />
      )}
    </PageShell>
  );
}
