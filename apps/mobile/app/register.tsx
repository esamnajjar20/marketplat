import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/api/client';
import { Field, Notice, PageShell, PrimaryButton } from '@/components/MobileUI';
import { colors, typography } from '@/theme/tokens';
import { registerSchema, validate } from '@/lib/validation';

export default function RegisterScreen() {
  const { register, isBusy } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    const checked = validate(registerSchema, { name, email, password, phone, city });
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
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : 'تعذر إنشاء الحساب.',
      );
    }
  };

  return (
    <PageShell title="إنشاء حساب">
      <Field label="الاسم الكامل" value={name} onChangeText={setName} placeholder="اسمك" />
      <Field
        label="البريد الإلكتروني"
        value={email}
        onChangeText={setEmail}
        placeholder="name@example.com"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Field
        label="كلمة المرور"
        value={password}
        onChangeText={setPassword}
        placeholder="8 أحرف على الأقل"
        secureTextEntry
        autoComplete="new-password"
      />
      <Field
        label="رقم الهاتف (اختياري)"
        value={phone}
        onChangeText={setPhone}
        placeholder="+970…"
        keyboardType="phone-pad"
      />
      <Field label="المدينة (اختياري)" value={city} onChangeText={setCity} placeholder="المدينة" />

      {error ? <Notice>{error}</Notice> : null}

      <PrimaryButton
        label="إنشاء الحساب"
        onPress={() => {
          void submit();
        }}
        busy={isBusy}
      />

      <Pressable accessibilityRole="button" onPress={() => router.push('/login')}>
        <Text style={{ textAlign: 'center', color: colors.brand, ...typography.bodyStrong, padding: 8 }}>
          لديك حساب؟ تسجيل الدخول
        </Text>
      </Pressable>

      <Notice tone="muted">
        قد تحتاج إلى تأكيد بريدك الإلكتروني قبل استخدام بعض ميزات السوق.
      </Notice>
    </PageShell>
  );
}
