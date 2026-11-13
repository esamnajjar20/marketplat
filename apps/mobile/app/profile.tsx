import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { useState } from 'react';

import { pushOnce } from '@/lib/navigation';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyProfile, updateMyProfile, changeMyPassword, resendVerification, uploadMyAvatar, type AccountProfile } from '@/features/account/account.api';
import { Avatar, Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';
import { normalizePickedImage } from '@/lib/normalize-image-asset';
import { useAsyncResource } from '@/hooks/useAsyncResource';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const { accessToken, csrfToken, user } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  // دورة الجلب الموحّدة؛ حقول النموذج تُهيَّأ من الملف المُحمَّل.
  const resource = useAsyncResource<AccountProfile>(
    async () => {
      const p = await fetchMyProfile(accessToken as string, user?.id);
      setName(p.name || '');
      setPhone(p.phone || '');
      setCity(p.city || '');
      setBio(p.bio || '');
      return p;
    },
    {
      key: `${user?.id ?? ''}|${accessToken ? 1 : 0}`,
      manual: !accessToken,
      tag: 'profile',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الملف الشخصي.'),
    },
  );
  const { data: profile, loading, setData } = resource;
  const error = actionError || resource.error || '';
  const save = async () => {
    if (!accessToken)
      return;
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      const p = await updateMyProfile({
        name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), city: city.trim(), bio: bio.trim()
      }, accessToken, csrfToken, user?.id);
      setData(p);
      setMessage('تم حفظ بياناتك.');
    }
    catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر الحفظ.');
    }
    finally {
      setBusy(false);
    }
  };
  const chooseAvatar = async () => {
    if (!accessToken) {
      pushOnce('/login');
      return;
    }
    if (!(profile?.emailVerified ?? user?.emailVerified)) {
      setActionError('أكد بريدك الإلكتروني قبل رفع الصورة الشخصية.');
      return;
    }
    setAvatarBusy(true);
    setActionError('');
    setMessage('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .85
      });
      if (result.canceled || !result.assets[0])
        return;
      const asset = result.assets[0];
      if (typeof asset.fileSize === 'number' && asset.fileSize > 5 * 1024 * 1024)
        throw new Error('اختر صورة بحجم 5 ميغابايت أو أقل.');
      const normalizedImage = normalizePickedImage(asset, 'avatar');
      const updated = await uploadMyAvatar(normalizedImage, accessToken, csrfToken);
      setData(updated);
      setMessage('تم تحديث الصورة الشخصية.');
    }
    catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر تحديث الصورة الشخصية.');
    }
    finally {
      setAvatarBusy(false);
    }
  };
  const savePassword = async () => {
    if (!accessToken)
      return;
    if (newPassword.length < 8) {
      setActionError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      await changeMyPassword(currentPassword, newPassword, accessToken, csrfToken);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('تم تغيير كلمة المرور.');
    }
    catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر تغيير كلمة المرور.');
    }
    finally {
      setBusy(false);
    }
  };
  return <PageShell title="ملفي الشخصي">{!accessToken ? <><Notice>سجّل الدخول لإدارة ملفك الشخصي.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')}/></> : loading ? <Notice tone="muted">جارٍ تحميل بيانات الحساب…</Notice> : <><SectionCard><View style={{
    alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.lg
  }}><Avatar uri={profile?.avatarUrl} name={name} size="hero" /><PrimaryButton label={avatarBusy ? 'جارٍ رفع الصورة…' : 'تغيير الصورة الشخصية'} variant="secondary" onPress={() => void chooseAvatar()} busy={avatarBusy}/></View><Notice tone="muted">{profile?.emailVerified ? 'البريد الإلكتروني مؤكد.' : `البريد ${user?.email || ''} غير مؤكد بعد.`}</Notice>{profile?.emailVerified === false ? <PrimaryButton label="إعادة إرسال رسالة التحقق" variant="secondary" onPress={async () => {
    setActionError('');
    setMessage('');
    try {
      await resendVerification(accessToken, csrfToken);
      setMessage('إذا كان مسموحًا، ستصل رسالة التحقق إلى بريدك.');
    }
    catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر الإرسال.');
    }
  }}/> : null}<Field label="الاسم" value={name} onChangeText={setName}/><Field label="رقم الهاتف" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/><Field label="المدينة" value={city} onChangeText={setCity}/><Field label="نبذة عنك" value={bio} onChangeText={setBio} multiline maxLength={500}/><PrimaryButton label="حفظ الملف الشخصي" onPress={() => void save()} busy={busy}/></SectionCard><SectionCard><Text style={{
    textAlign: 'right', fontSize: fontSizes[17], fontWeight: fontWeights.bold, color: colors.ink, marginBottom: spacing.xs
  }}>أمان الحساب</Text><Field label="كلمة المرور الحالية" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry/><Field label="كلمة المرور الجديدة" value={newPassword} onChangeText={setNewPassword} secureTextEntry/><PrimaryButton label="تغيير كلمة المرور" variant="secondary" onPress={() => void savePassword()} busy={busy}/></SectionCard></>}{message ? <Notice tone="success">{message}</Notice> : null}{error ? <Notice>{error}</Notice> : null}</PageShell>;
}
