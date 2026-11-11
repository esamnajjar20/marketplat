import { AppText as Text } from './AppText';
import { AppIcon } from '@/components/Icons';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useUIStyles } from './styles';

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const s = useUIStyles();
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionHeaderText}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${actionLabel} — ${title}`} hitSlop={8} onPress={onAction} style={({ pressed }) => [pressed && s.pressed]}>
          <Text style={s.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionCard({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const s = useUIStyles();
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [s.card, style, pressed && s.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function ListRow({
  title,
  description,
  onPress,
  glyph,
  right,
}: {
  title: string;
  description?: string;
  onPress?: () => void;
  /** أيقونة بادئة اختيارية (نص أو عنصر). بدونها لا تُرسم بلاطة فارغة. */
  glyph?: ReactNode;
  /** عنصر لاحق مخصص؛ إن غاب وكان الصف قابلًا للضغط يظهر سهم التنقل. */
  right?: ReactNode;
}) {
  const s = useUIStyles();
  const { colors } = useAppTheme();
  const content = (
    <View style={s.listRowInner}>
      {glyph ? (
        <View style={s.listRowGlyph}>
          {typeof glyph === 'string' ? <Text style={s.listRowGlyphText}>{glyph}</Text> : glyph}
        </View>
      ) : null}
      <View style={s.listRowText}>
        <Text style={s.listRowTitle}>{title}</Text>
        {description ? <Text style={s.listRowDescription}>{description}</Text> : null}
      </View>
      {right ?? (onPress ? <AppIcon name="forward" size={20} color={colors.mutedSoft} /> : null)}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={description ? `${title}. ${description}` : title}
        onPress={onPress}
        style={({ pressed }) => [s.card, pressed && s.pressed]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={s.card}>{content}</View>;
}
