import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, elevation, radius, spacing, typography, ux } from '@/theme/tokens';

/**
 * بطاقة موحّدة لعناصر السوق في القوائم (منتج / خدمة / متجر / إعلان).
 * RTL: الصورة يمينًا، النص يسارًا بصريًا عبر row-reverse.
 */
export function CatalogCard({
  title,
  subtitle,
  meta,
  price,
  imageUri,
  glyph = '◇',
  onPress,
  badge,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  price?: string;
  imageUri?: string | null;
  glyph?: string;
  onPress: () => void;
  badge?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.glyph}>{glyph}</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {price ? <Text style={styles.price}>{price}</Text> : null}
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.chevron}>‹</Text>
    </Pressable>
  );
}

/**
 * بطاقة إعلان أفقية (صورة + عنوان + سعر) — للرئيسية والقوائم.
 */
export function AdCard({
  title,
  price,
  meta,
  imageUri,
  isFavorite,
  isNegotiable,
  onPress,
  onToggleFavorite,
  onImageError,
}: {
  title: string;
  price: string;
  meta?: string;
  imageUri?: string | null;
  isFavorite?: boolean;
  isNegotiable?: boolean;
  onPress: () => void;
  onToggleFavorite?: () => void;
  onImageError?: () => void;
}) {
  return (
    <View style={styles.adCard}>
      {onToggleFavorite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          onPress={onToggleFavorite}
          hitSlop={10}
          style={styles.favoriteBtn}
        >
          <Text style={[styles.favoriteIcon, isFavorite && styles.favoriteActive]}>
            {isFavorite ? '♥' : '♡'}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`عرض الإعلان: ${title}`}
        onPress={onPress}
        style={styles.adMain}
      >
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.adImage}
            resizeMode="cover"
            onError={onImageError}
          />
        ) : (
          <View style={styles.adImagePlaceholder}>
            <Text style={styles.glyph}>◇</Text>
          </View>
        )}
        <View style={styles.adInfo}>
          <Text numberOfLines={2} style={styles.adTitle}>
            {title}
          </Text>
          <Text style={styles.price}>{price}</Text>
          {meta ? (
            <Text numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          ) : null}
          {isNegotiable ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>قابل للتفاوض</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...elevation.sm,
  },
  pressed: { opacity: ux.pressedOpacity },
  image: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  imagePlaceholder: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 28, color: colors.brand },
  body: { flex: 1, gap: 4, alignItems: 'flex-end' },
  title: {
    ...typography.bodyStrong,
    color: colors.ink,
    textAlign: 'right',
    width: '100%',
  },
  subtitle: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'right',
    width: '100%',
  },
  price: {
    ...typography.bodyStrong,
    color: colors.brand,
    textAlign: 'right',
  },
  meta: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'right',
    width: '100%',
  },
  badge: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    ...typography.overline,
    color: colors.brandDark,
  },
  chevron: {
    color: colors.muted,
    fontSize: 22,
    fontWeight: '300',
    paddingHorizontal: 2,
  },

  adCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...elevation.sm,
  },
  favoriteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteIcon: { color: colors.muted, fontSize: 18 },
  favoriteActive: { color: colors.danger },
  adMain: { flexDirection: 'row-reverse', minHeight: 120 },
  adImage: { width: 112, minHeight: 120, backgroundColor: colors.border },
  adImagePlaceholder: {
    width: 112,
    minHeight: 120,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adInfo: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  adTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
    textAlign: 'right',
    width: '100%',
  },
});
