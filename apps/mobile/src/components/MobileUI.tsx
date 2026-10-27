import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import { router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme/tokens';
import { isBottomNavigationHidden } from '@/components/BottomNavigation';

/**
 * Inner shell body — memoized on `hidden` (a primitive boolean) so it does
 * NOT re-render on every navigation. `edges` used to be an array, which
 * created a new reference on every render and defeated React.memo.
 */
const ShellBody = memo(function ShellBody({
  hidden,
  title,
  right,
  children,
}: {
  hidden: boolean;
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const edges: ('top' | 'bottom')[] = hidden ? ['top', 'bottom'] : ['top'];
  return (
    <SafeAreaView style={s.safe} edges={edges}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={s.back}
        >
          <Text style={s.backText}>‹</Text>
        </Pressable>
        <Text style={s.title}>{title}</Text>
        <View style={s.headerRight}>{right}</View>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
});

export function PageShell({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const pathname = usePathname();
  const hidden = isBottomNavigationHidden(pathname);
  return <ShellBody hidden={hidden} title={title} right={right}>{children}</ShellBody>;
}

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
          keyboardType === 'email-address' || secureTextEntry || keyboardType === 'numeric' || keyboardType === 'phone-pad' || keyboardType === 'number-pad' || keyboardType === 'decimal-pad'
            ? 'none'
            : 'sentences'
        }
        autoCorrect={keyboardType === 'email-address' || secureTextEntry ? false : undefined}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        style={[s.input, multiline && s.textarea, !editable && { opacity: 0.6 }]}
      />
    </View>
  );
}

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
  variant?: 'primary' | 'secondary' | 'danger';
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[s.button, variant === 'secondary' && s.secondary, variant === 'danger' && s.danger, (disabled || busy) && { opacity: 0.6 }]}
    >
      {busy
        ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.brand} />
        : <Text style={[s.buttonText, variant === 'secondary' && s.secondaryText, variant === 'danger' && { color: '#fff' }, textStyle]}>{label}</Text>}
    </Pressable>
  );
}

export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'muted' | 'info' }) {
  return (
    <View style={[s.notice, tone === 'success' && s.success, tone === 'muted' && s.mutedBox, tone === 'info' && s.info]}>
      <Text style={[s.noticeText, tone === 'success' && { color: '#176B5B' }, tone === 'muted' && { color: colors.muted }, tone === 'info' && { color: colors.ink }]}>{children}</Text>
    </View>
  );
}

export function SectionCard({ children }: { children: ReactNode }) { return <View style={s.card}>{children}</View>; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  back: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 32, color: colors.brand, lineHeight: 36 },
  title: { flex: 1, textAlign: 'right', fontSize: 19, fontWeight: '800', color: colors.ink },
  headerRight: { minWidth: 44, alignItems: 'center' },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 48 },
  field: { gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '800', color: colors.ink, textAlign: 'right' },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 15 },
  textarea: { minHeight: 120, paddingVertical: spacing.md },
  button: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondary: { backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: '#C8E2DA' },
  secondaryText: { color: colors.brand },
  danger: { backgroundColor: colors.danger },
  notice: { padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FCE8E6', borderWidth: 1, borderColor: '#F5C2BE' },
  success: { backgroundColor: '#E7F4F0', borderColor: '#C8E2DA' },
  mutedBox: { backgroundColor: colors.surface, borderColor: colors.border },
  info: { backgroundColor: '#EAF2FB', borderColor: '#C6DAF1' },
  noticeText: { color: colors.danger, textAlign: 'right', lineHeight: 22, fontSize: 14 },
  card: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.md, elevation: 1 },
});
