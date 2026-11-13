/**
 * غلاف خفيف فوق expo-image.
 * - كاش أفضل وأداء أوضح من Image الافتراضي
 * - واجهة بسيطة متوافقة مع الاستخدام الحالي (uri + onError)
 * - لا يفرض مكتبات ثقيلة إضافية
 */
import { useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { type StyleProp, type ImageStyle } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { listThumbnailUri } from '@/lib/image-variants';

type AppImageProps = {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  /** توافق مع RN Image */
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  onError?: () => void;
  /** لون خلفية أثناء التحميل */
  placeholderColor?: string;
  accessibilityLabel?: string;
  /**
   * list: صور مصغّرة داخل قوائم مُعاد تدويرها (بدون fade عند كل إعادة استخدام للخلية)،
   *       وتُطلب بنسخة مصغّرة من Cloudinary (انظر image-variants.ts) مع عودة تلقائية للأصل عند الفشل.
   * detail (الافتراضي): صور الصفحات المفردة، مع انتقال ناعم.
   */
  variant?: 'list' | 'detail';
} & Omit<ImageProps, 'source' | 'style' | 'contentFit' | 'onError'>;

const contentFitMap = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'contain',
} as const;

export function AppImage({
  uri,
  style,
  resizeMode = 'cover',
  onError,
  placeholderColor,
  accessibilityLabel,
  variant = 'detail',
  ...rest
}: AppImageProps) {
  const { colors } = useAppTheme();
  const backgroundColor = placeholderColor ?? colors.border;
  // الرابط الذي فشلت نسخته المصغّرة (يُقارَن بالرابط الحالي فيُعاد تلقائيًا عند إعادة تدوير الخلية).
  const [thumbFailedFor, setThumbFailedFor] = useState<string | null>(null);
  if (!uri) return null;

  const sourceUri = variant === 'list' && thumbFailedFor !== uri ? listThumbnailUri(uri) : uri;

  return (
    <Image
      source={{ uri: sourceUri }}
      style={[{ backgroundColor }, style]}
      contentFit={contentFitMap[resizeMode] ?? 'cover'}
      cachePolicy="memory-disk"
      transition={variant === 'list' ? 0 : 120}
      recyclingKey={uri}
      onError={() => {
        if (sourceUri !== uri) {
          // النسخة المصغّرة لم تُحمَّل: جرّب الأصل قبل إبلاغ المستدعي بالفشل.
          setThumbFailedFor(uri);
          return;
        }
        onError?.();
      }}
      accessibilityLabel={accessibilityLabel}
      {...rest}
    />
  );
}
