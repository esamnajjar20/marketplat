import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { fontSizes, colors, elevation, radius, sizes, spacing, typography, ux } from '@/theme/tokens';
import { formatMoney } from '@/lib/formatters';

export type ProductCardData = {
  id: string;
  name: string;
  price?: number | string | null;
  discountPrice?: number | string | null;
  effectivePrice?: { price?: number | string | null } | null;
  images?: string[] | null;
  category?: { name?: string; nameAr?: string | null } | null;
};

function priceLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'السعر عند التواصل';
  const amount = Number(value);
  return Number.isFinite(amount) ? formatMoney(amount) : 'السعر عند التواصل';
}

/** بطاقة منتج قابلة لإعادة الاستخدام — row أو grid */
export function ProductCard({
  product,
  layout = 'row',
  onPress,
  style,
}: {
  product: ProductCardData;
  layout?: 'row' | 'grid';
  onPress: () => void;
  style?: ViewStyle;
}) {
  const image = Array.isArray(product.images)
    ? product.images.find((url) => typeof url === 'string' && /^https?:/i.test(url))
    : undefined;
  const amount = product.effectivePrice?.price ?? product.discountPrice ?? product.price;
  const grid = layout === 'grid';
  const hasDiscount =
    product.discountPrice != null &&
    product.price != null &&
    Number(product.discountPrice) < Number(product.price);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`عرض المنتج ${product.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        grid ? styles.gridCard : styles.rowCard,
        pressed && styles.pressed,
        style,
      ]}
    >
      {image ? (
        <AppImage
          uri={image}
          style={grid ? styles.gridImage : styles.rowImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[grid ? styles.gridImage : styles.rowImage, styles.placeholder]}>
          <Text style={styles.glyph}>◇</Text>
        </View>
      )}
      <View style={grid ? styles.gridBody : styles.rowBody}>
        <Text numberOfLines={2} style={styles.name}>
          {product.name}
        </Text>
        {product.category?.nameAr || product.category?.name ? (
          <Text numberOfLines={1} style={styles.category}>
            {product.category.nameAr || product.category.name}
          </Text>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{priceLabel(amount)}</Text>
          {hasDiscount ? (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>خصم</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowCard: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...elevation.sm,
  },
  gridCard: {
    width: 160,
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...elevation.sm,
  },
  pressed: { opacity: ux.pressedOpacity },
  rowImage: {
    width: sizes.cardImageRow,
    height: sizes.cardImageRow,
    borderRadius: radius.control,
    backgroundColor: colors.border,
  },
  gridImage: {
    width: '100%',
    height: sizes.cardImageGrid,
    borderRadius: radius.control,
    backgroundColor: colors.border,
  },
  placeholder: {
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: colors.brandOnSoft, fontSize: fontSizes[28] },
  rowBody: { flex: 1, alignItems: 'flex-end', gap: 3, justifyContent: 'center' },
  gridBody: { alignItems: 'flex-end', gap: 3, paddingHorizontal: 2 },
  name: {
    ...typography.bodyStrong,
    color: colors.ink,
    textAlign: 'right',
    width: '100%',
  },
  category: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'right',
    width: '100%',
  },
  priceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  price: {
    ...typography.bodyStrong,
    color: colors.brand,
    textAlign: 'right',
  },
  discountBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountText: {
    ...typography.overline,
    color: colors.accent,
  },
});
