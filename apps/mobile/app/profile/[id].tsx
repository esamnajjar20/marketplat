import { useAppTheme } from '@/theme/ThemeProvider';
import { ApiError } from '@/api/client';
import { showToast } from '@/lib/toast';
import { formatMoney } from '@/lib/formatters';
import { formatSafeDate } from '@/lib/date-format';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Avatar, Spinner, Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { AppImage } from '@/components/AppImage';
import { PageList } from '@/components/ui/PageList';
import { confirmAlert } from '@/lib/confirm';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuthActions, useAuthSession, useAuthStatus, useAuthUser } from '@/features/auth/AuthContext';
import { fetchProfileInteractionState, fetchPublicUser, fetchPublicUserAds, fetchSellerRatings, toggleBlockUser, toggleUserFollow, unblockUser, type PublicAd, type PublicSellerRating, type PublicUser } from '@/features/account/social.api';
import { fetchProviderServices } from '@/features/services/providers.api';
import { fetchServiceReviews, type ServiceReview } from '@/features/services/service-management.api';
import type { ServiceListing } from '@/features/services/services.api';
import { serviceAvailabilityLabel } from '@/features/services/service-availability';
import { startConversationWithUser } from '@/features/messaging/messaging.api';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';

function price(value: PublicAd['price']) { if (value === null || value === undefined || value === '') return 'السعر عند التواصل'; const n = Number(value); return Number.isFinite(n) ? formatMoney(n) : 'السعر غير متاح'; }
const ProfileAdRow = memo(function ProfileAdRow({ ad, onOpen }: { ad: PublicAd; onOpen: (id: string) => void }) {
  return <Pressable accessibilityRole="button" onPress={() => onOpen(ad.id)}><SectionCard><Text tone="ink" strong>{ad.title}</Text><Text tone="brand">{price(ad.price)}</Text><Text tone="muted">{ad.city || ''}</Text></SectionCard></Pressable>;
});
const profileAdKey = (ad: PublicAd) => ad.id;
const openProfileAd = (id: string) => router.push({ pathname: '/ads/[id]', params: { id } });
const renderProfileAd = ({ item }: { item: PublicAd }) => <ProfileAdRow ad={item} onOpen={openProfileAd} />;
export default function PublicProfileScreen() {
  const { colors } = useAppTheme();

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuthUser();
  const { csrfToken } = useAuthSession();
  const { isRestoring } = useAuthStatus();
  const { getAccessToken } = useAuthActions();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [ads, setAds] = useState<PublicAd[]>([]);
  const [adsPage, setAdsPage] = useState(1);
  const [adsPages, setAdsPages] = useState(1);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState('');
  const [activeProfileTab, setActiveProfileTab] = useState<'ads' | 'store' | 'services' | 'ratings'>('ads');
  const [profileServices, setProfileServices] = useState<ServiceListing[]>([]);
  const [sellerRatings, setSellerRatings] = useState<PublicSellerRating[]>([]);
  const [serviceReviews, setServiceReviews] = useState<ServiceReview[]>([]);
  const [sellerRatingsPage, setSellerRatingsPage] = useState(1);
  const [sellerRatingsPages, setSellerRatingsPages] = useState(1);
  const [serviceReviewsPage, setServiceReviewsPage] = useState(1);
  const [serviceReviewsPages, setServiceReviewsPages] = useState(1);
  const [interactionError, setInteractionError] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState('');
  const loadedProfileTabs = useRef(new Set<string>());
  const inFlightProfileTabs = useRef(new Set<string>());
  const [following, setFollowing] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [interactionRestricted, setInteractionRestricted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileBlocked, setProfileBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const ownProfile = Boolean(profile?.id && user?.id === profile.id);
  const sellerProfile = profile?.sellerProfile;
  const storeDetails = sellerProfile?.storeDetails;
  const serviceProvider = sellerProfile?.serviceProviderDetails;

  const load = useCallback(async () => {
    const current = ++seq.current;
    if (!id) { setError('رابط الملف الشخصي غير مكتمل.'); setLoading(false); return; }
    if (isRestoring) return;
    const token = getAccessToken();
    setLoading(true); setError(''); setAdsError(''); setInteractionError(''); setProfileBlocked(false);
    setProfile(null); setAds([]); setAdsPage(1); setAdsPages(1);
    setProfileServices([]); setSellerRatings([]); setServiceReviews([]); setContentLoading(false); setContentError('');
    setSellerRatingsPage(1); setSellerRatingsPages(1); setServiceReviewsPage(1); setServiceReviewsPages(1);
    setFollowing(null); setBlocked(null); setInteractionRestricted(null);
    loadedProfileTabs.current.clear();
    inFlightProfileTabs.current.clear();
    try {
      const person = await fetchPublicUser(id);
      if (current !== seq.current) return;
      setProfile(person);
      setLoading(false);
      setAdsLoading(true);
      loadedProfileTabs.current.clear();
      inFlightProfileTabs.current.clear();
      setProfileServices([]); setSellerRatings([]); setServiceReviews([]); setActiveProfileTab('ads');
      const jobs: Promise<unknown>[] = [fetchPublicUserAds(person.id, 1, 12)];
      if (token && person.id !== user?.id) {
        jobs.push(fetchProfileInteractionState(person.id, token));
      } else { setFollowing(null); setBlocked(null); }
      const settled = await Promise.allSettled(jobs);
      if (current !== seq.current) return;
      const adsResult = settled[0];
      if (adsResult.status === 'fulfilled') {
        const result = adsResult.value as Awaited<ReturnType<typeof fetchPublicUserAds>>;
        setAds(result.items); setAdsPage(result.meta?.page ?? 1); setAdsPages(result.meta?.totalPages ?? 1);
      } else setAdsError(adsResult.reason instanceof Error ? adsResult.reason.message : 'تعذر تحميل إعلانات المستخدم.');
      if (token && person.id !== user?.id) {
        const interactionResult = settled[1];
        if (interactionResult?.status === 'fulfilled') {
          const state = interactionResult.value as Awaited<ReturnType<typeof fetchProfileInteractionState>>;
          setFollowing(state.following);
          setBlocked(state.isBlockedByMe);
          setInteractionRestricted(state.interactionRestricted);
        } else {
          setFollowing(null);
          setBlocked(null);
          setInteractionRestricted(null);
          setInteractionError(interactionResult?.reason instanceof Error ? interactionResult.reason.message : 'تعذر التحقق من حالة المتابعة والحظر.');
        }
      }
    } catch (e) {
      if (current === seq.current) {
        if (e instanceof ApiError && e.code === 'PUBLIC_ACCOUNT_BLOCKED') {
          setProfileBlocked(true);
          setProfile(null);
          setAds([]);
          setProfileServices([]);
          setSellerRatings([]);
          setServiceReviews([]);
          setError('');
        } else {
          setError(e instanceof Error ? e.message : 'تعذر تحميل الملف الشخصي.');
        }
      }
    } finally { if (current === seq.current) { setLoading(false); setAdsLoading(false); } }
  }, [id, getAccessToken, isRestoring, user?.id]);
  useEffect(() => { void load(); return () => { seq.current += 1; }; }, [load]);

  const loadProfileTab = useCallback(async (tab: 'store' | 'services' | 'ratings', force = false) => {
    if (!sellerProfile?.id || inFlightProfileTabs.current.has(tab) || (!force && loadedProfileTabs.current.has(tab))) return;
    inFlightProfileTabs.current.add(tab);
    const sellerId = sellerProfile.id;
    const providerId = serviceProvider?.id;
    const hasProvider = Boolean(providerId);
    const profileGeneration = seq.current;
    setContentLoading(true); setContentError('');
    try {
      if (tab === 'services' && providerId) {
        const result = await fetchProviderServices(providerId, 1, 12);
        if (profileGeneration === seq.current) setProfileServices(result.items);
      } else if (tab === 'ratings') {
        const jobs: Promise<unknown>[] = [fetchSellerRatings(sellerId, 1, 10)];
        if (hasProvider) jobs.push(fetchServiceReviews(sellerId, 1));
        const settled = await Promise.allSettled(jobs);
        const sellerResult = settled[0];
        if (sellerResult.status === 'fulfilled') {
          const result = sellerResult.value as Awaited<ReturnType<typeof fetchSellerRatings>>;
          if (profileGeneration === seq.current) {
            setSellerRatings(result.items);
            setSellerRatingsPage(result.meta?.page ?? 1);
            setSellerRatingsPages(result.meta?.totalPages ?? 1);
          }
        } else throw sellerResult.reason;
        const serviceResult = settled[1];
        if (serviceResult?.status === 'fulfilled') {
          const result = serviceResult.value as Awaited<ReturnType<typeof fetchServiceReviews>>;
          if (profileGeneration === seq.current) {
            setServiceReviews(result.items);
            setServiceReviewsPage(result.page);
            setServiceReviewsPages(result.totalPages);
          }
        } else if (hasProvider && serviceResult?.status === 'rejected' && profileGeneration === seq.current) setContentError('تعذر تحميل تقييمات الخدمات؛ تظهر تقييمات البائع المتاحة فقط.');
      }
      if (profileGeneration === seq.current) loadedProfileTabs.current.add(tab);
    } catch (e) {
      if (profileGeneration === seq.current) setContentError(e instanceof Error ? e.message : 'تعذر تحميل محتوى الملف.');
    } finally {
      if (profileGeneration === seq.current) {
        inFlightProfileTabs.current.delete(tab);
        setContentLoading(inFlightProfileTabs.current.size > 0);
      }
    }
  }, [sellerProfile?.id, serviceProvider?.id]);
  useEffect(() => {
    if (activeProfileTab !== 'ads') void loadProfileTab(activeProfileTab);
  }, [activeProfileTab, loadProfileTab]);
  const selectProfileTab = (tab: 'ads' | 'store' | 'services' | 'ratings') => setActiveProfileTab(tab);

  const loadMoreAds = async () => {
    if (!id || adsLoading || adsPage >= adsPages) return;
    const current = seq.current; setAdsLoading(true); setAdsError('');
    try {
      const result = await fetchPublicUserAds(id, adsPage + 1, 12);
      if (current === seq.current) { setAds((old) => { const ids = new Set(old.map((x) => x.id)); return [...old, ...result.items.filter((x) => !ids.has(x.id))]; }); setAdsPage(result.meta?.page ?? adsPage + 1); setAdsPages(result.meta?.totalPages ?? adsPages); }
    } catch (e) { if (current === seq.current) setAdsError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من الإعلانات.'); }
    finally { if (current === seq.current) setAdsLoading(false); }
  };
  const retryInteractionState = async () => {
    const token = getAccessToken();
    if (!token || !profile?.id || ownProfile || busy) return;
    setBusy(true);
    setInteractionError('');
    try {
      const state = await fetchProfileInteractionState(profile.id, token);
      setFollowing(state.following);
      setBlocked(state.isBlockedByMe);
      setInteractionRestricted(state.interactionRestricted);
    } catch (e) {
      setFollowing(null);
      setBlocked(null);
      setInteractionRestricted(null);
      setInteractionError(e instanceof Error ? e.message : 'تعذر التحقق من حالة المتابعة والحظر.');
    } finally { setBusy(false); }
  };

  const loadMoreSellerRatings = async () => {
    if (!sellerProfile?.id || contentLoading || sellerRatingsPage >= sellerRatingsPages) return;
    setContentLoading(true); setContentError('');
    try {
      const result = await fetchSellerRatings(sellerProfile.id, sellerRatingsPage + 1, 10);
      setSellerRatings((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !ids.has(item.id))];
      });
      setSellerRatingsPage(result.meta?.page ?? sellerRatingsPage + 1);
      setSellerRatingsPages(result.meta?.totalPages ?? sellerRatingsPages);
    } catch (e) { setContentError(e instanceof Error ? e.message : 'تعذر تحميل بقية تقييمات البائع.'); }
    finally { setContentLoading(false); }
  };

  const loadMoreServiceReviews = async () => {
    if (!sellerProfile?.id || contentLoading || serviceReviewsPage >= serviceReviewsPages) return;
    setContentLoading(true); setContentError('');
    try {
      const result = await fetchServiceReviews(sellerProfile.id, serviceReviewsPage + 1);
      setServiceReviews((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !ids.has(item.id))];
      });
      setServiceReviewsPage(result.page);
      setServiceReviewsPages(result.totalPages);
    } catch (e) { setContentError(e instanceof Error ? e.message : 'تعذر تحميل بقية تقييمات الخدمات.'); }
    finally { setContentLoading(false); }
  };

  const onFollow = async () => {
    const token = getAccessToken();
    if (!token) { pushOnce('/login'); return; }
    if (!profile || busy || following === null || interactionRestricted === true) return;
    setBusy(true); setError('');
    try { const action = await toggleUserFollow(profile.id, token, csrfToken); setFollowing(action === 'followed'); setProfile((p) => p ? { ...p, followStats: { followers: Math.max(0, (p.followStats?.followers ?? 0) + (action === 'followed' ? 1 : -1)), following: p.followStats?.following ?? 0 } } : p); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث المتابعة.'); }
    finally { setBusy(false); }
  };
  const onMessage = async () => {
    const token = getAccessToken(); if (!token) { router.push('/login'); return; }
    if (!profile || busy || ownProfile || (user?.id && interactionRestricted !== false)) return;
    setBusy(true);
    try { const conversation = await startConversationWithUser(profile.id, token, undefined, csrfToken); router.push({ pathname: '/messages/[id]', params: { id: conversation.id } }); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر بدء المحادثة.'); }
    finally { setBusy(false); }
  };
  const onBlock = () => {
    const token = getAccessToken(); if (!token) { router.push('/login'); return; }
    if (!profile || busy || blocked === null) return;
    const action = blocked ? 'إلغاء حظر' : 'حظر';
    confirmAlert(`${action} المستخدم`, `هل تريد ${action} ${profile.name || 'هذا المستخدم'}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: action, style: 'destructive', onPress: () => { void (async () => {
        setBusy(true);
        try {
          if (blocked) {
            await unblockUser(profile.id, token, csrfToken);
            setBlocked(false);
            // Removing our block does not prove that interaction is now open:
            // the other party may still have blocked this account.
            const refreshed = await fetchProfileInteractionState(profile.id, token);
            setFollowing(refreshed.following);
            setBlocked(refreshed.isBlockedByMe);
            setInteractionRestricted(refreshed.interactionRestricted);
          } else {
            await toggleBlockUser(profile.id, token, csrfToken);
            setBlocked(true);
            setInteractionRestricted(true);
          }
          showToast(blocked ? 'تم إلغاء الحظر' : 'تم الحظر', 'تم تحديث إعداد الحظر.', 'success');
        }
        catch (e) {
          setError(e instanceof Error ? e.message : 'تعذر تحديث الحظر.');
          if (blocked) {
            setInteractionRestricted(true);
            setInteractionError('تعذر التحقق من حالة التفاعل بعد تحديث الحظر. أعد المحاولة.');
          }
        }
        finally { setBusy(false); }
      })(); } },
    ]);
  };

  const hasStore = Boolean(storeDetails?.id);
  const hasServices = Boolean(serviceProvider?.id);
  if (profileBlocked) {
    return (
      <PageList
        title="الملف العام"
        data={[]}
        keyExtractor={profileAdKey}
        renderItem={renderProfileAd}
        header={(
          <SectionCard>
            <Text tone="ink" strong size={18}>هذا الحساب محظور</Text>
            <Text tone="muted">لا يمكن عرض الملف الشخصي أو المحتوى المنشور من هذا الحساب حالياً.</Text>
          </SectionCard>
        )}
      />
    );
  }
  const hasRatings = Boolean((sellerProfile?.totalRatings ?? 0) > 0 || (sellerProfile?._count?.serviceReviews ?? 0) > 0);
  const header = <>
    {isRestoring ? <Spinner color={colors.brand} /> : null}
    {loading ? <Spinner color={colors.brand} /> : null}
    {error ? <Notice>{error}</Notice> : null}
    {profile ? <>
      <SectionCard>
        <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
          <Avatar uri={profile.avatarUrl} name={profile.name} size="hero" />
          <Text style={{ fontSize: fontSizes[22], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'center' }}>{profile.name || 'مستخدم'}</Text>
          {profile.city ? <Text style={{ color: colors.muted }}>{profile.city}</Text> : null}
          {profile.bio ? <Text style={{ color: colors.ink, textAlign: 'center', lineHeight: 22 }}>{profile.bio}</Text> : null}
          <Text style={{ color: colors.muted }}>الإعلانات النشطة: {profile._count?.ads ?? ads.length}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.xl, paddingVertical: spacing.sm }}>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/[id]/followers', params: { id: profile.id } })}><Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>المتابعون {profile.followStats?.followers ?? '—'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/[id]/following', params: { id: profile.id } })}><Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>يتابع {profile.followStats?.following ?? '—'}</Text></Pressable>
          </View>
        </View>
        {!ownProfile ? <>
          {interactionRestricted ? <Notice>التفاعل مع هذا المستخدم غير متاح.</Notice> : <>
            <PrimaryButton label={following === null ? 'جارٍ التحقق من المتابعة…' : following ? 'إلغاء المتابعة' : 'متابعة'} disabled={following === null || interactionRestricted !== false} onPress={() => void onFollow()} busy={busy} variant={following ? 'secondary' : 'primary'} />
            <PrimaryButton label="مراسلة المستخدم" disabled={Boolean(user?.id && interactionRestricted !== false)} onPress={() => void onMessage()} busy={busy} variant="secondary" />
          </>}
          <PrimaryButton label={blocked === null ? 'جارٍ التحقق من الحظر…' : blocked ? 'إلغاء حظر' : 'حظر المستخدم'} disabled={blocked === null} onPress={onBlock} variant="danger" />
          <PrimaryButton label="إبلاغ عن المستخدم" onPress={() => router.push({ pathname: '/report/[targetType]/[targetId]', params: { targetType: 'users', targetId: profile.id } })} variant="secondary" />
        </> : <PrimaryButton label="تعديل ملفي الشخصي" onPress={() => router.push('/profile')} variant="secondary" />}
      </SectionCard>
      {!ownProfile && interactionError ? <><Notice>{interactionError}</Notice><PrimaryButton label="إعادة التحقق من المتابعة والحظر" variant="secondary" onPress={() => void retryInteractionState()} busy={busy}/></> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md }}>
        {[{ key: 'ads' as const, label: 'الإعلانات', show: true }, { key: 'store' as const, label: 'المتجر', show: hasStore }, { key: 'services' as const, label: 'الخدمات', show: hasServices }, { key: 'ratings' as const, label: 'التقييمات', show: hasRatings }].filter((tab) => tab.show).map((tab) => <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: activeProfileTab === tab.key }} onPress={() => selectProfileTab(tab.key)} style={{ minHeight: 44, flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12, backgroundColor: activeProfileTab === tab.key ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: activeProfileTab === tab.key ? colors.brand : colors.border }}><Text style={{ fontSize: fontSizes[13], fontWeight: fontWeights.bold, color: activeProfileTab === tab.key ? colors.brand : colors.muted }}>{tab.label}</Text></Pressable>)}
      </View>
      {activeProfileTab === 'ads' ? <Text style={{ textAlign: 'right', fontWeight: fontWeights.bold, fontSize: fontSizes[18], color: colors.ink, marginTop: spacing.md, marginBottom: spacing.md }}>إعلانات المستخدم</Text> : null}
      {activeProfileTab === 'store' && storeDetails ? <SectionCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {storeDetails.logoUrl ? <AppImage uri={storeDetails.logoUrl} style={{ width: 64, height: 64, borderRadius: 14 }}/> : <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Text tone="brand" strong>▣</Text></View>}
          <View style={{ flex: 1, gap: spacing.xs }}><Text tone="ink" strong size={17}>{storeDetails.name}</Text><Text tone="muted">{storeDetails.city || 'متجر على MarketPlat'}</Text></View>
        </View>
        {storeDetails.description ? <Text>{storeDetails.description}</Text> : null}
        <Text tone="muted">{storeDetails._count?.products ?? 0} منتج · {storeDetails._count?.followers ?? 0} متابع</Text>
        <PrimaryButton label="زيارة المتجر" onPress={() => router.push({ pathname: '/stores/[id]', params: { id: storeDetails!.id } })}/>
      </SectionCard> : null}
      {activeProfileTab === 'services' && serviceProvider ? <>
        <SectionCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            {serviceProvider.logoUrl ? <AppImage uri={serviceProvider.logoUrl} style={{ width: 64, height: 64, borderRadius: 32 }}/> : null}
            <View style={{ flex: 1, gap: spacing.xs }}><Text tone="ink" strong size={17}>{serviceProvider.businessName}</Text><Text tone="muted">{serviceAvailabilityLabel(serviceProvider.availabilityStatus)}</Text></View>
          </View>
          {serviceProvider.description ? <Text>{serviceProvider.description}</Text> : null}
          {serviceProvider.serviceAreaCities?.length ? <Text tone="muted">مناطق الخدمة: {serviceProvider.serviceAreaCities.join('، ')}</Text> : null}
          <Text tone="muted">{serviceProvider.completedRequestsCount ?? 0} طلب مكتمل</Text>
          <PrimaryButton label="عرض جميع الخدمات" variant="secondary" onPress={() => router.push({ pathname: '/service-providers/[id]', params: { id: serviceProvider!.id } })}/>
        </SectionCard>
        {contentLoading ? <Spinner color={colors.brand}/> : null}
        {contentError ? <Notice>{contentError}</Notice> : null}
        {!profileServices.length && !contentLoading ? <Notice tone="muted">لا توجد خدمات منشورة لهذا المقدم حاليًا.</Notice> : null}
        {profileServices.map((service) => <Pressable key={service.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/services/[id]', params: { id: service.id } })}><SectionCard><Text tone="ink" strong>{service.title}</Text><Text tone="muted" size={12}>{service.category?.nameAr || service.category?.name || 'خدمة'}</Text>{service.description ? <Text numberOfLines={3}>{service.description}</Text> : null}<Text tone="brand" strong>{service.price == null ? 'السعر عند الاتفاق' : formatMoney(service.price)}</Text></SectionCard></Pressable>)}
        {contentError ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void loadProfileTab('services', true)} busy={contentLoading}/> : null}
      </> : null}
      {activeProfileTab === 'ratings' ? <>
        {contentLoading ? <Spinner color={colors.brand}/> : null}
        {contentError ? <Notice>{contentError}</Notice> : null}
        <Text tone="ink" strong>تقييمات البائع</Text>
        {!sellerRatings.length && !contentLoading ? <Notice tone="muted">لا توجد تقييمات للبائع بعد.</Notice> : null}
        {sellerRatings.map((rating) => <SectionCard key={`seller-${rating.id}`}><Text tone="ink" strong>{rating.rater?.name || 'مستخدم'}</Text><Text tone="brand">{'★'.repeat(Math.max(0, Math.min(5, rating.score)))}</Text>{rating.comment ? <Text>{rating.comment}</Text> : null}{rating.ad?.title ? <Text tone="muted" size={12}>عن الإعلان: {rating.ad.title}</Text> : null}</SectionCard>)}
        {sellerRatingsPage < sellerRatingsPages ? <PrimaryButton label="تحميل تقييمات البائع الإضافية" variant="secondary" onPress={() => void loadMoreSellerRatings()} busy={contentLoading}/> : null}
        {serviceProvider ? <>
          <Text tone="ink" strong>تقييمات الخدمات</Text>
          {!serviceReviews.length && !contentLoading ? <Notice tone="muted">لا توجد تقييمات خدمات بعد.</Notice> : null}
          {serviceReviews.map((review) => <SectionCard key={`service-${review.id}`}><Text tone="ink" strong>{review.reviewer?.name || review.rater?.name || 'مستخدم'}</Text><Text tone="brand">{'★'.repeat(Math.max(0, Math.min(5, review.score)))}</Text>{review.comment ? <Text>{review.comment}</Text> : null}<Text tone="muted" size={12}>{formatSafeDate(review.createdAt, 'date', '—')}</Text></SectionCard>)}
          {serviceReviewsPage < serviceReviewsPages ? <PrimaryButton label="تحميل تقييمات الخدمات الإضافية" variant="secondary" onPress={() => void loadMoreServiceReviews()} busy={contentLoading}/> : null}
        </> : null}
        {contentError ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void loadProfileTab('ratings', true)} busy={contentLoading}/> : null}
      </> : null}
    </> : null}
  </>;
  const footer = profile ? <>
      {adsError ? <Notice>{adsError}</Notice> : null}
      {!ads.length && !adsLoading && !adsError ? <Notice tone="muted">لا توجد إعلانات نشطة لهذا المستخدم حاليًا.</Notice> : null}
      {adsPage < adsPages ? <PrimaryButton label="تحميل إعلانات أقدم" variant="secondary" busy={adsLoading} onPress={() => void loadMoreAds()} /> : null}
      {adsError ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void loadMoreAds()} busy={adsLoading} /> : null}
      <PrimaryButton label="تحديث الصفحة" variant="secondary" onPress={() => void load()} />
  </> : null;
  return <PageList title="الملف العام" data={activeProfileTab === 'ads' ? ads : []} keyExtractor={profileAdKey} renderItem={renderProfileAd} header={header} footer={activeProfileTab === 'ads' ? footer : undefined} />;
}
