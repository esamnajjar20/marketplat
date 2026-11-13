import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppImage } from '@/components/AppImage';
import { AppIcon } from '@/components/Icons';
import { fontSizes, elevation, radius, sizes, spacing, typography, ux, fontWeights } from '@/theme/tokens';

type CatalogCardProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  price?: string;
  imageUri?: string | null;
  glyph?: string;
  /**
   * مفضّل داخل القوائم: مرّر `id` + `onPressItem` (دالة ثابتة عبر useCallback)
   * بدل `onPress` المنشأة داخل renderItem، حتى لا ينكسر React.memo.
   */
  id?: string;
  onPressItem?: (id: string) => void;
  /** يبقى مدعومًا للاستعمال خارج القوائم. */
  onPress?: () => void;
  badge?: string;
};

/**
 * بطاقة موحّدة لعناصر السوق في القوائم (منتج / خدمة / متجر / إعلان).
 * RTL: الصورة يمينًا، النص يسارًا بصريًا عبر row.
 * مغلّفة بـ React.memo لتقليل إعادة الرسم في القوائم الطويلة.
 */
function CatalogCardComponent({
  title,
  subtitle,
  meta,
  price,
  imageUri,
  glyph = '◇',
  id,
  onPressItem,
  onPress,
  badge,
}: CatalogCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  const handlePress = useCallback(() => {
    if (onPressItem && id !== undefined) onPressItem(id);
    else onPress?.();
  }, [id, onPress, onPressItem]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {imageUri ? (
        <AppImage uri={imageUri} style={styles.image} resizeMode="cover" variant="list" />
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
      <AppIcon name="forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export const CatalogCard = memo(CatalogCardComponent, (prev, next) => {
  return (
    prev.title === next.title &&
    prev.subtitle === next.subtitle &&
    prev.meta === next.meta &&
    prev.price === next.price &&
    prev.imageUri === next.imageUri &&
    prev.glyph === next.glyph &&
    prev.badge === next.badge &&
    prev.id === next.id &&
    prev.onPressItem === next.onPressItem &&
    prev.onPress === next.onPress
  );
});
CatalogCard.displayName = 'CatalogCard';

type AdCardProps = {
  title: string;
  price: string;
  meta?: string;
  imageUri?: string | null;
  isFavorite?: boolean;
  isNegotiable?: boolean;
  /**
   * داخل القوائم: مرّر `id` مع دوال *Item ثابتة (useCallback) — تستقبل الـ id.
   * الدوال القديمة (onPress / onToggleFavorite / onImageError) تبقى مدعومة.
   */
  id?: string;
  onPressItem?: (id: string) => void;
  onToggleFavoriteItem?: (id: string) => void;
  onImageErrorItem?: (id: string) => void;
  /** يخفي زر المفضلة مؤقتًا (مثلًا أثناء طلب الإزالة) كما كان يحدث عند تمرير undefined. */
  favoriteBusy?: boolean;
  onPress?: () => void;
  onToggleFavorite?: () => void;
  onImageError?: () => void;
};

/**
 * بطاقة إعلان أفقية (صورة + عنوان + سعر) — للرئيسية والقوائم.
 * تحسين 2026-11: نسب أوضح، ظل أقوى قليلًا، تايبو أهدأ، شارة أنظف.
 */
function AdCardComponent({
  title,
  price,
  meta,
  imageUri,
  isFavorite,
  isNegotiable,
  id,
  onPressItem,
  onToggleFavoriteItem,
  onImageErrorItem,
  favoriteBusy,
  onPress,
  onToggleFavorite,
  onImageError,
}: AdCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  const handlePress = useCallback(() => {
    if (onPressItem && id !== undefined) onPressItem(id);
    else onPress?.();
  }, [id, onPress, onPressItem]);
  const hasFavoriteAction = Boolean(onToggleFavoriteItem || onToggleFavorite) && !favoriteBusy;
  const handleToggleFavorite = useCallback(() => {
    if (onToggleFavoriteItem && id !== undefined) onToggleFavoriteItem(id);
    else onToggleFavorite?.();
  }, [id, onToggleFavorite, onToggleFavoriteItem]);
  const handleImageError = useCallback(() => {
    if (onImageErrorItem && id !== undefined) onImageErrorItem(id);
    else onImageError?.();
  }, [id, onImageError, onImageErrorItem]);

  return (
    <View style={styles.adCard}>
      {hasFavoriteAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          accessibilityState={{ selected: Boolean(isFavorite) }}
          onPress={handleToggleFavorite}
          hitSlop={8}
          style={({ pressed }) => [styles.favoriteBtn, pressed && styles.pressed]}
        >
          <Text style={[styles.favoriteIcon, isFavorite && styles.favoriteActive]}>
            {isFavorite ? '♥' : '♡'}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`عرض الإعلان: ${title}`}
        onPress={handlePress}
        style={({ pressed }) => [styles.adMain, pressed && styles.pressed]}
      >
        {imageUri ? (
          <AppImage
            uri={imageUri}
            style={styles.adImage}
            resizeMode="cover"
            variant="list"
            onError={handleImageError}
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

export const AdCard = memo(AdCardComponent, (prev, next) => {
  return (
    prev.title === next.title &&
    prev.price === next.price &&
    prev.meta === next.meta &&
    prev.imageUri === next.imageUri &&
    prev.isFavorite === next.isFavorite &&
    prev.isNegotiable === next.isNegotiable &&
    prev.id === next.id &&
    prev.favoriteBusy === next.favoriteBusy &&
    prev.onPressItem === next.onPressItem &&
    prev.onToggleFavoriteItem === next.onToggleFavoriteItem &&
    prev.onImageErrorItem === next.onImageErrorItem &&
    prev.onPress === next.onPress &&
    prev.onToggleFavorite === next.onToggleFavorite &&
    prev.onImageError === next.onImageError
  );
});
AdCard.displayName = 'AdCard';

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    ...elevation.sm,
  },
  pressed: { opacity: ux.pressedOpacity },
  image: {
    width: sizes.cardImageRow,
    height: sizes.cardImageRow,
    borderRadius: radius.control,
    backgroundColor: colors.border,
  },
  imagePlaceholder: {
    width: sizes.cardImageRow,
    height: sizes.cardImageRow,
    borderRadius: radius.control,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: fontSizes[28], color: colors.brandOnSoft },
  body: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
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
    marginTop: spacing.xxs,
  },
  meta: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'right',
    width: '100%',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.xxs,
  },
  badgeText: {
    ...typography.overline,
    color: colors.brandDark,
  },

  adCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...elevation.sm,
  },
  favoriteBtn: {
    position: 'absolute',
    top: 8,
    // Logical start keeps the favorite control on the leading edge in RTL/LTR.
    start: 8,
    zIndex: 2,
    width: sizes.iconButtonSm,
    height: sizes.iconButtonSm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.sm,
  },
  favoriteIcon: { color: colors.muted, fontSize: fontSizes[16] },
  favoriteActive: { color: colors.danger },
  adMain: { flexDirection: 'row', minHeight: 128 },
  adImage: {
    width: sizes.adImageWidth,
    minHeight: 128,
    backgroundColor: colors.border,
  },
  adImagePlaceholder: {
    width: sizes.adImageWidth,
    minHeight: 128,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adInfo: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  adTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
    textAlign: 'right',
    width: '100%',
    flexShrink: 1,
    lineHeight: Math.max(21, fontSizes[14] * 1.55),
  },
});


type HorizontalMarketCardProps = {
  title: string;
  subtitle?: string;
  price?: string | null;
  imageUri?: string | null;
  imageResizeMode?: 'cover' | 'contain';
  glyph?: string;
  /**
   * داخل القوائم/الأقسام: مرّر `id` + `onPressItem` (دالة ثابتة عبر useCallback)
   * بدل `onPress` المنشأة داخل الـ map، حتى لا ينكسر React.memo.
   */
  id?: string;
  onPressItem?: (id: string) => void;
  /** يبقى مدعومًا للاستعمال خارج القوائم. */
  onPress?: () => void;
  onImageError?: () => void;
  width?: number;
};

/**
 * بطاقة أفقية موحّدة للرئيسية (منتجات / خدمات / طلبات / متاجر).
 * نفس الأبعاد والظل والتايبو في كل الأقسام.
 */
function HorizontalMarketCardComponent({
  title,
  subtitle,
  price,
  imageUri,
  imageResizeMode = 'cover',
  glyph = '◇',
  id,
  onPressItem,
  onPress,
  onImageError,
  width = 160,
}: HorizontalMarketCardProps) {
  const { colors } = useAppTheme();
  const hStyles = useMemo(() => createThemeHStyles(colors), [colors]);

  const [imageFailed, setImageFailed] = useState(false);
  const handlePress = useCallback(() => {
    if (onPressItem && id !== undefined) onPressItem(id);
    else onPress?.();
  }, [id, onPress, onPressItem]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={handlePress}
      style={({ pressed }) => [hStyles.card, { width }, pressed && hStyles.pressed]}
    >
      {imageUri && !imageFailed ? (
        <AppImage
          uri={imageUri}
          onError={() => { setImageFailed(true); onImageError?.(); }}
          resizeMode={imageResizeMode}
          variant="list"
          style={hStyles.image}
        />
      ) : (
        <View style={[hStyles.image, hStyles.placeholder]}>
          <Text style={hStyles.glyph}>{glyph}</Text>
        </View>
      )}
      <View style={hStyles.body}>
        <Text numberOfLines={2} style={hStyles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={hStyles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
        {price ? (
          <Text numberOfLines={1} style={hStyles.price}>
            {price}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const HorizontalMarketCard = memo(HorizontalMarketCardComponent);
HorizontalMarketCard.displayName = 'HorizontalMarketCard';

/** عرض بطاقة الإعلان الأفقية (ثابت) — يعتمد عليه getItemLayout للـ carousel. */
export const HORIZONTAL_AD_CARD_WIDTH = 160;

type HorizontalAdCardProps = {
  title: string;
  price: string;
  meta?: string;
  imageUri?: string | null;
  isFavorite: boolean;
  isNegotiable?: boolean;
  /** داخل القوائم: id + دوال *Item ثابتة (useCallback) للحفاظ على React.memo. */
  id?: string;
  onPressItem?: (id: string) => void;
  onToggleFavoriteItem?: (id: string) => void;
  onImageErrorItem?: (id: string) => void;
  onPress?: () => void;
  onToggleFavorite?: () => void;
  onImageError?: () => void;
};

/** Ad tile uses the same vertical dimensions as the other home-section cards. */
function HorizontalAdCardComponent({
  title, price, meta, imageUri, isFavorite, isNegotiable,
  id, onPressItem, onToggleFavoriteItem, onImageErrorItem,
  onPress, onToggleFavorite, onImageError,
}: HorizontalAdCardProps) {
  const { colors } = useAppTheme();
  const hStyles = useMemo(() => createThemeHStyles(colors), [colors]);
  const subtitle = useMemo(
    () => [meta, isNegotiable ? 'قابل للتفاوض' : null].filter(Boolean).join(' · '),
    [meta, isNegotiable],
  );
  const handlePress = useCallback(() => {
    if (onPressItem && id !== undefined) onPressItem(id);
    else onPress?.();
  }, [id, onPress, onPressItem]);
  const handleToggleFavorite = useCallback(() => {
    if (onToggleFavoriteItem && id !== undefined) onToggleFavoriteItem(id);
    else onToggleFavorite?.();
  }, [id, onToggleFavorite, onToggleFavoriteItem]);
  const handleImageError = useCallback(() => {
    if (onImageErrorItem && id !== undefined) onImageErrorItem(id);
    else onImageError?.();
  }, [id, onImageError, onImageErrorItem]);
  return (
    <View style={{ width: HORIZONTAL_AD_CARD_WIDTH, position: 'relative' }}>
      <HorizontalMarketCard
        title={title}
        subtitle={subtitle || undefined}
        price={price}
        imageUri={imageUri}
        onImageError={handleImageError}
        onPress={handlePress}
        width={HORIZONTAL_AD_CARD_WIDTH}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
        accessibilityState={{ selected: isFavorite }}
        onPress={handleToggleFavorite}
        hitSlop={8}
        style={({ pressed }) => [hStyles.favoriteButton, pressed && hStyles.pressed]}
      >
        <Text style={{ color: isFavorite ? colors.danger : colors.muted, fontSize: fontSizes[17], fontWeight: fontWeights.bold }}>
          {isFavorite ? '♥' : '♡'}
        </Text>
      </Pressable>
    </View>
  );
}

export const HorizontalAdCard = memo(HorizontalAdCardComponent);
HorizontalAdCard.displayName = 'HorizontalAdCard';

const createThemeHStyles = (colors: ColorPalette) => StyleSheet.create({
  card: {
    minHeight: 196,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...elevation.sm,
  },
  pressed: { opacity: ux.pressedOpacity },
  favoriteButton: { position: 'absolute', top: spacing.sm, start: spacing.sm, zIndex: 3, width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...elevation.sm },
  image: {
    width: '100%',
    height: 132,
    backgroundColor: colors.border,
  },
  placeholder: {
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: colors.brandOnSoft,
    fontSize: fontSizes[28],
    fontWeight: fontWeights.semibold,
  },
  body: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  title: {
    width: '100%',
    minHeight: sizes.iconButtonSm,
    ...typography.bodyStrong,
    fontSize: fontSizes[13],
    lineHeight: 18,
    color: colors.ink,
    textAlign: 'right',
  },
  subtitle: {
    width: '100%',
    ...typography.caption,
    fontSize: fontSizes[11],
    color: colors.muted,
    textAlign: 'right',
  },
  price: {
    ...typography.bodyStrong,
    fontSize: fontSizes[13],
    color: colors.brand,
    textAlign: 'right',
    marginTop: spacing.xxs,
  },
});

