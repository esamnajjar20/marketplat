import { AppText as Text } from './AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { type ReactNode, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, ux } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { PrimaryButton } from './Button';
import { useUIStyles } from './styles';

export function Notice({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success' | 'muted' | 'info' | 'warning';
}) {
  const s = useUIStyles();
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityRole={tone === 'error' || tone === 'warning' ? 'alert' : 'text'}
      accessibilityLiveRegion={tone === 'muted' ? 'none' : 'polite'}
      style={[
        s.notice,
        tone === 'success' && s.success,
        tone === 'muted' && s.mutedBox,
        tone === 'info' && s.info,
        tone === 'warning' && s.warning,
      ]}
    >
      <Text
        style={[
          s.noticeText,
          tone === 'success' && { color: colors.success },
          tone === 'muted' && { color: colors.muted },
          tone === 'info' && { color: colors.ink },
          tone === 'warning' && { color: colors.warningText },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export function Badge({
  label,
  tone = 'brand',
}: {
  label: string;
  tone?: 'brand' | 'danger' | 'success' | 'muted' | 'accent';
}) {
  const s = useUIStyles();
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        s.badge,
        tone === 'danger' && s.badgeDanger,
        tone === 'success' && s.badgeSuccess,
        tone === 'muted' && s.badgeMuted,
        tone === 'accent' && s.badgeAccent,
      ]}
    >
      <Text
        style={[
          s.badgeText,
          tone === 'danger' && { color: colors.danger },
          tone === 'success' && { color: colors.success },
          tone === 'muted' && { color: colors.muted },
          tone === 'accent' && { color: colors.ink },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const s = useUIStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected, disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [s.chip, selected && s.chipSelected, pressed && s.pressed]}
    >
      <Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** مؤشر تحميل مشترك — يُستخدم بدل ActivityIndicator المباشر في الشاشات. */
export function Spinner({
  size = 'small',
  color,
  style,
}: {
  size?: 'small' | 'large';
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  return <ActivityIndicator size={size} color={color ?? colors.brand} style={style} />;
}

export function LoadingState({ message = 'جاري التحميل…' }: { message?: string }) {
  const s = useUIStyles();
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={message} accessibilityLiveRegion="polite" style={s.stateBox}>
      <Spinner size="large" color={colors.brand} />
      <Text style={s.stateMessage}>{message}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const s = useUIStyles();
  return (
    <View accessibilityLiveRegion="polite" style={s.stateBox}>
      <View style={s.stateIconWrap}>
        <Text style={s.stateIcon}>◇</Text>
      </View>
      <Text accessibilityRole="header" style={s.stateTitle}>{title}</Text>
      {description ? <Text style={s.stateMessage}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.md, alignSelf: 'stretch' }}>
          <PrimaryButton label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = 'حدث خطأ',
  description,
  actionLabel = 'إعادة المحاولة',
  onAction,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const s = useUIStyles();
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.stateBox}>
      <View style={[s.stateIconWrap, s.stateIconError]}>
        <Text style={[s.stateIcon, { color: colors.danger }]}>!</Text>
      </View>
      <Text accessibilityRole="header" style={s.stateTitle}>{title}</Text>
      {description ? <Text style={s.stateMessage}>{description}</Text> : null}
      {onAction ? (
        <View style={{ marginTop: spacing.md, alignSelf: 'stretch' }}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

/** هيكل متحرك (pulse) بدل كتلة ثابتة — إحساس تحميل أكثر احترافية */
export function SkeletonBlock({
  height = 16,
  width = '100%',
  radius: r = radius.md,
  style,
}: {
  height?: number;
  width?: number | string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useUIStyles();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ux.durationSlow + 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: ux.durationSlow + 80,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        s.skeleton,
        { height, width: width as number | `${number}%`, borderRadius: r, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  const s = useUIStyles();
  return (
    <View style={s.skeletonCard}>
      <SkeletonBlock height={96} width={96} radius={radius.card} />
      <View style={{ flex: 1, gap: spacing.sm, justifyContent: 'center' }}>
        <SkeletonBlock height={14} width="92%" />
        <SkeletonBlock height={12} width="60%" />
        <SkeletonBlock height={12} width="38%" />
      </View>
    </View>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

export function OfflineBanner({
  visible,
  message = 'أنت غير متصل — بعض الإجراءات تُحفظ للمزامنة لاحقاً.',
}: {
  visible: boolean;
  message?: string;
}) {
  const s = useUIStyles();
  if (!visible) return null;
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={s.offlineBanner}>
      <Text style={s.offlineBannerText}>{message}</Text>
    </View>
  );
}
