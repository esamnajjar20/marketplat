import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyStore, fetchMyStoreAnalytics, type StoreAnalytics, type StoreSummary } from '@/features/commerce/commerce.api';
import { fetchMySellerProfile, type SellerProfile } from '@/features/account/seller.api';
import { EmptyState, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { fontSizes, radius, spacing, typography, fontWeights } from '@/theme/tokens';
function Metric({ label, value }: {
  label: string;
  value: string | number;
}) {
  const { colors } = useAppTheme();
  return <View style={{
    flex: 1, minWidth: 120, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.brandSoft, gap: spacing.xs
  }}><Text tone="muted" size={12}>{label}</Text><Text style={{
    color: colors.brandOnSoft, textAlign: 'right', fontSize: fontSizes[20], fontWeight: fontWeights.bold
  }}>{value}</Text></View>;
}
export default function SellerDashboardScreen() {
  const { colors } = useAppTheme();
  const { accessToken, user } = useAuth();
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storeLoadError, setStoreLoadError] = useState('');
  const load = useCallback(async () => {
    if (!accessToken) {
      setError('سجّل الدخول لعرض لوحة البائع.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setStoreLoadError('');
    const [storeResult, profileResult] = await Promise.allSettled([
      fetchMyStore(accessToken),
      fetchMySellerProfile(accessToken, user?.id),
    ]);
    const nextStore = storeResult.status === 'fulfilled' ? storeResult.value : null;
    const nextProfile = profileResult.status === 'fulfilled' ? profileResult.value : null;
    setStore(nextStore);
    setProfile(nextProfile);
    if (storeResult.status === 'rejected')
      setStoreLoadError(storeResult.reason instanceof Error ? storeResult.reason.message : 'تعذر تحميل بيانات المتجر.');
    if (profileResult.status === 'rejected')
      setError(profileResult.reason instanceof Error ? profileResult.reason.message : 'تعذر تحميل ملف البائع.');
    if (nextStore) {
      try {
        setAnalytics(await fetchMyStoreAnalytics(accessToken));
      }
      catch {
        setAnalytics(null);
      }
    }
    else
      setAnalytics(null);
    setLoading(false);
  }, [accessToken, user?.id]);
  useEffect(() => {
    void load();
  }, [load]);
  return <PageShell title="لوحة البائع">
  <Notice tone="muted">ملخص حالة المتجر والمهام الأساسية.</Notice>
  {loading ? <SectionCard><Text style={{
    textAlign: 'center', color: colors.muted
  }}>جارٍ تحميل بيانات البائع…</Text></SectionCard> : null}
  {error ? <SectionCard><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()}/></SectionCard> : null}
  {!loading && !store && !storeLoadError ? <SectionCard><EmptyState title="لا يوجد متجر تملكه بعد" description="أنشئ متجرك أو افتح قائمة المتاجر التي تعمل بها."/><PrimaryButton label="إدارة المتجر" onPress={() => router.push('/my-store')}/><PrimaryButton label="المتاجر التي أعمل بها" variant="secondary" onPress={() => router.push('/my-stores')}/><PrimaryButton label="ملف البائع" variant="secondary" onPress={() => router.push('/seller-profile')}/></SectionCard> : null}
  {!loading && storeLoadError ? <SectionCard><Notice>{storeLoadError}</Notice><PrimaryButton label="المتاجر التي أعمل بها" variant="secondary" onPress={() => router.push('/my-stores')}/></SectionCard> : null}
  {!loading && store ? <>
   <SectionCard><Text tone="ink" strong size={18}>{store.name}</Text><Text style={{
      textAlign: 'right', color: colors.muted, lineHeight: 21
    }}>{store.city || 'الموقع غير محدد'} · الحالة: {store.status === 'PENDING' ? 'بانتظار المراجعة' : store.status === 'BLOCKED' ? 'محظور' : store.status === 'ACTIVE' ? 'نشط' : store.status || 'غير محددة'}</Text><View style={{
      flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm
    }}><View style={{
      borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: profile?.verified || store.sellerProfile?.verified ? colors.successSoft : colors.warningSoft
    }}><Text style={{
      color: profile?.verified || store.sellerProfile?.verified ? colors.success : colors.warningText, fontWeight: fontWeights.bold, fontSize: fontSizes[12]
    }}>{profile?.verified || store.sellerProfile?.verified ? '✓ بائع موثّق' : 'التحقق غير مكتمل'}</Text></View><View style={{
      borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.brandSoft
    }}><Text style={{
      color: colors.brandOnSoft, fontWeight: fontWeights.bold, fontSize: fontSizes[12]
    }}>{store.isOpen === true ? 'المتجر مفتوح' : store.isOpen === false ? 'المتجر مغلق' : 'ساعات العمل غير محددة'}</Text></View></View>
    <View style={{
      flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md
    }}><PrimaryButton label="إدارة المتجر" onPress={() => router.push('/my-store')}/><PrimaryButton label="إحصاءات المتجر" variant="secondary" onPress={() => router.push('/my-store-analytics')}/></View>
   </SectionCard>
   <SectionCard><Text style={{
      textAlign: 'right', color: colors.ink, ...typography.subtitle
    }}>لمحة سريعة</Text><View style={{
      flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm
    }}><Metric label="مشاهدات المتجر" value={analytics?.views ?? store.views ?? 0}/><Metric label="متابعو المتجر" value={analytics?.followers ?? store._count?.followers ?? 0}/><Metric label="المنتجات النشطة" value={analytics?.activeProducts ?? store._count?.products ?? 0}/><Metric label="العروض النشطة" value={analytics?.activePromotions ?? '—'}/></View></SectionCard>
   <SectionCard><Text style={{
      textAlign: 'right', color: colors.ink, ...typography.subtitle
    }}>مهام اليوم</Text>{!(profile?.verified || store.sellerProfile?.verified) ? <Notice tone="warning">أكمل متطلبات توثيق ملف البائع إذا كانت متاحة لحسابك.</Notice> : null}{profile?.suspended ? <Notice>ملف البائع موقوف؛ راجع الدعم لمعرفة التفاصيل.</Notice> : null}<PrimaryButton label="إدارة المنتجات" variant="secondary" onPress={() => router.push('/my-products')}/><PrimaryButton label="إدارة العروض" variant="secondary" onPress={() => router.push('/store-promotions')}/><PrimaryButton label="طلبات المتجر" variant="secondary" onPress={() => router.push('/seller-orders')}/><PrimaryButton label="طلبات الخدمات" variant="secondary" onPress={() => router.push('/service-requests')}/><PrimaryButton label="فريق المتجر والدعوات" variant="secondary" onPress={() => router.push('/store-team')}/></SectionCard>
  </> : null}
 </PageShell>;
}
