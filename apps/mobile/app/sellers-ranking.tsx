import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fetchSellerRanking, type RankedSeller } from '@/features/discovery/discovery.api';
import { fontSizes, colors, radius, spacing } from '@/theme/tokens';
import { RatingStars } from '@/components/ui/RatingStars';
import { ErrorState } from '@/components/MobileUI';
import { useAsyncResource } from '@/hooks/useAsyncResource';

export default function SellersRankingScreen() {
  const { data, loading, refreshing, error, reload } = useAsyncResource<RankedSeller[]>(
    (signal) => fetchSellerRanking(30, signal),
    { key: 'seller-ranking:30', tag: 'seller-ranking' },
  );
  const items = data ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 36 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload({ soft: true })} tintColor={colors.brand} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
            <AppIcon name="back" size={24} color={colors.brand} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ textAlign: 'right', fontSize: fontSizes[24], fontWeight: '900', color: colors.ink }}>أفضل البائعين</Text>
            <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 20 }}>الترتيب يعتمد على التقييم والثقة وسرعة الرد والنشاط.</Text>
          </View>
        </View>
        {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
        {error ? <ErrorState title="تعذر تحديث ترتيب البائعين" description={error} onAction={() => void reload()} /> : null}
        {!loading && !error && items.length === 0 ? <Text style={{ textAlign: 'center', color: colors.muted, padding: 24 }}>لا يوجد بائعون لديهم نشاط كافٍ للترتيب بعد.</Text> : null}
        {items.map((seller) => (
          <Pressable
            key={seller.sellerProfileId}
            accessibilityRole="button"
            accessibilityLabel={`عرض ملف ${seller.displayName || 'بائع'}، الترتيب ${seller.rank}`}
            onPress={() => router.push({ pathname: '/profile/[id]', params: { id: seller.userId } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg }}
          >
            <View style={{ width: 36, alignItems: 'center' }}>
              <Text style={{ fontWeight: '900', color: seller.rank <= 3 ? colors.brand : colors.muted, fontSize: fontSizes[16] }}>{seller.rank <= 3 ? ['🥇', '🥈', '🥉'][seller.rank - 1] : `#${seller.rank}`}</Text>
            </View>
            {seller.avatarUrl ? <AppImage uri={seller.avatarUrl} style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.border }} /> : (
              <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.brandOnSoft, fontWeight: '900', fontSize: fontSizes[20] }}>{seller.displayName?.slice(0, 1) || 'ب'}</Text>
              </View>
            )}
            <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '900', textAlign: 'right' }}>{seller.displayName || 'بائع'}{seller.verified ? ' ✓' : ''}</Text>
              <Text style={{ color: colors.muted, fontSize: fontSizes[12], textAlign: 'right' }}>{seller.city || 'الموقع غير محدد'} · {seller.activeAds} إعلان نشط</Text>
              <RatingStars score={seller.averageRating} count={seller.totalRatings} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
