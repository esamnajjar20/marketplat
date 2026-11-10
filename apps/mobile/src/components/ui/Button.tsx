import { AppText as Text } from './AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { ActivityIndicator, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors } from '@/theme/tokens';
import { uiStyles as s } from './styles';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'md' | 'sm';

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  variant = 'primary',
  size = 'md',
  textStyle,
  style,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const isFilled = variant === 'primary' || variant === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        variant === 'secondary' && s.secondary,
        variant === 'danger' && s.danger,
        variant === 'ghost' && s.ghost,
        size === 'sm' && s.buttonSm,
        (disabled || busy) && s.buttonDisabled,
        pressed && !disabled && !busy && s.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isFilled ? colors.white : colors.brand} />
      ) : (
        <Text
          maxFontSizeMultiplier={1.3}
          style={[
            s.buttonText,
            variant === 'secondary' && s.secondaryText,
            variant === 'danger' && s.dangerText,
            variant === 'ghost' && s.ghostText,
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** اختصار واضح للزر الثانوي */
export function SecondaryButton(props: Omit<Parameters<typeof PrimaryButton>[0], 'variant'>) {
  return <PrimaryButton {...props} variant="secondary" />;
}

/** اختصار لزر الخطر */
export function DangerButton(props: Omit<Parameters<typeof PrimaryButton>[0], 'variant'>) {
  return <PrimaryButton {...props} variant="danger" />;
}

/** اختصار لزر شفاف */
export function GhostButton(props: Omit<Parameters<typeof PrimaryButton>[0], 'variant'>) {
  return <PrimaryButton {...props} variant="ghost" />;
}
