import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthContext';
import { Field, Notice, PrimaryButton } from '@/components/MobileUI';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function LoginScreen() {
  const { login, isBusy } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMessage('أدخل بريدًا إلكترونيًا صحيحًا.');
      return;
    }
    if (!password) {
      setErrorMessage('أدخل كلمة المرور.');
      return;
    }
    setErrorMessage(null);
    try {
      await login(normalizedEmail, password);
      setPassword('');
      router.replace('/');
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹ رجوع</Text>
        </Pressable>

        <View style={styles.logo}>
          <Text style={styles.logoText}>م</Text>
        </View>
        <Text style={styles.title}>أهلًا بعودتك</Text>
        <Text style={styles.subtitle}>سجّل دخولك إلى حساب MarketPlat</Text>

        <Field
          label="البريد الإلكتروني"
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoComplete="email"
          editable={!isBusy}
          returnKeyType="next"
        />
        <Field
          label="كلمة المرور"
          value={password}
          onChangeText={setPassword}
          placeholder="أدخل كلمة المرور"
          secureTextEntry
          autoComplete="current-password"
          editable={!isBusy}
          returnKeyType="done"
          onSubmitEditing={() => {
            void submit();
          }}
        />

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
        <Pressable accessibilityRole="button" onPress={() => router.push('/register')} style={styles.linkBtn}>
          <Text style={styles.link}>إنشاء حساب جديد</Text>
        </Pressable>

        <Text style={styles.securityNote}>
          يُحفظ رمز الوصول داخل التخزين الآمن للجهاز. لا يخزّن التطبيق رمز التجديد؛ يعتمد تجديد
          الجلسة على Cookie آمنة يديرها الخادم.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
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
  logoText: { color: colors.white, fontSize: 32, fontWeight: '800' },
  title: { color: colors.ink, ...typography.display, textAlign: 'center', fontSize: 26, lineHeight: 34 },
  subtitle: { color: colors.muted, ...typography.body, textAlign: 'center', marginBottom: spacing.sm },
  linkBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  link: { color: colors.brand, ...typography.bodyStrong, textAlign: 'center' },
  securityNote: { color: colors.muted, ...typography.caption, textAlign: 'center', lineHeight: 18 },
});
