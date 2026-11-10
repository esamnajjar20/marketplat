import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { useRef, useState , useMemo} from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/api/client';
import { Field, Notice, PrimaryButton } from '@/components/MobileUI';
import type { TextInputHandle } from '@/components/ui/Field';
import { fontSizes, elevation, radius, spacing, typography, ux } from '@/theme/tokens';
import { registerSchema, validate } from '@/lib/validation';
import { getSafeAuthRedirect } from '@/lib/safe-auth-redirect';
import { toAppHref } from '@/lib/typed-navigation';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';

export default function RegisterScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { register, isBusy } = useAuth();
  const { redirect } = useLocalSearchParams<{ redirect?: string | string[] }>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  const nameRef = useRef<TextInputHandle>(null);
  const emailRef = useRef<TextInputHandle>(null);
  const passwordRef = useRef<TextInputHandle>(null);
  const phoneRef = useRef<TextInputHandle>(null);
  const cityRef = useRef<TextInputHandle>(null);

  const redirectParam = redirect
    ? { redirect: Array.isArray(redirect) ? redirect[0] : redirect }
    : undefined;

  const submit = async () => {
    const checked = validate(registerSchema, {
      name,
      email,
      password,
      phone: normalizeNumericInput(phone),
      city,
    });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    if (checked.data.phone && !/^\+?[0-9]{9,15}$/.test(checked.data.phone)) {
      setError('رقم الهاتف يجب أن يحتوي على 9 إلى 15 رقمًا.');
      return;
    }
    setError('');
    try {
      await register({
        name: checked.data.name,
        email: checked.data.email.trim().toLowerCase(),
        password: checked.data.password,
        ...(checked.data.phone ? { phone: checked.data.phone } : {}),
        ...(checked.data.city ? { city: checked.data.city } : {}),
      });
      setPassword('');
      const target = getSafeAuthRedirect(redirect);
      if (target) router.replace(toAppHref(target));
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : 'تعذر إنشاء الحساب.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="رجوع"
            onPress={() => goBack('/login')}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <AppIcon name="back" size={18} color={colors.brandOnSoft} />
            <Text style={styles.backText}>رجوع</Text>
          </Pressable>

          <View style={styles.hero}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>م</Text>
            </View>
            <Text style={styles.title}>إنشاء حساب</Text>
            <Text style={styles.subtitle}>انضم إلى سوقك المحلي خلال دقيقة</Text>
          </View>

          <View style={styles.formCard}>
            <Field
              label="الاسم الكامل"
              value={name}
              inputRef={nameRef}
              onChangeText={setName}
              placeholder="اسمك"
              autoComplete="name"
              editable={!isBusy}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
            <Field
              label="البريد الإلكتروني"
              value={email}
              inputRef={emailRef}
              onChangeText={setEmail}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoComplete="email"
              editable={!isBusy}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              label="كلمة المرور"
              value={password}
              inputRef={passwordRef}
              onChangeText={setPassword}
              placeholder="8 أحرف على الأقل"
              secureTextEntry={!passwordVisible}
              autoComplete="new-password"
              editable={!isBusy}
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              accessibilityState={{ selected: passwordVisible }}
              onPress={() => setPasswordVisible((v) => !v)}
              style={styles.passwordToggle}
            >
              <Text style={styles.linkMuted}>
                {passwordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              </Text>
            </Pressable>
            <Field
              label="رقم الهاتف (اختياري)"
              value={phone}
              inputRef={phoneRef}
              onChangeText={setPhone}
              placeholder="+970…"
              keyboardType="phone-pad"
              editable={!isBusy}
              returnKeyType="next"
              onSubmitEditing={() => cityRef.current?.focus()}
            />
            <Field
              label="المدينة (اختياري)"
              value={city}
              inputRef={cityRef}
              onChangeText={setCity}
              placeholder="المدينة"
              editable={!isBusy}
              returnKeyType="done"
              onSubmitEditing={() => {
                void submit();
              }}
            />

            {error ? <Notice tone="error">{error}</Notice> : null}

            <PrimaryButton
              label="إنشاء الحساب"
              onPress={() => {
                void submit();
              }}
              busy={isBusy}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/login',
                params: redirectParam,
              })
            }
            style={styles.footerLink}
          >
            <Text style={styles.footerText}>
              لديك حساب؟ <Text style={styles.footerTextStrong}>تسجيل الدخول</Text>
            </Text>
          </Pressable>

          <Notice tone="muted">
            قد تحتاج إلى تأكيد بريدك الإلكتروني قبل استخدام بعض ميزات السوق.
          </Notice>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  keyboard: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  pressed: { opacity: ux.pressedOpacity },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  backText: { color: colors.brandOnSoft, ...typography.captionStrong },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.md,
  },
  logoText: {
    color: colors.onBrand,
    fontSize: fontSizes[28],
    fontWeight: '700',
  },
  title: {
    color: colors.ink,
    ...typography.display,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    ...typography.body,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card ?? radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation.sm,
  },
  passwordToggle: {
    minHeight: 40,
    alignSelf: 'flex-end',
    justifyContent: 'center',
  },
  linkMuted: {
    color: colors.muted,
    ...typography.captionStrong,
  },
  footerLink: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: colors.muted,
    ...typography.body,
    textAlign: 'center',
  },
  footerTextStrong: {
    color: colors.brand,
    fontWeight: '700',
  },
});
