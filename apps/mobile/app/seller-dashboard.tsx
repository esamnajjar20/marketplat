import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyStore, fetchMyStoreAnalytics, type StoreAnalytics, type StoreSummary } from '@/features/commerce/commerce.api';
import { fetchMySellerProfile, type SellerProfile } from '@/features/account/seller.api';
import { EmptyState, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, radius, spacing, typography } from '@/theme/tokens';

function Metric({ label, value }: { label: string; value: string | number }) { return <View style={{ flex: 1, minWidth: 120, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.brandSoft, gap: spacing.xs }}><Text style={{ color: colors.muted, textAlign: 'right', fontSize: 12 }}>{label}</Text><Text style={{ color: colors.brand, textAlign: 'right', fontSize: 21, fontWeight: '900' }}>{value}</Text></View>; }
export default function SellerDashboardScreen() {
  const { accessToken, user } = useAuth();
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!accessToken) { setError('سجّل الدخول لعرض لوحة البائع.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [nextStore, nextProfile] = await Promise.all([fetchMyStore(accessToken), fetchMySellerProfile(accessToken, user?.id)]);
      setStore(nextStore); setProfile(nextProfile);
      if (nextStore) { try { setAnalytics(await fetchMyStoreAnalytics(accessToken)); } catch { setAnalytics(null); } }
      else setAnalytics(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل لوحة البائع.'); }
    finally { setLoading(false); }
  }, [accessToken, user?.id]);
  useEffect(() => { void load(); }, [load]);
  return <PageShell title="لوحة البائع">
    <Notice tone="muted">ملخص سريع لحالة المتجر والمهام الأساسية. تُحمّل الإحصاءات في طلب واحد ولا تُرسل طلبات منفصلة لكل بطاقة.</Notice>
    {loading ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ تحميل بيانات البائع…</Text></SectionCard> : null}
    {error ? <SectionCard><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()} /></SectionCard> : null}
    {!loading && !error && !store ? <SectionCard><EmptyState title="لم تنشئ متجرًا بعد" description="أنشئ متجرك أو أكمل ملف البائع لتبدأ في عرض منتجاتك." /><PrimaryButton label="إدارة المتجر" onPress={() => router.push('/my-store')} /><PrimaryButton label="ملف البائع" variant="secondary" onPress={() => router.push('/seller-profile')} /></SectionCard> : null}
    {!loading && !error && store ? <>
      <SectionCard><Text style={{ textAlign: 'right', color: colors.ink, fontWeight: '900', fontSize: 19 }}>{store.name}</Text><Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }}>{store.city || 'الموقع غير محدد'} · الحالة: {store.status || 'غير محددة'}</Text><View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}><View style={{ borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: profile?.verified || store.sellerProfile?.verified ? colors.successSoft : colors.warningSoft }}><Text style={{ color: profile?.verified || store.sellerProfile?.verified ? colors.success : colors.warningText, fontWeight: '800', fontSize: 12 }}>{profile?.verified || store.sellerProfile?.verified ? '✓ بائع موثّق' : 'التحقق غير مكتمل'}</Text></View><View style={{ borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: colors.brandSoft }}><Text style={{ color: colors.brand, fontWeight: '800', fontSize: 12 }}>{store.isOpen === true ? 'المتجر مفتوح' : store.isOpen === false ? 'المتجر مغلق' : 'ساعات العمل غير محددة'}</Text></View></View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}><PrimaryButton label="إدارة المتجر" onPress={() => router.push('/my-store')} /><PrimaryButton label="إحصاءات المتجر" variant="secondary" onPress={() => router.push('/my-store-analytics')} /></View>
      </SectionCard>
      <SectionCard><Text style={{ textAlign: 'right', color: colors.ink, ...typography.subtitle }}>لمحة سريعة</Text><View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}><Metric label="مشاهدات المتجر" value={analytics?.views ?? store.views ?? 0} /><Metric label="متابعو المتجر" value={analytics?.followers ?? store._count?.followers ?? 0} /><Metric label="المنتجات النشطة" value={analytics?.activeProducts ?? store._count?.products ?? 0} /><Metric label="العروض النشطة" value={analytics?.activePromotions ?? '—'} /></View></SectionCard>
      <SectionCard><Text style={{ textAlign: 'right', color: colors.ink, ...typography.subtitle }}>مهام اليوم</Text>{!(profile?.verified || store.sellerProfile?.verified) ? <Notice tone="warning">أكمل متطلبات توثيق ملف البائع إذا كانت متاحة لحسابك.</Notice> : null}{profile?.suspended ? <Notice>ملف البائع موقوف؛ راجع الدعم لمعرفة التفاصيل.</Notice> : null}<PrimaryButton label="إدارة المنتجات" variant="secondary" onPress={() => router.push('/my-products')} /><PrimaryButton label="إدارة العروض" variant="secondary" onPress={() => router.push('/my-offers')} /><PrimaryButton label="طلبات الخدمات" variant="secondary" onPress={() => router.push('/service-requests')} /><PrimaryButton label="فريق المتجر والدعوات" variant="secondary" onPress={() => router.push('/store-team')} /></SectionCard>
    </> : null}
  </PageShell>;
}
