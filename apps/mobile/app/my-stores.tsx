import { useAppTheme } from '@/theme/ThemeProvider';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyActiveStoreMemberships, type StoreMembership } from '@/features/commerce/store-management.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { spacing, fontWeights } from '@/theme/tokens';
import { roleLabel, statusLabel } from '@/lib/status-labels';

export default function MyStoresScreen() {
  const { colors } = useAppTheme();

  const { accessToken } = useAuth();
  const [items, setItems] = useState<StoreMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!accessToken) { setLoading(false); return; }
    setLoading(true); setError('');
    try { setItems(await fetchMyActiveStoreMemberships(accessToken)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المتاجر.'); }
    finally { setLoading(false); }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  return <PageShell title="المتاجر التي أعمل بها">
    {!accessToken ? <><Notice>سجّل الدخول لعرض المتاجر التي أضافتك إلى فريقها.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : null}
    {loading ? <Notice tone="muted">جارٍ تحميل المتاجر…</Notice> : null}
    {error ? <><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void load()} /></> : null}
    {!loading && !error && accessToken && items.length === 0 ? <SectionCard><Notice tone="muted">لا توجد متاجر مرتبطة بعضوية نشطة. ستظهر هنا المتاجر التي تقبل دعواتها.</Notice><PrimaryButton label="عرض دعوات المتاجر" onPress={() => router.push('/store-invites')} /><PrimaryButton label="إعداد ملف البائع" variant="secondary" onPress={() => router.push('/seller-profile')} /></SectionCard> : null}
    {items.map((item) => <SectionCard key={item.id}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {item.store.logoUrl ? <AppImage uri={item.store.logoUrl} style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: colors.border }} /> : <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>م</Text></View>}
        <View style={{ flex: 1, gap: spacing.xs }}><Text tone="ink" strong size={16}>{item.store.name}</Text><Text tone="muted" size={12}>{roleLabel(item.role)} · {statusLabel(item.store.status)}</Text>{item.store.city ? <Text tone="muted" size={12}>{item.store.city}</Text> : null}</View>
      </View>
      <PrimaryButton label="فتح صفحة المتجر" variant="secondary" onPress={() => router.push(`/stores/${encodeURIComponent(item.store.id)}`)} />
      {item.role === 'MANAGER' || item.role === 'EDITOR' ? <PrimaryButton label="إدارة المنتجات" onPress={() => router.push('/my-products')} /> : null}
      {item.role === 'MANAGER' ? <>
        <PrimaryButton label="إدارة العروض" variant="secondary" onPress={() => router.push('/store-promotions')} />
        <PrimaryButton label="مجموعات المنتجات" variant="secondary" onPress={() => router.push('/store-collections')} />
        <PrimaryButton label="فريق المتجر" variant="secondary" onPress={() => router.push({ pathname: '/store-team', params: { storeId: item.store.id } })} />
      </> : null}
    </SectionCard>)}
  </PageShell>;
}
