import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchFollowStatus, fetchPublicUser, fetchPublicUserAds, toggleBlockUser, toggleUserFollow, type PublicAd, type PublicUser } from '@/features/account/social.api';
import { PageShell, Notice, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';

function price(value: PublicAd['price']) { if (value === null || value === undefined || value === '') return 'السعر عند التواصل'; const n = Number(value); return Number.isFinite(n) ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(n)} ₪` : String(value); }
export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { accessToken, csrfToken, user } = useAuth();
  const [profile, setProfile] = useState<PublicUser | null>(null); const [ads, setAds] = useState<PublicAd[]>([]);
  const [following, setFollowing] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const ownProfile = Boolean(profile?.id && user?.id === profile.id);
  const load = useCallback(async (refresh = false) => {
    if (!id) { setError('رابط الملف الشخصي غير مكتمل.'); setLoading(false); return; }
    if (refresh) setRefreshing(true); else setLoading(true); setError('');
    try {
      const person = await fetchPublicUser(id);
      const listing = await fetchPublicUserAds(person.id, 1, 12);
      setProfile(person); setAds(listing.items);
      if (accessToken && person.id !== user?.id) { try { setFollowing(await fetchFollowStatus(person.id, accessToken)); } catch { setFollowing(false); } }
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل الملف الشخصي.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id, accessToken, user?.id]);
  useEffect(() => { void load(); }, [load]);
  const onFollow = async () => {
    if (!accessToken) { router.push('/login'); return; } if (!profile || busy) return;
    setBusy(true); setError(''); try { const action = await toggleUserFollow(profile.id, accessToken, csrfToken); setFollowing(action === 'followed'); setProfile(p => p ? { ...p, followStats: { followers: Math.max(0, (p.followStats?.followers ?? 0) + (action === 'followed' ? 1 : -1)), following: p.followStats?.following ?? 0 } } : p); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث المتابعة.'); } finally { setBusy(false); }
  };
  const onBlock = () => { if (!accessToken) { router.push('/login'); return; } if (!profile) return; Alert.alert('حظر المستخدم', `هل تريد ${'حظر ' + (profile.name || 'هذا المستخدم')}؟ سيؤثر الحظر على التواصل بين الحسابين.`, [{ text: 'إلغاء', style: 'cancel' }, { text: 'حظر', style: 'destructive', onPress: () => { void (async () => { setBusy(true); try { await toggleBlockUser(profile.id, accessToken, csrfToken); Alert.alert('تم الحظر', 'يمكنك إدارة الحظر من الإعدادات.'); router.back(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حظر المستخدم.'); } finally { setBusy(false); } })(); } }]); };
  return <PageShell title="الملف العام">
    {loading ? <ActivityIndicator color={colors.brand} /> : null}
    {error ? <Notice>{error}</Notice> : null}
    {profile ? <>
      <SectionCard><View style={{ alignItems: 'center', gap: 8 }}>{profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.border }} /> : <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 32, color: colors.ink }}>{(profile.name || '?').slice(0, 1)}</Text></View>}<Text style={{ fontSize: 21, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>{profile.name || 'مستخدم'}</Text>{profile.city ? <Text style={{ color: colors.muted }}>{profile.city}</Text> : null}{profile.bio ? <Text style={{ color: colors.ink, textAlign: 'center', lineHeight: 22 }}>{profile.bio}</Text> : null}<Text style={{ color: colors.muted }}>الإعلانات النشطة: {profile._count?.ads ?? ads.length}</Text><View style={{ flexDirection: 'row-reverse', gap: 22 }}><Pressable onPress={() => router.push({ pathname: '/profile/[id]/followers', params: { id: profile.id } })}><Text style={{ color: colors.brand, fontWeight: '800' }}>المتابعون {profile.followStats?.followers ?? '—'}</Text></Pressable><Pressable onPress={() => router.push({ pathname: '/profile/[id]/following', params: { id: profile.id } })}><Text style={{ color: colors.brand, fontWeight: '800' }}>يتابع {profile.followStats?.following ?? '—'}</Text></Pressable></View></View>
        {!ownProfile ? <><PrimaryButton label={following ? 'إلغاء المتابعة' : 'متابعة'} onPress={() => void onFollow()} busy={busy} variant={following ? 'secondary' : 'primary'} /><PrimaryButton label="إبلاغ عن المستخدم" onPress={() => router.push({ pathname: '/report/[targetType]/[targetId]', params: { targetType: 'users', targetId: profile.id } })} variant="secondary" /><PrimaryButton label="حظر المستخدم" onPress={onBlock} variant="danger" /></> : <PrimaryButton label="تعديل ملفي الشخصي" onPress={() => router.push('/profile')} variant="secondary" />}
        {profile.sellerProfile?.storeDetails?.id ? <PrimaryButton label="عرض المتجر" variant="secondary" onPress={() => router.push({ pathname: '/stores/[id]', params: { id: profile.sellerProfile!.storeDetails!.id } })} /> : null}
        {profile.sellerProfile?.serviceProviderDetails?.id ? <PrimaryButton label="عرض ملف مقدم الخدمة" variant="secondary" onPress={() => router.push({ pathname: '/service-providers/[id]', params: { id: profile.sellerProfile!.serviceProviderDetails!.id } })} /> : null}
      </SectionCard>
      <Text style={{ textAlign: 'right', fontWeight: '900', fontSize: 18, color: colors.ink, marginVertical: 8 }}>إعلانات المستخدم</Text>
      {ads.length ? ads.map(ad => <Pressable key={ad.id} onPress={() => router.push({ pathname: '/ads/[id]', params: { id: ad.id } })}><SectionCard><Text style={{ textAlign: 'right', fontWeight: '800', color: colors.ink }}>{ad.title}</Text><Text style={{ textAlign: 'right', color: colors.brand }}>{price(ad.price)}</Text><Text style={{ textAlign: 'right', color: colors.muted }}>{ad.city || ''}</Text></SectionCard></Pressable>) : <Notice tone="muted">لا توجد إعلانات نشطة لهذا المستخدم حاليًا.</Notice>}
      <PrimaryButton label="تحديث الصفحة" variant="secondary" onPress={() => void load(true)} busy={refreshing} />
    </> : null}
  </PageShell>;
}
