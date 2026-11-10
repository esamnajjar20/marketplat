
import { invalidateNavigationCapabilities } from '@/lib/navigation-policy';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { acceptStoreInvite, fetchMyStoreInvites, removeStoreMember, type StoreMember } from '@/features/commerce/store-management.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { roleLabel } from '@/lib/status-labels';
import { showToast } from '@/lib/toast';

export default function StoreInvitesScreen() {

  const { accessToken, csrfToken } = useAuth();
  const [items, setItems] = useState<StoreMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setItems(await fetchMyStoreInvites(accessToken));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الدعوات.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async (item: StoreMember) => {
    if (!accessToken) return;
    setBusyId(item.id);
    setError('');
    try {
      await acceptStoreInvite(item.id, accessToken, csrfToken);
      invalidateNavigationCapabilities();
      await load();
      showToast('تم قبول الدعوة', 'أصبحت عضوًا في المتجر.', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر قبول الدعوة.');
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
        setError('');
        void removeStoreMember(item.store!.id, item.id, accessToken, csrfToken)
          .then(() => setItems((current) => current.filter((entry) => entry.id !== item.id)))
          .catch((e) => setError(e instanceof Error ? e.message : 'تعذر رفض الدعوة.'))
          .finally(() => setBusyId(''));
      } },
    ]);
  };

  return (
    <PageShell title="دعوات المتاجر" scroll={false}>
      {!accessToken ? (
        <>
          <Notice>سجّل الدخول لعرض الدعوات.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        </>
      ) : (
        <FlatList
          data={loading ? [] : items}
          keyExtractor={(item) => item.id}
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
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      )}
    </PageShell>
  );
}
