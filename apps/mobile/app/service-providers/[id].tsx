import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useCallback } from 'react';
import { Linking, View } from 'react-native';
import { Spinner, Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { PageList } from '@/components/ui/PageList';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { toPaginatedResponse } from '@/lib/pagination';
import { useLocalSearchParams, router } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { fetchServiceProvider, fetchProviderServices } from '@/features/services/providers.api';
import type { ServiceListing } from '@/features/services/services.api';
import { spacing } from '@/theme/tokens';
import { RatingStars } from '@/components/ui/RatingStars';
import { ShareButton } from '@/components/ui/ShareButton';
import { telUrl, whatsappUrl } from '@/lib/contact-links';
function price(value: ServiceListing['price'], type?: string): string {
    if (type === 'NEGOTIABLE' || value == null)
        return 'السعر عند التواصل';
    const n = Number(value);
    return Number.isFinite(n) ? formatMoney(n) : 'السعر غير متاح';
}
const EMPTY_SERVICES: ServiceListing[] = [];
const serviceKey = (s: ServiceListing) => s.id;
/** صف خدمة — memo + onPress ثابت لكل id. */
const ServiceRow = memo(function ServiceRow({ s }: { s: ServiceListing }) {
    const onPress = useCallback(() => router.push({ pathname: '/services/[id]', params: { id: s.id } }), [s.id]);
    return <Pressable accessibilityRole="link" onPress={onPress}><SectionCard><Text tone="ink" strong size={16}>{s.title}</Text><Text tone="muted" numberOfLines={2}>{s.description}</Text><Text tone="brand" strong>{price(s.price, s.pricingType)}</Text></SectionCard></Pressable>;
});
const renderService = ({ item }: { item: ServiceListing }) => <ServiceRow s={item} />;
export default function ServiceProviderDetailScreen() {
    const { colors } = useAppTheme();
    const params = useLocalSearchParams<{
        id?: string | string[];
    }>();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    const providerRes = useAsyncResource(() => fetchServiceProvider(id as string), {
        key: id ?? '', manual: !id, tag: 'service-provider',
        mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الملف.'),
    });
    const provider = providerRes.data;
    const list = usePaginatedList<ServiceListing>({
        key: `provider-services:${id ?? ''}`,
        pageSize: 20,
        enabled: Boolean(id),
        fetchPage: async (page) => toPaginatedResponse(await fetchProviderServices(id as string, page, 20)),
        getItemKey: serviceKey,
        mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل خدمات مقدم الخدمة.'),
    });
    const loading = providerRes.loading;
    const error = !id ? 'معرّف مقدم الخدمة غير صالح.' : providerRes.error ?? '';
    const servicesError = list.loadMoreError || list.error;
    const phone = (provider?.contactPhone || '').replace(/[^0-9+]/g, '');
    const phoneValid = /^\+?[0-9]{7,15}$/.test(phone);
    const header = loading ? <Spinner color={colors.brand}/> : error && !provider ? <Notice>{error}</Notice> : provider ? <>
  <SectionCard><Text tone="ink" strong size={20}>{provider.businessName || provider.sellerProfile?.displayName || 'مقدم خدمة'}</Text><Text style={{
            textAlign: 'right', color: colors.muted, lineHeight: 22
        }}>{provider.description || 'لا يوجد وصف.'}</Text><RatingStars score={provider.sellerProfile?.averageRating} count={provider.sellerProfile?.totalRatings}/>{provider.sellerProfile?.id ? <Pressable accessibilityRole="link" onPress={() => pushOnce({
            pathname: '/service-reviews', params: { sellerProfileId: provider.sellerProfile?.id }
        })}><Text tone="brand" strong>قراءة التقييمات وإضافة تقييم ←</Text></Pressable> : null}<Text tone="muted">حالة التوفر: {provider.availabilityStatus === 'AVAILABLE' ? 'متاح' : provider.availabilityStatus === 'BUSY' ? 'مشغول' : 'غير محدد'}</Text><Text tone="muted">مناطق الخدمة: {provider.serviceAreaCities?.join('، ') || 'غير محددة'}</Text>{provider.contactPhone ? <><Text tone="ink">رقم التواصل: {provider.contactPhone}</Text><View style={{
            flexDirection: 'row', gap: spacing.sm
        }}><PrimaryButton label="اتصال" disabled={!phoneValid} variant="secondary" onPress={() => {
            if (phoneValid)
                void Linking.openURL(telUrl(phone));
        }}/><PrimaryButton label="واتساب" disabled={!phoneValid} variant="secondary" onPress={() => {
            if (phoneValid)
                void Linking.openURL(whatsappUrl(phone));
        }}/></View></> : null}<ShareButton resource="profile" id={provider.sellerProfile?.userId || provider.id} title={provider.businessName || provider.sellerProfile?.displayName || 'مقدم خدمة'}/><PrimaryButton label="الإبلاغ عن مقدم الخدمة" variant="secondary" onPress={() => router.push({
            pathname: '/report/[targetType]/[targetId]', params: {
                targetType: 'users', targetId: provider.sellerProfile?.userId || provider.id
            }
        })}/></SectionCard>
  <Text tone="ink" strong size={18}>الخدمات المنشورة</Text>{list.items.length === 0 && !list.loading ? <Notice tone="muted">لم تُنشر خدمات لهذا الحساب بعد.</Notice> : null}
 </> : null;
    const footer = provider ? <>{list.hasNextPage ? <PrimaryButton label={list.loadingMore ? 'جارٍ تحميل الخدمات…' : 'تحميل المزيد من الخدمات'} busy={list.loadingMore} variant="secondary" onPress={() => void list.loadMore()}/> : null}{servicesError ? <Notice>{servicesError}</Notice> : null}</> : null;
    return <PageList title="ملف مقدم الخدمة" data={provider ? list.items : EMPTY_SERVICES} keyExtractor={serviceKey} renderItem={renderService} header={header} footer={footer}/>;
}
