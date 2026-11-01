import { showToast } from '@/lib/toast';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchBlockedUsers, fetchFollowStatus, fetchPublicUser, fetchPublicUserAds, toggleBlockUser, toggleUserFollow, unblockUser, type PublicAd, type PublicUser } from '@/features/account/social.api';
import { startConversationWithUser } from '@/features/messaging/messaging.api';
import { PageShell, Notice, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { AppImage } from '@/components/AppImage';
import { fontSizes, colors } from '@/theme/tokens';

function price(value: PublicAd['price']) { if (value === null || value === undefined || value === '') return 'السعر عند التواصل'; const n = Number(value); return Number.isFinite(n) ? formatMoney(n) : 'السعر غير متاح'; }
export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { getAccessToken, csrfToken, user, isRestoring } = useAuth();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [ads, setAds] = useState<PublicAd[]>([]);
  const [adsPage, setAdsPage] = useState(1);
  const [adsPages, setAdsPages] = useState(1);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState('');
  const [following, setFollowing] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const ownProfile = Boolean(profile?.id && user?.id === profile.id);

  const load = useCallback(async () => {
    const current = ++seq.current;
    if (!id) { setError('رابط الملف الشخصي غير مكتمل.'); setLoading(false); return; }
    if (isRestoring) return;
    const token = getAccessToken();
    setLoading(true); setError(''); setAdsError('');
    try {
      const person = await fetchPublicUser(id);
      if (current !== seq.current) return;
      setProfile(person);
      setLoading(false);
      setAdsLoading(true);
      const jobs: Promise<unknown>[] = [fetchPublicUserAds(person.id, 1, 12)];
      if (token && person.id !== user?.id) {
        jobs.push(fetchFollowStatus(person.id, token));
        jobs.push((async () => {
          let page = 1; let more = true; let found = false;
          while (more && page <= 20 && !found) {
            const result = await fetchBlockedUsers(token, page, 100);
            found = result.items.some((row) => row.blockedId === person.id || row.blocked?.id === person.id);
            more = result.meta?.totalPages !== undefined ? result.meta.totalPages > page : result.items.length >= 100; page += 1;
          }
          if (more && !found) throw new Error('تعذر التأكد من حالة الحظر؛ حاول تحديث الصفحة قبل تنفيذ الإجراء.');
          return found;
        })());
      } else { setFollowing(null); setBlocked(null); }
      const settled = await Promise.allSettled(jobs);
      if (current !== seq.current) return;
      const adsResult = settled[0];
      if (adsResult.status === 'fulfilled') {
        const result = adsResult.value as Awaited<ReturnType<typeof fetchPublicUserAds>>;
        setAds(result.items); setAdsPage(result.meta?.page ?? 1); setAdsPages(result.meta?.totalPages ?? 1);
      } else setAdsError(adsResult.reason instanceof Error ? adsResult.reason.message : 'تعذر تحميل إعلانات المستخدم.');
      if (token && person.id !== user?.id) {
        setFollowing(settled[1]?.status === 'fulfilled' ? Boolean(settled[1].value) : null);
        setBlocked(settled[2]?.status === 'fulfilled' ? Boolean(settled[2].value) : null);
      }
    } catch (e) {
      if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل الملف الشخصي.');
    } finally { if (current === seq.current) { setLoading(false); setAdsLoading(false); } }
  }, [id, getAccessToken, isRestoring, user?.id]);
  useEffect(() => { void load(); return () => { seq.current += 1; }; }, [load]);

  const loadMoreAds = async () => {
    if (!id || adsLoading || adsPage >= adsPages) return;
    const current = seq.current; setAdsLoading(true); setAdsError('');
    try {
      const result = await fetchPublicUserAds(id, adsPage + 1, 12);
      if (current === seq.current) { setAds((old) => { const ids = new Set(old.map((x) => x.id)); return [...old, ...result.items.filter((x) => !ids.has(x.id))]; }); setAdsPage(result.meta?.page ?? adsPage + 1); setAdsPages(result.meta?.totalPages ?? adsPages); }
    } catch (e) { if (current === seq.current) setAdsError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من الإعلانات.'); }
    finally { if (current === seq.current) setAdsLoading(false); }
  };
  const onFollow = async () => {
    const token = getAccessToken();
    if (!token) { router.push('/login'); return; }
    if (!profile || busy || following === null) return;
    setBusy(true); setError('');
    try { const action = await toggleUserFollow(profile.id, token, csrfToken); setFollowing(action === 'followed'); setProfile((p) => p ? { ...p, followStats: { followers: Math.max(0, (p.followStats?.followers ?? 0) + (action === 'followed' ? 1 : -1)), following: p.followStats?.following ?? 0 } } : p); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث المتابعة.'); }
    finally { setBusy(false); }
  };
  const onMessage = async () => {
    const token = getAccessToken(); if (!token) { router.push('/login'); return; }
    if (!profile || busy || ownProfile) return;
    setBusy(true);
    try { const conversation = await startConversationWithUser(profile.id, token, undefined, csrfToken); router.push({ pathname: '/messages/[id]', params: { id: conversation.id } }); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر بدء المحادثة.'); }
    finally { setBusy(false); }
  };
  const onBlock = () => {
    const token = getAccessToken(); if (!token) { router.push('/login'); return; }
    if (!profile || busy || blocked === null) return;
    const action = blocked ? 'إلغاء حظر' : 'حظر';
    Alert.alert(`${action} المستخدم`, `هل تريد ${action} ${profile.name || 'هذا المستخدم'}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: action, style: 'destructive', onPress: () => { void (async () => {
        setBusy(true);
        try { if (blocked) await unblockUser(profile.id, token, csrfToken); else await toggleBlockUser(profile.id, token, csrfToken); setBlocked(!blocked); showToast(blocked ? 'تم إلغاء الحظر' : 'تم الحظر', 'تم تحديث إعداد الحظر.', 'success'); }
        catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث الحظر.'); }
        finally { setBusy(false); }
      })(); } },
    ]);
  };

  return <PageShell title="الملف العام">
    {isRestoring ? <ActivityIndicator color={colors.brand} /> : null}
    {loading ? <ActivityIndicator color={colors.brand} /> : null}
    {error ? <Notice>{error}</Notice> : null}
    {profile ? <>
      <SectionCard>
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
          {profile.avatarUrl ? <AppImage uri={profile.avatarUrl} accessibilityLabel="صورة المستخدم" style={{ width: 104, height: 104, borderRadius: 52 }} /> : <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: fontSizes[32], color: colors.ink }}>{(profile.name || '?').slice(0, 1)}</Text></View>}
          <Text style={{ fontSize: fontSizes[23], fontWeight: '900', color: colors.ink, textAlign: 'center' }}>{profile.name || 'مستخدم'}</Text>
          {profile.city ? <Text style={{ color: colors.muted }}>{profile.city}</Text> : null}
          {profile.bio ? <Text style={{ color: colors.ink, textAlign: 'center', lineHeight: 22 }}>{profile.bio}</Text> : null}
          <Text style={{ color: colors.muted }}>الإعلانات النشطة: {profile._count?.ads ?? ads.length}</Text>
          <View style={{ flexDirection: 'row', gap: 28, paddingVertical: 6 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/[id]/followers', params: { id: profile.id } })}><Text style={{ color: colors.brand, fontWeight: '800' }}>المتابعون {profile.followStats?.followers ?? '—'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/[id]/following', params: { id: profile.id } })}><Text style={{ color: colors.brand, fontWeight: '800' }}>يتابع {profile.followStats?.following ?? '—'}</Text></Pressable>
          </View>
        </View>
        {!ownProfile ? <>
          <PrimaryButton label={following === null ? 'جارٍ التحقق من المتابعة…' : following ? 'إلغاء المتابعة' : 'متابعة'} disabled={following === null} onPress={() => void onFollow()} busy={busy} variant={following ? 'secondary' : 'primary'} />
          <PrimaryButton label="مراسلة المستخدم" onPress={() => void onMessage()} busy={busy} variant="secondary" />
          <PrimaryButton label={blocked === null ? 'جارٍ التحقق من الحظر…' : blocked ? 'إلغاء الحظر' : 'حظر المستخدم'} disabled={blocked === null} onPress={onBlock} variant="danger" />
          <PrimaryButton label="إبلاغ عن المستخدم" onPress={() => router.push({ pathname: '/report/[targetType]/[targetId]', params: { targetType: 'users', targetId: profile.id } })} variant="secondary" />
        </> : <PrimaryButton label="تعديل ملفي الشخصي" onPress={() => router.push('/profile')} variant="secondary" />}
        {profile.sellerProfile?.storeDetails?.id ? <PrimaryButton label="عرض المتجر" variant="secondary" onPress={() => router.push({ pathname: '/stores/[id]', params: { id: profile.sellerProfile!.storeDetails!.id } })} /> : null}
        {profile.sellerProfile?.serviceProviderDetails?.id ? <PrimaryButton label="عرض ملف مقدم الخدمة" variant="secondary" onPress={() => router.push({ pathname: '/service-providers/[id]', params: { id: profile.sellerProfile!.serviceProviderDetails!.id } })} /> : null}
      </SectionCard>
      <Text style={{ textAlign: 'right', fontWeight: '900', fontSize: fontSizes[18], color: colors.ink, marginTop: 16, marginBottom: 10 }}>إعلانات المستخدم</Text>
      {adsError ? <Notice>{adsError}</Notice> : null}
      {ads.length ? ads.map((ad) => <Pressable key={ad.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/ads/[id]', params: { id: ad.id } })}><SectionCard><Text style={{ textAlign: 'right', fontWeight: '800', color: colors.ink }}>{ad.title}</Text><Text style={{ textAlign: 'right', color: colors.brand }}>{price(ad.price)}</Text><Text style={{ textAlign: 'right', color: colors.muted }}>{ad.city || ''}</Text></SectionCard></Pressable>) : !adsLoading && !adsError ? <Notice tone="muted">لا توجد إعلانات نشطة لهذا المستخدم حاليًا.</Notice> : null}
      {adsPage < adsPages ? <PrimaryButton label="تحميل إعلانات أقدم" variant="secondary" busy={adsLoading} onPress={() => void loadMoreAds()} /> : null}
      {adsError ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void loadMoreAds()} busy={adsLoading} /> : null}
      <PrimaryButton label="تحديث الصفحة" variant="secondary" onPress={() => void load()} />
    </> : null}
  </PageShell>;
}
