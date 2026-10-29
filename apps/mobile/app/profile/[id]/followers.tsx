import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchUserFollowList, type FollowListItem } from '@/features/account/social.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { AppImage } from '@/components/AppImage';

export default function FollowersScreen() {
  const p = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(p.id) ? p.id[0] : p.id;
  const [items, setItems] = useState<FollowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) {
      setError('معرّف المستخدم غير موجود.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setItems((await fetchUserFollowList(id, 'followers')).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المتابعين.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = items.filter((item) => item.follower);

  return (
    <PageShell title="المتابعون" scroll={false}>
      <FlatList
        data={loading ? [] : data}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            {loading ? <ActivityIndicator color={colors.brand} /> : null}
            {error ? <Notice>{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={!loading && !error ? <Notice tone="muted">لا يوجد متابعون بعد.</Notice> : undefined}
        renderItem={({ item }) => {
          const person = item.follower!;
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
                    <Text style={{ textAlign: 'right', fontWeight: '900', fontSize: 15, color: colors.ink }}>
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
        ListFooterComponent={<PrimaryButton label="تحديث" variant="secondary" onPress={() => void load()} />}
      />
    </PageShell>
  );
}
