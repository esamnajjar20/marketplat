
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { useAppTheme } from '@/theme/ThemeProvider';
import { invalidateNavigationCapabilities } from '@/lib/navigation-policy';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { acceptStoreInvite, fetchMyStoreInvites, removeStoreMember, type StoreMember } from '@/features/commerce/store-management.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { roleLabel } from '@/lib/status-labels';
import { showToast } from '@/lib/toast';

const inviteKeyExtractor = (item: StoreMember) => item.id;
const InviteSeparator = () => <View style={{ height: spacing.md }} />;

export default function StoreInvitesScreen() {

  const { accessToken, csrfToken } = useAuth();
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');

  // دورة الجلب الموحّدة: تلغي الطلب القديم وتتجاهل الاستجابة المتأخرة عند تغيّر الحساب.
  const resource = useAsyncResource<StoreMember[]>(
    () => fetchMyStoreInvites(accessToken as string),
    {
      key: accessToken ?? '',
      manual: !accessToken,
      tag: 'store-invites',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الدعوات.'),
    },
  );
  const { loading, reload, setData } = resource;
  const items = resource.data ?? [];
  const error = actionError || resource.error || '';
  const { colors: refreshTheme } = useAppTheme();
  const softReload = useCallback(() => reload({ soft: true }), [reload]);
  const { refreshing: pullRefreshing, onRefresh: onPullRefresh } = usePullRefresh(softReload);

  const accept = async (item: StoreMember) => {
    if (!accessToken) return;
    setBusyId(item.id);
    setActionError('');
    try {
      await acceptStoreInvite(item.id, accessToken, csrfToken);
      invalidateNavigationCapabilities();
      await reload({ soft: true });
      showToast('تم قبول الدعوة', 'أصبحت عضوًا في المتجر.', 'success');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر قبول الدعوة.');
    } finally {
      setBusyId('');
    }
  };

  const decline = async (item: StoreMember) => {
    if (!accessToken || !item.store?.id) return;
    confirmAlert('رفض دعوة المتجر', `لن تنضم إلى «${item.store.name}». هل تريد رفض الدعوة؟`, [
      { text: 'رجوع', style: 'cancel' },
      { text: 'رفض الدعوة', style: 'destructive', onPress: () => {
        setBusyId(item.id);
        setActionError('');
        void removeStoreMember(item.store!.id, item.id, accessToken, csrfToken)
          .then(() => setData((current) => (current ?? []).filter((entry) => entry.id !== item.id)))
          .catch((e) => setActionError(e instanceof Error ? e.message : 'تعذر رفض الدعوة.'))
          .finally(() => setBusyId(''));
      } },
    ]);
  };

  return (
    <PageShell title="دعوات المتاجر" scroll={false}>
      {!accessToken ? (
        <>
          <Notice>سجّل الدخول لعرض الدعوات.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
        </>
      ) : (
        <FlatList refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void onPullRefresh()} tintColor={refreshTheme.brand} />}
          data={loading ? [] : items}
          keyExtractor={inviteKeyExtractor}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
              {loading ? <Notice tone="muted">جارٍ تحميل الدعوات…</Notice> : null}
              {error ? <Notice>{error}</Notice> : null}
            </View>
          }
          ListEmptyComponent={!loading ? <Notice tone="muted">لا توجد دعوات معلقة لحسابك.</Notice> : undefined}
          renderItem={({ item }) => (
            <SectionCard>
              <Text tone="ink" strong size={16}>
                {item.store?.name || 'متجر'}
              </Text>
              <Text tone="muted">
                الداعي: {item.invitedBy?.name || 'صاحب المتجر'} · الدور: {roleLabel(item.role)}
              </Text>
              <PrimaryButton label="قبول الدعوة" busy={busyId === item.id} onPress={() => void accept(item)} /><PrimaryButton label="رفض الدعوة" variant="secondary" disabled={!!busyId} onPress={() => decline(item)} />
            </SectionCard>
          )}
          ItemSeparatorComponent={InviteSeparator}
        />
      )}
    </PageShell>
  );
}
