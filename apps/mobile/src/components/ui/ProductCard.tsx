import { Image, Pressable, Text, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme/tokens';

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
  return Number.isFinite(amount) ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(amount)} ₪` : 'السعر عند التواصل';
}

/** Reusable compact product card; the caller owns navigation and data fetching. */
export function ProductCard({ product, layout = 'row', onPress, style }: {
  product: ProductCardData;
  layout?: 'row' | 'grid';
  onPress: () => void;
  style?: ViewStyle;
}) {
  const image = Array.isArray(product.images) ? product.images.find((url) => typeof url === 'string' && /^https?:/i.test(url)) : undefined;
  const amount = product.effectivePrice?.price ?? product.discountPrice ?? product.price;
  const grid = layout === 'grid';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`عرض المنتج ${product.name}`}
      onPress={onPress}
      style={({ pressed }) => [{
        width: grid ? 156 : '100%',
        flexDirection: grid ? 'column' : 'row-reverse',
        gap: spacing.sm,
        padding: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.82 : 1,
      }, style]}
    >
      {image ? <Image source={{ uri: image }} style={{ width: '100%', height: grid ? 112 : 84, borderRadius: radius.control, backgroundColor: colors.border }} resizeMode="cover" /> : <View style={{ width: '100%', height: grid ? 112 : 84, borderRadius: radius.control, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontSize: 28 }}>◇</Text></View>}
      <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
        <Text numberOfLines={2} style={{ ...typography.bodyStrong, color: colors.ink, textAlign: 'right' }}>{product.name}</Text>
        {product.category?.nameAr || product.category?.name ? <Text numberOfLines={1} style={{ ...typography.caption, color: colors.muted, textAlign: 'right' }}>{product.category.nameAr || product.category.name}</Text> : null}
        <Text style={{ ...typography.bodyStrong, color: colors.brand, textAlign: 'right' }}>{priceLabel(amount)}</Text>
      </View>
    </Pressable>
  );
}
