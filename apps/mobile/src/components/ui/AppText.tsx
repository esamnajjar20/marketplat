import { Text as NativeText, type TextProps } from 'react-native';
import { useAppThemeColors } from '@/theme/ThemeProvider';
import { fontSizes } from '@/theme/tokens';

export type AppTextTone = 'ink' | 'muted' | 'brand' | 'danger' | 'success' | 'onBrand';

export type AppTextProps = TextProps & {
  /** لون دلالي من الثيم (يتبع الوضع الداكن تلقائيًا). */
  tone?: AppTextTone;
  /** وزن عريض موحّد (700). */
  strong?: boolean;
  /** حجم من `fontSizes`. */
  size?: keyof typeof fontSizes;
};

/**
 * مكوّن النص الموحّد.
 * - بدون `tone` / `strong` / `size`: سلوكه مطابق تمامًا لـ Text القديم (توافق خلفي).
 * - عند استخدام أي منها: يُضاف تنسيق موحّد، وتبقى محاذاة النص في مكان واحد هنا
 *   (`MANAGED_ALIGN`) بدل تكرارها في مئات الأنماط المضمّنة.
 * - `style` الممرَّر يتغلّب دائمًا على التنسيق المُدار.
 */
const MANAGED_ALIGN = 'right' as const;

function ManagedText({ allowFontScaling = true, tone, strong, size, style, ...props }: AppTextProps) {
  // useAppThemeColors آمن حتى خارج ThemeProvider (حدود الأخطاء).
  const colors = useAppThemeColors();
  const toneColor: Record<AppTextTone, string> = {
    ink: colors.ink,
    muted: colors.muted,
    brand: colors.brand,
    danger: colors.danger,
    success: colors.success,
    onBrand: colors.onBrand,
  };

  return (
    <NativeText
      {...props}
      allowFontScaling={allowFontScaling}
      style={[
        {
          textAlign: MANAGED_ALIGN,
          ...(tone ? { color: toneColor[tone] } : null),
          ...(strong ? { fontWeight: '700' as const } : null),
          ...(size !== undefined ? { fontSize: fontSizes[size] } : null),
        },
        style,
      ]}
    />
  );
}

export function AppText({ allowFontScaling = true, ...props }: AppTextProps) {
  if (props.tone || props.strong || props.size !== undefined) {
    return <ManagedText allowFontScaling={allowFontScaling} {...props} />;
  }
  return <NativeText {...props} allowFontScaling={allowFontScaling} />;
}
