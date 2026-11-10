/**
 * غلاف خفيف فوق expo-image.
 * - كاش أفضل وأداء أوضح من Image الافتراضي
 * - واجهة بسيطة متوافقة مع الاستخدام الحالي (uri + onError)
 * - لا يفرض مكتبات ثقيلة إضافية
 */
import { Image, type ImageProps } from 'expo-image';
import { type StyleProp, type ImageStyle } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';

type AppImageProps = {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  /** توافق مع RN Image */
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  onError?: () => void;
  /** لون خلفية أثناء التحميل */
  placeholderColor?: string;
  accessibilityLabel?: string;
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
  ...rest
}: AppImageProps) {
  const { colors } = useAppTheme();
  const backgroundColor = placeholderColor ?? colors.border;
  if (!uri) return null;

  return (
    <Image
      source={{ uri }}
      style={[{ backgroundColor }, style]}
      contentFit={contentFitMap[resizeMode] ?? 'cover'}
      cachePolicy="memory-disk"
      transition={120}
      recyclingKey={uri}
      onError={() => onError?.()}
      accessibilityLabel={accessibilityLabel}
      {...rest}
    />
  );
}
