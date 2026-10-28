import { memo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, elevation, radius, sizes, spacing, typography, ux } from '@/theme/tokens';
import { isBottomNavigationHidden } from '@/components/BottomNavigation';

/* -------------------------------------------------------------------------- */
/*  PageShell — غلاف شاشة موحّد مع رأس ورجوع                                    */
/* -------------------------------------------------------------------------- */

const ShellBody = memo(function ShellBody({
  hidden,
  title,
  right,
  children,
  scroll = true,
}: {
  hidden: boolean;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}) {
  const edges: ('top' | 'bottom')[] = hidden ? ['top', 'bottom'] : ['top'];
  const body = scroll ? (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[s.content, { flex: 1 }]}>{children}</View>
  );

  return (
    <SafeAreaView style={s.safe} edges={edges}>
      <AppHeader title={title} right={right} />
      {body}
    </SafeAreaView>
  );
});

export function PageShell({
  title,
  children,
  right,
  scroll = true,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  /** عند false يُعرض المحتوى بدون ScrollView (قوائم افتراضية مثلاً) */
  scroll?: boolean;
}) {
  const pathname = usePathname();
  const hidden = isBottomNavigationHidden(pathname);
  return (
    <ShellBody hidden={hidden} title={title} right={right} scroll={scroll}>
      {children}
    </ShellBody>
  );
}

/* -------------------------------------------------------------------------- */
/*  AppHeader                                                                 */
/* -------------------------------------------------------------------------- */

export function AppHeader({
  title,
  right,
  onBack,
  showBack = true,
}: {
  title: string;
  right?: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
}) {
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    goBack('/');
  };

  return (
    <View style={s.header}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={handleBack}
          hitSlop={12}
          style={({ pressed }) => [s.back, pressed && s.pressed]}
        >
          <Text style={s.backText}>‹</Text>
        </Pressable>
      ) : (
        <View style={s.headerSpacer} />
      )}
      <Text style={s.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={s.headerRight}>{right ?? <View style={s.headerSpacer} />}</View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  SectionHeader                                                             */
/* -------------------------------------------------------------------------- */

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
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionHeaderText}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [pressed && s.pressed]}>
          <Text style={s.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  SectionCard / ListRow                                                     */
/* -------------------------------------------------------------------------- */

export function SectionCard({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
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
  glyph = '›',
  right,
}: {
  title: string;
  description?: string;
  onPress?: () => void;
  glyph?: string;
  right?: ReactNode;
}) {
  const content = (
    <View style={s.listRowInner}>
      <View style={s.listRowGlyph}>
        <Text style={s.listRowGlyphText}>{glyph}</Text>
      </View>
      <View style={s.listRowText}>
        <Text style={s.listRowTitle}>{title}</Text>
        {description ? <Text style={s.listRowDescription}>{description}</Text> : null}
      </View>
      {right}
    </View>
  );

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.card, pressed && s.pressed]}>
        {content}
      </Pressable>
    );
  }
  return <View style={s.card}>{content}</View>;
}

/* -------------------------------------------------------------------------- */
/*  Field                                                                     */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  secureTextEntry,
  maxLength,
  editable = true,
  autoComplete,
  returnKeyType,
  onSubmitEditing,
  autoFocus,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  secureTextEntry?: boolean;
  maxLength?: number;
  editable?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  autoFocus?: boolean;
  error?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        editable={editable}
        accessibilityLabel={label}
        selectionColor={colors.brand}
        textAlign="right"
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCapitalize={
          keyboardType === 'email-address' ||
          secureTextEntry ||
          keyboardType === 'numeric' ||
          keyboardType === 'phone-pad' ||
          keyboardType === 'number-pad' ||
          keyboardType === 'decimal-pad'
            ? 'none'
            : 'sentences'
        }
        autoCorrect={keyboardType === 'email-address' || secureTextEntry ? false : undefined}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        style={[s.input, multiline && s.textarea, !editable && s.inputDisabled, error && s.inputError]}
      />
      {error ? <Text style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                   */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Notice / Badge / Chip                                                     */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  States: Loading / Empty / Error                                           */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/*  SearchBar                                                                 */
/* -------------------------------------------------------------------------- */

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'ابحث…',
  accessibilityLabel = 'بحث',
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  return (
    <View style={s.searchBar}>
      <Text style={s.searchIcon}>⌕</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        style={s.searchInput}
        textAlign="right"
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="مسح البحث"
          onPress={() => onChangeText('')}
          hitSlop={8}
        >
          <Text style={s.searchClear}>×</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onSubmit} style={s.searchBtn}>
        <Text style={s.searchBtnText}>بحث</Text>
      </Pressable>
    </View>
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

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Skeleton + Offline banner (UX)                                            */
/* -------------------------------------------------------------------------- */

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
  return <View style={[s.skeleton, { height, width: width as any, borderRadius: r }, style]} />;
}

/** هيكل بطاقة قائمة أثناء التحميل */
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

/** شريط تنبيه عند انقطاع/ضعف الاتصال */
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

/*  DetailScaffold — شاشات التفاصيل (صور + محتوى + شريط إجراءات سفلي)          */
/* -------------------------------------------------------------------------- */

export function DetailScaffold({
  title,
  right,
  loading,
  loadingMessage = 'جاري التحميل…',
  error,
  onRetry,
  footer,
  children,
}: {
  title: string;
  right?: ReactNode;
  loading?: boolean;
  loadingMessage?: string;
  error?: string | null;
  onRetry?: () => void;
  /** شريط إجراءات ثابت أسفل الشاشة (CTA رئيسي) */
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <AppHeader title={title} right={right} />
      {loading ? (
        <LoadingState message={loadingMessage} />
      ) : error ? (
        <ErrorState description={error} onAction={onRetry} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={s.detailContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={s.detailFooter}>{footer}</View> : null}
        </>
      )}
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/*  Styles                                                                    */
/* -------------------------------------------------------------------------- */

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },

  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    minHeight: sizes.headerHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  back: { minWidth: sizes.touchTarget, minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'center',
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  backText: { fontSize: 32, color: colors.brand, lineHeight: 36, fontWeight: '300' },
  title: {
    flex: 1,
    textAlign: 'right',
    ...typography.title,
    color: colors.ink,
  },
  headerRight: { minWidth: sizes.iconButton, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: sizes.iconButton, height: sizes.iconButton },

  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl + sizes.bottomNavHeight / 2,
  },
  detailContent: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  detailFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },

  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionHeaderText: { flex: 1, gap: 3 },
  sectionTitle: { textAlign: 'right', ...typography.subtitle, color: colors.ink },
  sectionSubtitle: { textAlign: 'right', ...typography.caption, color: colors.muted },
  sectionAction: { ...typography.captionStrong, color: colors.brand, paddingVertical: spacing.xs },

  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
    ...elevation.sm,
  },

  listRowInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  listRowGlyph: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowGlyphText: { color: colors.brand, fontSize: 19, fontWeight: '900' },
  listRowText: { flex: 1, gap: 4 },
  listRowTitle: { textAlign: 'right', ...typography.bodyStrong, color: colors.ink },
  listRowDescription: { textAlign: 'right', ...typography.caption, color: colors.muted },

  field: { gap: spacing.sm },
  label: { ...typography.label, color: colors.ink, textAlign: 'right' },
  input: {
    minHeight: sizes.inputHeight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: typography.body.fontSize,
  },
  textarea: { minHeight: 120, paddingVertical: spacing.md },
  inputDisabled: { opacity: 0.6 },
  inputError: { borderColor: colors.danger },
  fieldError: { textAlign: 'right', ...typography.caption, color: colors.danger },

  button: {
    minHeight: sizes.buttonHeight,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonText: { color: colors.white, ...typography.button },
  secondary: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  secondaryText: { color: colors.brand },
  danger: { backgroundColor: colors.danger },
  dangerText: { color: colors.white },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostText: { color: colors.ink },
  buttonDisabled: { opacity: 0.55 },

  notice: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  success: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  mutedBox: { backgroundColor: colors.surface, borderColor: colors.border },
  info: { backgroundColor: colors.infoSoft, borderColor: colors.infoBorder },
  warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  noticeText: { color: colors.danger, textAlign: 'right', lineHeight: 22, fontSize: 14 },

  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignSelf: 'flex-start',
  },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeMuted: { backgroundColor: colors.canvas },
  badgeAccent: { backgroundColor: colors.warningSoft },
  badgeText: { ...typography.overline, color: colors.brand },

  chip: {
    minHeight: sizes.chipHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.borderStrong,
  },
  chipText: { ...typography.captionStrong, color: colors.muted },
  chipTextSelected: { color: colors.brandDark },

  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  stateIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  stateIconError: { backgroundColor: colors.dangerSoft },
  stateIcon: { fontSize: 24, color: colors.brand, fontWeight: '700' },
  stateTitle: { textAlign: 'center', ...typography.subtitle, color: colors.ink },
  stateMessage: { textAlign: 'center', ...typography.body, color: colors.muted },

  pressed: { opacity: ux.pressedOpacity },
  skeleton: { backgroundColor: colors.border, overflow: 'hidden' },
  skeletonCard: {
    flexDirection: 'row-reverse',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offlineBanner: {
    backgroundColor: colors.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.warningBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  offlineBannerText: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    color: colors.warning,
    textAlign: 'center',
  },
  

  searchBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.inputHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchIcon: { color: colors.muted, fontSize: 18, fontWeight: '700' },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: typography.body.fontSize,
    paddingVertical: spacing.sm,
  },
  searchClear: { color: colors.muted, fontSize: 22, paddingHorizontal: 4 },
  searchBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  searchBtnText: { color: colors.brand, ...typography.captionStrong },
});
