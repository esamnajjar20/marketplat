import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthContext';
import { colors, radius, spacing } from '@/theme/tokens';

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
      setErrorMessage(error instanceof ApiError || error instanceof Error ? error.message : 'تعذر تسجيل الدخول. حاول مجددًا.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>رجوع ←</Text></Pressable>
        <View style={styles.logo}><Text style={styles.logoText}>م</Text></View>
        <Text style={styles.title}>أهلًا بعودتك</Text>
        <Text style={styles.subtitle}>سجّل دخولك إلى حساب MarketPlat</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput accessibilityLabel="البريد الإلكتروني" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" editable={!isBusy} returnKeyType="next" />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput accessibilityLabel="كلمة المرور" autoCapitalize="none" autoComplete="current-password" secureTextEntry value={password} onChangeText={setPassword} placeholder="أدخل كلمة المرور" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" editable={!isBusy} onSubmitEditing={() => { void submit(); }} returnKeyType="done" />
        </View>

        {errorMessage ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: isBusy }} disabled={isBusy} onPress={() => { void submit(); }} style={[styles.submit, isBusy && styles.submitDisabled]}>
          {isBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>تسجيل الدخول</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/forgot-password')}><Text style={{ color: colors.brand, textAlign: 'center', fontWeight: '700' }}>نسيت كلمة المرور؟</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/register')}><Text style={{ color: colors.brand, textAlign: 'center', fontWeight: '700' }}>إنشاء حساب جديد</Text></Pressable>
        <Text style={styles.securityNote}>يُحفظ رمز الوصول داخل التخزين الآمن للجهاز. لا يخزّن التطبيق رمز التجديد؛ يعتمد تجديد الجلسة على Cookie آمنة يديرها الخادم.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: 'center' },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  backText: { color: colors.brand, fontSize: 14, fontWeight: '700' },
  logo: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: spacing.lg },
  logoText: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  title: { color: colors.ink, fontSize: 27, fontWeight: '800', textAlign: 'center', marginTop: spacing.sm },
  subtitle: { color: colors.muted, fontSize: 15, textAlign: 'center', marginBottom: spacing.md },
  fieldGroup: { gap: spacing.sm },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  input: { minHeight: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.ink, paddingHorizontal: spacing.md, fontSize: 15 },
  errorBox: { backgroundColor: '#FDECEC', borderColor: '#F3B7B7', borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  errorText: { color: '#A51D1D', textAlign: 'right', lineHeight: 21 },
  submit: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  submitDisabled: { opacity: 0.65 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  securityNote: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 19, marginTop: spacing.sm },
});
