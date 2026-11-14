import { memo, useCallback } from 'react';
import { View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';

import { pushOnce } from '@/lib/navigation';
import { AppText as Text } from '@/components/ui/AppText';
import { Avatar, EmptyState, ErrorState, LoadingState, SectionCard, SectionHeader } from '@/components/ui';
import { PageList } from '@/components/ui/PageList';
import { RatingStars } from '@/components/ui/RatingStars';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';
import { fetchSellerRanking, type RankedSeller } from '@/features/discovery/discovery.api';
import { useAsyncResource } from '@/hooks/useAsyncResource';

const MEDALS = ['🥇', '🥈', '🥉'];

const SellerRow = memo(function SellerRow({ seller, onOpen }: { seller: RankedSeller; onOpen: (userId: string) => void }) {
  const { colors } = useAppTheme();
  return (
    <SectionCard
      accessibilityLabel={`عرض ملف ${seller.displayName || 'بائع'}، الترتيب ${seller.rank}`}
      onPress={() => onOpen(seller.userId)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      <View style={{ width: 36, alignItems: 'center' }}>
        <Text style={{ fontWeight: fontWeights.bold, color: seller.rank <= 3 ? colors.brand : colors.muted, fontSize: fontSizes[16] }}>
          {seller.rank <= 3 ? MEDALS[seller.rank - 1] : `#${seller.rank}`}
        </Text>
      </View>
      <Avatar uri={seller.avatarUrl} name={seller.displayName} size="lg" fallbackInitial="ب" />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text tone="ink" strong>
          {seller.displayName || 'بائع'}
          {seller.verified ? ' ✓' : ''}
        </Text>
        <Text tone="muted" size={12}>
          {seller.city || 'الموقع غير محدد'} · {seller.activeAds} إعلان نشط
        </Text>
        <RatingStars score={seller.averageRating} count={seller.totalRatings} />
      </View>
    </SectionCard>
  );
});

const keyExtractor = (seller: RankedSeller) => seller.sellerProfileId;

export default function SellersRankingScreen() {
  const { colors } = useAppTheme();
  const { data, loading, refreshing, error, reload } = useAsyncResource<RankedSeller[]>(
    (signal) => fetchSellerRanking(30, signal),
    { key: 'seller-ranking:30', tag: 'seller-ranking' },
  );
  const items = data ?? [];
  const openSeller = useCallback((userId: string) => pushOnce({ pathname: '/profile/[id]', params: { id: userId } }), []);
  const renderItem = useCallback(({ item }: { item: RankedSeller }) => <SellerRow seller={item} onOpen={openSeller} />, [openSeller]);

  return (
    <PageList
      title="أفضل البائعين"
      refreshControl={
        <BrandRefreshControl
          refreshing={refreshing}
          onRefresh={() => void reload({ soft: true })}
        />
      }
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      header={
        <>
          <SectionHeader title="الترتيب" subtitle="يعتمد على التقييم والثقة وسرعة الرد والنشاط." />
          {loading ? <LoadingState message="جاري تحميل الترتيب…" /> : null}
          {error ? <ErrorState title="تعذر تحديث ترتيب البائعين" description={error} onAction={() => void reload()} /> : null}
          {!loading && !error && items.length === 0 ? (
            <EmptyState title="لا يوجد ترتيب بعد" description="لا يوجد بائعون لديهم نشاط كافٍ للترتيب بعد." />
          ) : null}
        </>
      }
    />
  );
}
