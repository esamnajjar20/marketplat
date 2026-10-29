import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { acceptStoreInvite, fetchMyStoreInvites, type StoreMember } from '@/features/commerce/store-management.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';

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
      await load();
      Alert.alert('تم قبول الدعوة', 'أصبحت عضوًا في المتجر.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر قبول الدعوة.');
    } finally {
      setBusyId('');
    }
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
          contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
              {loading ? <Notice tone="muted">جارٍ تحميل الدعوات…</Notice> : null}
              {error ? <Notice>{error}</Notice> : null}
            </View>
          }
          ListEmptyComponent={!loading ? <Notice tone="muted">لا توجد دعوات معلقة لحسابك.</Notice> : null}
          renderItem={({ item }) => (
            <SectionCard>
              <Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '900', color: colors.ink }}>
                {item.store?.name || 'متجر'}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                الداعي: {item.invitedBy?.name || 'صاحب المتجر'} · الدور: {item.role}
              </Text>
              <PrimaryButton label="قبول الدعوة" busy={busyId === item.id} onPress={() => void accept(item)} />
            </SectionCard>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      )}
    </PageShell>
  );
}
