import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { Spinner, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { useLocalSearchParams, router } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { fetchServiceProvider, fetchProviderServices, type ProviderSummary } from '@/features/services/providers.api';
import type { ServiceListing } from '@/features/services/services.api';
import { spacing } from '@/theme/tokens';
import { RatingStars } from '@/components/ui/RatingStars';
import { ShareButton } from '@/components/ui/ShareButton';
function price(value: ServiceListing['price'], type?: string): string {
    if (type === 'NEGOTIABLE' || value == null)
        return 'السعر عند التواصل';
    const n = Number(value);
    return Number.isFinite(n) ? formatMoney(n) : 'السعر غير متاح';
}
export default function ServiceProviderDetailScreen() {
    const { colors } = useAppTheme();
    const params = useLocalSearchParams<{
        id?: string | string[];
    }>();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    const [provider, setProvider] = useState<ProviderSummary | null>(null);
    const [services, setServices] = useState<ServiceListing[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const seq = useRef(0);
    const load = useCallback(async () => {
        const current = ++seq.current;
        if (!id) {
            setLoading(false);
            setError('معرّف مقدم الخدمة غير صالح.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [pR, sR] = await Promise.allSettled([fetchServiceProvider(id), fetchProviderServices(id, 1, 20)]);
            if (current !== seq.current)
                return;
            if (pR.status === 'rejected')
                throw pR.reason;
            setProvider(pR.value);
            if (sR.status === 'fulfilled') {
                setServices(sR.value.items);
                setPage(sR.value.page);
                setTotalPages(sR.value.totalPages);
            }
            else
                setError(sR.reason instanceof Error ? sR.reason.message : 'تعذر تحميل خدمات مقدم الخدمة.');
        }
        catch (e) {
            if (current === seq.current)
                setError(e instanceof Error ? e.message : 'تعذر تحميل الملف.');
        }
        finally {
            if (current === seq.current)
                setLoading(false);
        }
    }, [id]);
    useEffect(() => {
        void load();
        return () => {
            seq.current += 1;
        };
    }, [load]);
    const loadMore = async () => {
        if (!id || loadingMore || page >= totalPages)
            return;
        const current = seq.current;
        setLoadingMore(true);
        try {
            const result = await fetchProviderServices(id, page + 1, 20);
            if (current === seq.current) {
                setServices(old => {
                    const ids = new Set(old.map(x => x.id));
                    return [...old, ...result.items.filter(x => !ids.has(x.id))];
                });
                setPage(result.page);
                setTotalPages(result.totalPages);
            }
        }
        catch (e) {
            if (current === seq.current)
                setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من الخدمات.');
        }
        finally {
            if (current === seq.current)
                setLoadingMore(false);
        }
    };
    const phone = (provider?.contactPhone || '').replace(/[^0-9+]/g, '');
    const phoneValid = /^\+?[0-9]{7,15}$/.test(phone);
    return <PageShell title="ملف مقدم الخدمة">{loading ? <Spinner color={colors.brand}/> : error && !provider ? <Notice>{error}</Notice> : provider ? <>
  <SectionCard><Text tone="ink" strong size={20}>{provider.businessName || provider.sellerProfile?.displayName || 'مقدم خدمة'}</Text><Text style={{
            textAlign: 'right', color: colors.muted, lineHeight: 22
        }}>{provider.description || 'لا يوجد وصف.'}</Text><RatingStars score={provider.sellerProfile?.averageRating} count={provider.sellerProfile?.totalRatings}/>{provider.sellerProfile?.id ? <Pressable accessibilityRole="link" onPress={() => pushOnce({
            pathname: '/service-reviews', params: { sellerProfileId: provider.sellerProfile?.id }
        })}><Text tone="brand" strong>قراءة التقييمات وإضافة تقييم ←</Text></Pressable> : null}<Text tone="muted">حالة التوفر: {provider.availabilityStatus === 'AVAILABLE' ? 'متاح' : provider.availabilityStatus === 'BUSY' ? 'مشغول' : 'غير محدد'}</Text><Text tone="muted">مناطق الخدمة: {provider.serviceAreaCities?.join('، ') || 'غير محددة'}</Text>{provider.contactPhone ? <><Text tone="ink">رقم التواصل: {provider.contactPhone}</Text><View style={{
            flexDirection: 'row', gap: spacing.sm
        }}><PrimaryButton label="اتصال" disabled={!phoneValid} variant="secondary" onPress={() => {
            if (phoneValid)
                void Linking.openURL(`tel:${phone}`);
        }}/><PrimaryButton label="واتساب" disabled={!phoneValid} variant="secondary" onPress={() => {
            if (phoneValid)
                void Linking.openURL(`https://wa.me/${phone.replace(/^\+/, '')}`);
        }}/></View></> : null}<ShareButton resource="profile" id={provider.sellerProfile?.userId || provider.id} title={provider.businessName || provider.sellerProfile?.displayName || 'مقدم خدمة'}/><PrimaryButton label="الإبلاغ عن مقدم الخدمة" variant="secondary" onPress={() => router.push({
            pathname: '/report/[targetType]/[targetId]', params: {
                targetType: 'users', targetId: provider.sellerProfile?.userId || provider.id
            }
        })}/></SectionCard>
  <Text tone="ink" strong size={18}>الخدمات المنشورة</Text>{services.length === 0 && !loading ? <Notice tone="muted">لم تُنشر خدمات لهذا الحساب بعد.</Notice> : services.map(s => <Pressable accessibilityRole="link" key={s.id} onPress={() => router.push({
            pathname: '/services/[id]', params: { id: s.id }
        })}><SectionCard><Text tone="ink" strong size={16}>{s.title}</Text><Text tone="muted" numberOfLines={2}>{s.description}</Text><Text tone="brand" strong>{price(s.price, s.pricingType)}</Text></SectionCard></Pressable>)}{page < totalPages ? <PrimaryButton label={loadingMore ? 'جارٍ تحميل الخدمات…' : 'تحميل المزيد من الخدمات'} busy={loadingMore} variant="secondary" onPress={() => void loadMore()}/> : null}{error ? <Notice>{error}</Notice> : null}
 </> : null}</PageShell>;
}
