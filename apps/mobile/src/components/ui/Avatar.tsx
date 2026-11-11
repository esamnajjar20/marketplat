import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from './AppText';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontWeights, radius, sizes } from '@/theme/tokens';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';

const DIMENSIONS: Record<AvatarSize, number> = {
  xs: sizes.avatarXs,
  sm: sizes.avatarSm,
  md: sizes.avatarMd,
  lg: sizes.avatarLg,
  xl: sizes.avatarXl,
  hero: sizes.avatarHero,
};

/** حجم الحرف الأول نسبةً إلى قطر الدائرة، مقرّبًا لأقرب رقم زوجي. */
function initialFontSize(dimension: number): number {
  return Math.max(12, Math.round((dimension * 0.4) / 2) * 2);
}

/** أول حرف ظاهر من الاسم (يتجاوز الفراغات)، أو الحرف البديل إن كان الاسم فارغًا. */
export function avatarInitial(name?: string | null, fallback = '؟'): string {
  const first = Array.from((name ?? '').trim())[0];
  return first ? first.toUpperCase() : fallback;
}

/**
 * صورة المستخدم الموحّدة: دائرة بحجم ثابت من `sizes.avatar*`.
 * - الصورة وبديلها (الحرف الأول) بنفس القطر تمامًا فلا يحدث «قفز» عند فشل التحميل.
 * - عند فشل تحميل الصورة يظهر الحرف الأول تلقائيًا.
 * - مزخرفة فقط (لا تُقرأ بشكل منفصل)؛ الاسم يُعرض بجوارها في كل الشاشات.
 */
export function Avatar({
  uri,
  name,
  size = 'md',
  fallbackInitial,
  style,
}: {
  uri?: string | null;
  name?: string | null;
  size?: AvatarSize;
  fallbackInitial?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  const dimension = DIMENSIONS[size];
  const frame = {
    width: dimension,
    height: dimension,
    borderRadius: radius.pill,
    overflow: 'hidden' as const,
    backgroundColor: colors.brandSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[frame, style]}>
      {uri && !failed ? (
        <AppImage
          uri={uri}
          placeholderColor={colors.brandSoft}
          style={{ width: dimension, height: dimension }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text
          allowFontScaling={false}
          style={{
            color: colors.brandOnSoft,
            fontWeight: fontWeights.bold,
            fontSize: initialFontSize(dimension),
            textAlign: 'center',
          }}
        >
          {avatarInitial(name, fallbackInitial)}
        </Text>
      )}
    </View>
  );
}
