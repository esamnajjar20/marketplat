import { ActivityIndicator, Pressable, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '@/theme/tokens';
import { uiStyles as s } from './styles';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  variant = 'primary',
  textStyle,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  textStyle?: StyleProp<TextStyle>;
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
        (disabled || busy) && s.buttonDisabled,
        pressed && !disabled && !busy && s.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isFilled ? colors.white : colors.brand} />
      ) : (
        <Text
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
