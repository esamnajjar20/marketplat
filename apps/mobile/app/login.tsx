import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthContext';
import { Field, Notice, PrimaryButton } from '@/components/MobileUI';
import type { TextInputHandle } from '@/components/ui/Field';
import { fontSizes, colors, spacing, typography } from '@/theme/tokens';
import { loginSchema, validate } from '@/lib/validation';
import { getSafeAuthRedirect } from '@/lib/safe-auth-redirect';

export default function LoginScreen() {
  const { login, isBusy } = useAuth();
  const { redirect } = useLocalSearchParams<{ redirect?: string | string[] }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const emailInputRef = useRef<TextInputHandle>(null);
  const passwordInputRef = useRef<TextInputHandle>(null);

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
      if (target) router.replace(target as never);
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'تعذر تسجيل الدخول. حاول مجددًا.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => goBack('/')} style={styles.back}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><AppIcon name="back" size={18} color={colors.brand} /><Text style={styles.backText}>رجوع</Text></View>
        </Pressable>

        <View style={styles.logo}>
          <Text style={styles.logoText}>م</Text>
        </View>
        <Text style={styles.title}>أهلًا بعودتك</Text>
        <Text style={styles.subtitle}>سجّل دخولك إلى حساب MarketPlat</Text>

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
          onSubmitEditing={() => { void submit(); }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} accessibilityState={{ selected: passwordVisible }} onPress={() => setPasswordVisible((visible) => !visible)} style={styles.passwordToggle}>
          <Text style={styles.link}>{passwordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}</Text>
        </Pressable>

        {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}

        <PrimaryButton
          label="تسجيل الدخول"
          onPress={() => {
            void submit();
          }}
          busy={isBusy}
        />

        <Pressable accessibilityRole="button" onPress={() => router.push('/forgot-password')} style={styles.linkBtn}>
          <Text style={styles.link}>نسيت كلمة المرور؟</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/register', params: redirect ? { redirect: Array.isArray(redirect) ? redirect[0] : redirect } : undefined })} style={styles.linkBtn}>
          <Text style={styles.link}>إنشاء حساب جديد</Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  keyboard: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: { color: colors.brand, ...typography.bodyStrong },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  logoText: { color: colors.white, fontSize: fontSizes[32], fontWeight: '800' },
  title: { color: colors.ink, ...typography.display, textAlign: 'center', fontSize: fontSizes[26], lineHeight: 34 },
  subtitle: { color: colors.muted, ...typography.body, textAlign: 'center', marginBottom: spacing.sm },
  linkBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  passwordToggle: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: spacing.sm },
  link: { color: colors.brand, ...typography.bodyStrong, textAlign: 'center' },
});
