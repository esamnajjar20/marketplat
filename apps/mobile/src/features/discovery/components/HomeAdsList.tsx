/**
 * قائمة إعلانات الرئيسية — مستخرجة لتقليل حجم app/index.tsx.
 */
import { ActivityIndicator, FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { AdCard } from '@/components/MarketCards';
import { adListProps } from '@/lib/listPerformance';
import { openScreen } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { colors, radius, spacing } from '@/theme/tokens';
import type { AdListItem } from '@/features/ads/ads.api';
import { formatPrice } from '@/features/discovery/homeFormatters';

type Props = {
  ads: AdListItem[];
  favoriteIds: string[];
  failedImageIds: string[];
  loadingMore: boolean;
  page: number;
  totalPages: number;
  onToggleFavorite: (id: string) => void;
  onLoadMore: () => void;
  onImageError: (id: string) => void;
};

export function HomeAdsList({
  ads,
  favoriteIds,
  failedImageIds,
  loadingMore,
  page,
  totalPages,
  onToggleFavorite,
  onLoadMore,
  onImageError,
}: Props) {
  return (
    <View style={styles.wrap}>
      <FlatList
        data={ads}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        {...adListProps}
        renderItem={({ item }) => {
          const imageUri =
            item.images?.[0] && !failedImageIds.includes(item.id) ? item.images?.[0] : null;
          return (
            <AdCard
              title={item.title}
              price={formatPrice(item.price)}
              meta={item.city ?? undefined}
              imageUri={imageUri}
              isFavorite={favoriteIds.includes(item.id)}
              isNegotiable={Boolean(item.isNegotiable)}
              onPress={() => openScreen(routes.ads.detail(item.id))}
              onToggleFavorite={() => onToggleFavorite(item.id)}
              onImageError={() => onImageError(item.id)}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListFooterComponent={
          !loadingMore && page < totalPages ? (
            <Pressable
              accessibilityRole="button"
              onPress={onLoadMore}
              style={styles.loadMore}
            >
              <Text style={styles.loadMoreText}>تحميل المزيد من الإعلانات</Text>
            </Pressable>
          ) : loadingMore ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.lg }} />
          ) : undefined
             }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  loadMore: {
    marginTop: spacing.md,
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  loadMoreText: { color: colors.brand, fontWeight: '800' },
});
