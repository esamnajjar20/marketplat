import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { useRef, useState , useMemo} from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack, pushOnce } from '@/lib/navigation';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthContext';
import { Field, Notice, PrimaryButton } from '@/components/ui';
import type { TextInputHandle } from '@/components/ui/Field';
import { fontSizes, elevation, radius, spacing, typography, ux, fontWeights, sizes } from '@/theme/tokens';
import { loginSchema, validate } from '@/lib/validation';
import { getSafeAuthRedirect } from '@/lib/safe-auth-redirect';
import { toAppHref } from '@/lib/typed-navigation';

export default function LoginScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { login, loginWithGoogle, isBusy } = useAuth();
  const { redirect } = useLocalSearchParams<{ redirect?: string | string[] }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const emailInputRef = useRef<TextInputHandle>(null);
  const passwordInputRef = useRef<TextInputHandle>(null);

  const redirectParam = redirect
    ? { redirect: Array.isArray(redirect) ? redirect[0] : redirect }
    : undefined;

  const submit = async () => {
    const checked = validate(loginSchema, { email, password });
    if (!checked.ok) {
      setErrorMessage(checked.message);
      return;
    }
    setErrorMessage(null);
    try {
      await login(checked.data.email, checked.data.password);
      setPassword('');
      const target = getSafeAuthRedirect(redirect);
      if (target) router.replace(toAppHref(target));
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'تعذر تسجيل الدخول. حاول مرة أخرى.',
      );
    }
  };

  const submitGoogle = async () => {
    setErrorMessage(null);
    setGoogleBusy(true);
    try {
      const signedInUser = await loginWithGoogle();
      setPassword('');
      if (signedInUser.needsProfileCompletion) {
        router.replace('/complete-profile');
        return;
      }
      const target = getSafeAuthRedirect(redirect);
      if (target) router.replace(toAppHref(target));
      else router.replace('/');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تسجيل الدخول باستخدام Google.',
      );
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <ScreenFrame>
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
            onPress={() => goBack('/')}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <AppIcon name="back" size={18} color={colors.brandOnSoft} />
            <Text style={styles.backText}>رجوع</Text>
          </Pressable>

          <View style={styles.hero}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>م</Text>
            </View>
            <Text style={styles.title}>أهلًا بعودتك</Text>
            <Text style={styles.subtitle}>سجّل دخولك إلى حساب MarketPlat</Text>
          </View>

          <View style={styles.formCard}>
            <Field
              label="البريد الإلكتروني"
              value={email}
              inputRef={emailInputRef}
              onChangeText={setEmail}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoComplete="email"
              editable={!isBusy}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
            />
            <Field
              label="كلمة المرور"
              value={password}
              inputRef={passwordInputRef}
              onChangeText={setPassword}
              placeholder="أدخل كلمة المرور"
              secureTextEntry={!passwordVisible}
              autoComplete="current-password"
              editable={!isBusy}
              returnKeyType="done"
              onSubmitEditing={() => {
                void submit();
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              accessibilityState={{ selected: passwordVisible }}
              onPress={() => setPasswordVisible((visible) => !visible)}
              style={styles.passwordToggle}
            >
              <Text style={styles.linkMuted}>
                {passwordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              </Text>
            </Pressable>

            {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}

            <PrimaryButton
              label="تسجيل الدخول"
              onPress={() => {
                void submit();
              }}
              busy={isBusy}
            />

            <Pressable
              accessibilityRole="button"
              onPress={() => pushOnce('/forgot-password')}
              style={styles.linkBtn}
            >
              <Text style={styles.link}>نسيت كلمة المرور؟</Text>
            </Pressable>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>أو</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="المتابعة باستخدام Google"
            accessibilityState={{ disabled: isBusy || googleBusy }}
            disabled={isBusy || googleBusy}
            onPress={() => {
              void submitGoogle();
            }}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.pressed,
              (isBusy || googleBusy) && styles.disabled,
            ]}
          >
            <View style={styles.googleGlyphWrap}>
              <Text style={styles.googleGlyph}>G</Text>
            </View>
            <Text style={styles.googleText}>
              {googleBusy ? 'جارٍ الاتصال بـ Google…' : 'المتابعة باستخدام Google'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              pushOnce({
                pathname: '/register',
                params: redirectParam,
              })
            }
            style={styles.footerLink}
          >
            <Text style={styles.footerText}>
              ليس لديك حساب؟ <Text style={styles.footerTextStrong}>إنشاء حساب</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenFrame>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  keyboard: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  pressed: { opacity: ux.pressedOpacity },
  disabled: { opacity: 0.55 },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
    marginBottom: spacing.xs,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.hero,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.md,
  },
  logoText: {
    color: colors.onBrand,
    fontSize: fontSizes[32],
    fontWeight: fontWeights.bold,
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
    minHeight: sizes.touchTarget,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  link: {
    color: colors.brand,
    ...typography.captionStrong,
    textAlign: 'center',
  },
  linkMuted: {
    color: colors.muted,
    ...typography.captionStrong,
  },
  linkBtn: {
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.muted,
    ...typography.caption,
  },
  googleButton: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    ...elevation.xs,
  },
  googleGlyphWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleGlyph: {
    color: colors.brand,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes[16],
  },
  googleText: {
    color: colors.ink,
    ...typography.bodyStrong,
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
    fontWeight: fontWeights.bold,
  },
});
