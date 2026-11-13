import { useAppTheme } from '@/theme/ThemeProvider';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { memo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyActiveStoreMemberships, type StoreMembership } from '@/features/commerce/store-management.api';
import { Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { PageList } from '@/components/ui/PageList';
import { spacing, fontWeights, radius } from '@/theme/tokens';
import { roleLabel, statusLabel } from '@/lib/status-labels';
import { useAsyncResource } from '@/hooks/useAsyncResource';

const EMPTY_STORES: StoreMembership[] = [];

const MyStoreRow = memo(function MyStoreRow({ item }: { item: StoreMembership }) {
  const { colors } = useAppTheme();
  return <SectionCard>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      {item.store.logoUrl ? <AppImage uri={item.store.logoUrl} variant="list" style={{ width: 52, height: 52, borderRadius: radius.control, backgroundColor: colors.border }} /> : <View style={{ width: 52, height: 52, borderRadius: radius.control, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>م</Text></View>}
      <View style={{ flex: 1, gap: spacing.xs }}><Text tone="ink" strong size={16}>{item.store.name}</Text><Text tone="muted" size={12}>{roleLabel(item.role)} · {statusLabel(item.store.status)}</Text>{item.store.city ? <Text tone="muted" size={12}>{item.store.city}</Text> : null}</View>
    </View>
    <PrimaryButton label="فتح صفحة المتجر" variant="secondary" onPress={() => router.push(`/stores/${encodeURIComponent(item.store.id)}`)} />
    {item.role === 'MANAGER' || item.role === 'EDITOR' ? <PrimaryButton label="إدارة المنتجات" onPress={() => router.push('/my-products')} /> : null}
    {item.role === 'MANAGER' ? <>
      <PrimaryButton label="إدارة العروض" variant="secondary" onPress={() => router.push('/store-promotions')} />
      <PrimaryButton label="مجموعات المنتجات" variant="secondary" onPress={() => router.push('/store-collections')} />
      <PrimaryButton label="فريق المتجر" variant="secondary" onPress={() => router.push({ pathname: '/store-team', params: { storeId: item.store.id } })} />
    </> : null}
  </SectionCard>;
});

const storeKey = (item: StoreMembership) => item.id;
const renderStore = ({ item }: { item: StoreMembership }) => <MyStoreRow item={item} />;

export default function MyStoresScreen() {
  const { accessToken } = useAuth();
  const resource = useAsyncResource<StoreMembership[]>(
    () => fetchMyActiveStoreMemberships(accessToken as string),
    {
      key: accessToken ? '1' : '0',
      manual: !accessToken,
      tag: 'my-stores',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل المتاجر.'),
    },
  );
  const { loading, reload: load } = resource;
  const items = resource.data ?? EMPTY_STORES;
  const error = resource.error ?? '';
  const header = <>
    {!accessToken ? <><Notice>سجّل الدخول لعرض المتاجر التي أضافتك إلى فريقها.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : null}
    {loading ? <Notice tone="muted">جارٍ تحميل المتاجر…</Notice> : null}
    {error ? <><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void load()} /></> : null}
    {!loading && !error && accessToken && items.length === 0 ? <SectionCard><Notice tone="muted">لا توجد متاجر مرتبطة بعضوية نشطة. ستظهر هنا المتاجر التي تقبل دعواتها.</Notice><PrimaryButton label="عرض دعوات المتاجر" onPress={() => router.push('/store-invites')} /><PrimaryButton label="إعداد ملف البائع" variant="secondary" onPress={() => router.push('/seller-profile')} /></SectionCard> : null}
  </>;
  return <PageList title="المتاجر التي أعمل بها" data={items} keyExtractor={storeKey} renderItem={renderStore} header={header} />;
}
