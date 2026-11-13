import { useAppTheme } from '@/theme/ThemeProvider';
import { formatNumber } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { View } from 'react-native';
import { Spinner, PageShell, Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { apiRequest } from '@/api/client';
import { RatingStars } from '@/components/ui/RatingStars';
import { spacing, typography } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';
import { useAsyncResource } from '@/hooks/useAsyncResource';
type Stats = {
    storeId: string;
    storeName: string;
    storeSlug: string;
    totalSales: number;
    averageRating: number;
    reviewCount: number;
    verifiedSeller: boolean;
    lastSaleAt: string | null;
};
type Envelope<T> = {
    success: boolean;
    message?: string;
    data?: T;
};
export default function PublicStoreStatsScreen() {
    const { colors } = useAppTheme();
    const { slug } = useLocalSearchParams<{
        slug: string;
    }>();
    const resource = useAsyncResource<Stats>(
        async (signal) => {
            if (!slug)
                throw new Error('رابط المتجر غير صالح.');
            const response = await apiRequest<Envelope<Stats>>(`/api/v1/public/stores/${encodeURIComponent(slug)}/stats`, { signal });
            if (response.success !== true || !response.data)
                throw new Error(response.message || 'تعذر تحميل إحصاءات المتجر.');
            return response.data;
        },
        {
            key: slug ?? '',
            tag: 'public-store-stats',
            mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الإحصاءات.'),
        },
    );
    const { data, loading, reload: load } = resource;
    const error = resource.error ?? '';
    return <PageShell title="إحصاءات المتجر">{loading ? <Spinner color={colors.brand}/> : error ? <><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()}/></> : data ? <><SectionCard><Text style={{
        ...typography.title, color: colors.ink, textAlign: 'right'
    }}>{data.storeName}</Text>{data.verifiedSeller ? <Text style={{
        color: colors.brand, textAlign: 'right', marginTop: spacing.xs
    }}>✓ بائع موثّق</Text> : null}<View style={{ marginTop: spacing.md }}><RatingStars score={data.averageRating} count={data.reviewCount}/></View></SectionCard><View style={{
        flexDirection: 'row', gap: spacing.sm
    }}><SectionCard><Text tone="muted">المبيعات</Text><Text tone="ink" strong size={26}>{formatNumber(data.totalSales)}</Text></SectionCard><SectionCard><Text tone="muted">التقييمات</Text><Text tone="ink" strong size={26}>{formatNumber(data.reviewCount)}</Text></SectionCard></View><SectionCard><Text tone="muted">آخر عملية بيع</Text><Text tone="ink" strong>{data.lastSaleAt ? formatSafeDate(data.lastSaleAt, 'date') : 'لا توجد مبيعات مسجلة'}</Text></SectionCard><PrimaryButton label="عرض المتجر" variant="secondary" onPress={() => pushOnce(`/stores/${encodeURIComponent(data.storeId)}`)}/></> : null}</PageShell>;
}
