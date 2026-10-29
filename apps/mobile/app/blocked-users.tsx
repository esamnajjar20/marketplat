import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchBlockedUsers, toggleBlockUser, type BlockedUserItem } from '@/features/account/social.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { AppImage } from '@/components/AppImage';

export default function BlockedUsersScreen() {
  const { accessToken, csrfToken } = useAuth();
  const [items, setItems] = useState<BlockedUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setItems((await fetchBlockedUsers(accessToken)).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل قائمة الحظر.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = (item: BlockedUserItem) => {
    const person = item.blocked;
    if (!person) return;
    Alert.alert('إلغاء الحظر', `هل تريد إلغاء حظر ${person.name || 'هذا المستخدم'}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إلغاء الحظر',
        onPress: () => {
          void (async () => {
            if (!accessToken) {
              router.push('/login');
              return;
            }
            setBusyId(person.id);
            setError('');
            try {
              await toggleBlockUser(person.id, accessToken, csrfToken);
              setItems((current) => current.filter((row) => row.blockedId !== person.id));
            } catch (e) {
              setError(e instanceof Error ? e.message : 'تعذر إلغاء الحظر.');
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
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        </>
      ) : (
        <FlatList
          data={items.filter((item) => item.blocked)}
          keyExtractor={(item) => item.id}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              {loading ? <ActivityIndicator color={colors.brand} /> : null}
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
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 56 }}>
                  {person.avatarUrl ? (
                    <AppImage
                      uri={person.avatarUrl}
                      style={{ width: 52, height: 52, borderRadius: 26 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: colors.brand, fontWeight: '900' }}>
                        {(person.name || '?').slice(0, 1)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={{ textAlign: 'right', fontWeight: '800', color: colors.ink }}>
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
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      )}
    </PageShell>
  );
}
