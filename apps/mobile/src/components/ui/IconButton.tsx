import { type StyleProp, type ViewStyle } from 'react-native';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon, type GlyphName } from '@/components/Icons';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, sizes, ux } from '@/theme/tokens';

type IconButtonTone = 'soft' | 'overlay' | 'danger' | 'plain';

/**
 * زر أيقونة دائري موحّد بمساحة لمس 44dp كحد أدنى.
 * يستبدل الأزرار الدائرية المعرّفة محليًا في الشاشات (أحجام وزوايا متفاوتة).
 */
export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  tone = 'soft',
  iconSize = 20,
  style,
}: {
  icon: GlyphName;
  /** وصف الوصولية — إلزامي لأن الزر بلا نص ظاهر. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: IconButtonTone;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const background =
    tone === 'soft' ? colors.brandSoft
      : tone === 'overlay' ? colors.mediaControlOverlay
        : tone === 'danger' ? colors.danger
          : colors.transparent;
  const iconColor = tone === 'danger' ? colors.onDanger : colors.brandOnSoft;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: sizes.touchTarget,
          height: sizes.touchTarget,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
          opacity: disabled ? ux.disabledOpacity : pressed ? ux.pressedOpacity : 1,
        },
        style,
      ]}
    >
      <AppIcon name={icon} size={iconSize} color={iconColor} />
    </Pressable>
  );
}
