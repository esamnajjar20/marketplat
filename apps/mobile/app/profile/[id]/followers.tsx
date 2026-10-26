import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchUserFollowList, type FollowListItem } from '@/features/account/social.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';
export default function FollowersScreen() {
  const p = useLocalSearchParams<{ id?: string | string[] }>(); const id = Array.isArray(p.id) ? p.id[0] : p.id;
  const [items, setItems] = useState<FollowListItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { if (!id) { setError('معرّف المستخدم غير موجود.'); setLoading(false); return; } setLoading(true); setError(''); try { setItems((await fetchUserFollowList(id, 'followers')).items); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المتابعين.'); } finally { setLoading(false); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  return <PageShell title="المتابعون">{loading ? <ActivityIndicator color={colors.brand} /> : null}{error ? <Notice>{error}</Notice> : null}{items.map(item => { const person = item.follower; if (!person) return null; return <Pressable key={item.id} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: person.id } })}><SectionCard><View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>{person.avatarUrl ? <Image source={{ uri: person.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} /> : <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.ink, fontWeight: '900' }}>{(person.name || '?').slice(0, 1)}</Text></View>}<View style={{ flex: 1 }}><Text style={{ textAlign: 'right', fontWeight: '800', color: colors.ink }}>{person.name || 'مستخدم'}</Text><Text style={{ textAlign: 'right', color: colors.muted }}>{person.city || ''}</Text></View><Text style={{ color: colors.brand }}>عرض ←</Text></View></SectionCard></Pressable>; })}{!loading && !error && !items.length ? <Notice tone="muted">لا يوجد متابعون لعرضهم.</Notice> : null}<PrimaryButton label="تحديث" variant="secondary" onPress={() => void load()} /></PageShell>;
}
