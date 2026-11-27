import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';

export interface SpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  style?: StyleProp<ViewStyle>;
  label?: string;
}

/** The only React Native ActivityIndicator adapter used by the application. */
export function Spinner({ size = 'small', color, style, label }: SpinnerProps) {
  const { colors } = useAppTheme();
  return (
    <ActivityIndicator
      size={size}
      color={color ?? colors.brand}
      style={style}
      accessible={Boolean(label)}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    />
  );
}
