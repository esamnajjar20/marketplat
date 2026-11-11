import { useAppTheme } from '@/theme/ThemeProvider';
import { formatNumber } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Spinner, PageShell, Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { apiRequest } from '@/api/client';
import { RatingStars } from '@/components/ui/RatingStars';
import { spacing, typography } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';
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
    const [data, setData] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        if (!slug) {
            setError('رابط المتجر غير صالح.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const response = await apiRequest<Envelope<Stats>>(`/api/v1/public/stores/${encodeURIComponent(slug)}/stats`);
            if (response.success !== true || !response.data)
                throw new Error(response.message || 'تعذر تحميل إحصاءات المتجر.');
            setData(response.data);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر تحميل الإحصاءات.');
        }
        finally {
            setLoading(false);
        }
    }, [slug]);
    useEffect(() => {
        void load();
    }, [load]);
    return <PageShell title="إحصاءات المتجر">{loading ? <Spinner color={colors.brand}/> : error ? <><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()}/></> : data ? <><SectionCard><Text style={{
        ...typography.title, color: colors.ink, textAlign: 'right'
    }}>{data.storeName}</Text>{data.verifiedSeller ? <Text style={{
        color: colors.brand, textAlign: 'right', marginTop: spacing.xs
    }}>✓ بائع موثّق</Text> : null}<View style={{ marginTop: spacing.md }}><RatingStars score={data.averageRating} count={data.reviewCount}/></View></SectionCard><View style={{
        flexDirection: 'row', gap: spacing.sm
    }}><SectionCard><Text tone="muted">المبيعات</Text><Text tone="ink" strong size={26}>{formatNumber(data.totalSales)}</Text></SectionCard><SectionCard><Text tone="muted">التقييمات</Text><Text tone="ink" strong size={26}>{formatNumber(data.reviewCount)}</Text></SectionCard></View><SectionCard><Text tone="muted">آخر عملية بيع</Text><Text tone="ink" strong>{data.lastSaleAt ? formatSafeDate(data.lastSaleAt, 'date') : 'لا توجد مبيعات مسجلة'}</Text></SectionCard><PrimaryButton label="عرض المتجر" variant="secondary" onPress={() => pushOnce(`/stores/${encodeURIComponent(data.storeId)}`)}/></> : null}</PageShell>;
}
