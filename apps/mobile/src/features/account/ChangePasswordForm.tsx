import { useState } from 'react';
import { router } from 'expo-router';
import { AppText as Text } from '@/components/ui/AppText';
import { Field, Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { useAuthActions, useAuthSession } from '@/features/auth/AuthContext';
import { changeMyPassword } from '@/features/account/account.api';
import { getPasswordPolicyError } from '../../lib/validation';
import { showToast } from '@/lib/toast';
import { spacing } from '@/theme/tokens';
import { View } from 'react-native';

/** Password change is deliberately hosted in the Security destination. */
export function ChangePasswordForm() {
  const { accessToken, csrfToken } = useAuthSession();
  const { forceLocalSignOut } = useAuthActions();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [currentPasswordError, setCurrentPasswordError] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  const submit = async () => {
    setError('');
    setCurrentPasswordError('');
    setNewPasswordError('');
    setConfirmPasswordError('');
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (!currentPassword) {
      setCurrentPasswordError('أدخل كلمة المرور الحالية.');
      return;
    }
    const policyError = getPasswordPolicyError(newPassword);
    if (policyError) {
      setNewPasswordError(policyError);
      return;
    }
    if (newPassword === currentPassword) {
      setNewPasswordError('كلمة المرور الجديدة يجب أن تختلف عن الحالية.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setBusy(true);
    try {
      await changeMyPassword(currentPassword, newPassword, accessToken, csrfToken);
      // The API blacklists this access token and revokes every refresh token.
      // Do not leave the app displaying an authenticated session that no longer exists.
      const local = await forceLocalSignOut();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (local.sessionRemoved) {
        showToast('تم تغيير كلمة المرور', 'سجّل الدخول مجددًا باستخدام كلمة المرور الجديدة.', 'success');
      } else {
        showToast('تم تغيير كلمة المرور', 'انتهت الجلسات على الخادم، لكن التخزين الآمن لم يؤكد حذف الجلسة المحلية. تحقق من تسجيل الخروج قبل مشاركة الجهاز.', 'warning');
      }
      router.replace('/login');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تغيير كلمة المرور.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard>
      <View style={{ gap: spacing.sm }}>
        <Text tone="ink" strong size={17}>تغيير كلمة المرور</Text>
        <Text tone="muted" size={12}>استخدم كلمة مرور من 8 إلى 100 حرف، وتجنب كلمات المرور الشائعة. بعد نجاح التغيير ستُنهي الجلسات الحالية وتحتاج إلى تسجيل الدخول من جديد.</Text>
        <Field label="كلمة المرور الحالية" value={currentPassword} onChangeText={(value) => { setCurrentPassword(value); if (currentPasswordError) setCurrentPasswordError(''); }} secureTextEntry editable={!busy} error={currentPasswordError} />
        <Field label="كلمة المرور الجديدة" value={newPassword} onChangeText={(value) => { setNewPassword(value); if (newPasswordError) setNewPasswordError(''); }} secureTextEntry editable={!busy} error={newPasswordError} />
        <Field label="تأكيد كلمة المرور الجديدة" value={confirmPassword} onChangeText={(value) => { setConfirmPassword(value); if (confirmPasswordError) setConfirmPasswordError(''); }} secureTextEntry editable={!busy} error={confirmPasswordError} />
        {error ? <Notice>{error}</Notice> : null}
        <PrimaryButton label="تغيير كلمة المرور" onPress={() => void submit()} busy={busy} disabled={busy} />
      </View>
    </SectionCard>
  );
}
