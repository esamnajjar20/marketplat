import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/theme/tokens';
import { PrimaryButton } from './Button';
import { uiStyles as s } from './styles';

export function Notice({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success' | 'muted' | 'info' | 'warning';
}) {
  return (
    <View
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
          tone === 'warning' && { color: colors.warning },
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [s.chip, selected && s.chipSelected, pressed && s.pressed]}
    >
      <Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function LoadingState({ message = 'جاري التحميل…' }: { message?: string }) {
  return (
    <View style={s.stateBox}>
      <ActivityIndicator size="large" color={colors.brand} />
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
  return (
    <View style={s.stateBox}>
      <View style={s.stateIconWrap}>
        <Text style={s.stateIcon}>◇</Text>
      </View>
      <Text style={s.stateTitle}>{title}</Text>
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
  return (
    <View style={s.stateBox}>
      <View style={[s.stateIconWrap, s.stateIconError]}>
        <Text style={[s.stateIcon, { color: colors.danger }]}>!</Text>
      </View>
      <Text style={s.stateTitle}>{title}</Text>
      {description ? <Text style={s.stateMessage}>{description}</Text> : null}
      {onAction ? (
        <View style={{ marginTop: spacing.md, alignSelf: 'stretch' }}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

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
  return <View style={[s.skeleton, { height, width: width as number | `${number}%`, borderRadius: r }, style]} />;
}

export function SkeletonCard() {
  return (
    <View style={s.skeletonCard}>
      <SkeletonBlock height={88} width={88} radius={radius.md} />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <SkeletonBlock height={14} width="90%" />
        <SkeletonBlock height={12} width="55%" />
        <SkeletonBlock height={12} width="35%" />
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
  if (!visible) return null;
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={s.offlineBanner}>
      <Text style={s.offlineBannerText}>{message}</Text>
    </View>
  );
}
