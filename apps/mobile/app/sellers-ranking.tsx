import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { EmptyState, ErrorState, LoadingState, PageShell, SectionCard, SectionHeader } from '@/components/ui';
import { RatingStars } from '@/components/ui/RatingStars';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';
import { fetchSellerRanking, type RankedSeller } from '@/features/discovery/discovery.api';
import { useAsyncResource } from '@/hooks/useAsyncResource';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function SellersRankingScreen() {
  const { colors } = useAppTheme();
  const { data, loading, refreshing, error, reload } = useAsyncResource<RankedSeller[]>(
    (signal) => fetchSellerRanking(30, signal),
    { key: 'seller-ranking:30', tag: 'seller-ranking' },
  );
  const items = data ?? [];

  return (
    <PageShell
      title="أفضل البائعين"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void reload({ soft: true })}
          tintColor={colors.brand}
          colors={[colors.brand]}
        />
      }
    >
      <SectionHeader title="الترتيب" subtitle="يعتمد على التقييم والثقة وسرعة الرد والنشاط." />
      {loading ? <LoadingState message="جاري تحميل الترتيب…" /> : null}
      {error ? <ErrorState title="تعذر تحديث ترتيب البائعين" description={error} onAction={() => void reload()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="لا يوجد ترتيب بعد" description="لا يوجد بائعون لديهم نشاط كافٍ للترتيب بعد." />
      ) : null}
      {items.map((seller) => (
        <SectionCard
          key={seller.sellerProfileId}
          accessibilityLabel={`عرض ملف ${seller.displayName || 'بائع'}، الترتيب ${seller.rank}`}
          onPress={() => router.push({ pathname: '/profile/[id]', params: { id: seller.userId } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          <View style={{ width: 36, alignItems: 'center' }}>
            <Text style={{ fontWeight: fontWeights.bold, color: seller.rank <= 3 ? colors.brand : colors.muted, fontSize: fontSizes[16] }}>
              {seller.rank <= 3 ? MEDALS[seller.rank - 1] : `#${seller.rank}`}
            </Text>
          </View>
          {seller.avatarUrl ? (
            <AppImage uri={seller.avatarUrl} style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.border }} />
          ) : (
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.brandOnSoft, fontWeight: fontWeights.bold, fontSize: fontSizes[20] }}>
                {seller.displayName?.slice(0, 1) || 'ب'}
              </Text>
            </View>
          )}
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
      ))}
    </PageShell>
  );
}
