import { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyProfile, updateMyProfile, resendVerification, uploadMyAvatar, type AccountProfile } from '@/features/account/account.api';
import { Avatar, ErrorState, Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';
import { normalizePickedImage } from '@/lib/normalize-image-asset';
import { normalizePhoneDigits } from '@/lib/normalize-phone';
import { useAsyncResource } from '@/hooks/useAsyncResource';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const { accessToken, csrfToken, user, updateUser } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);

  const resource = useAsyncResource<AccountProfile>(
    async () => {
      const profile = await fetchMyProfile(accessToken as string, user?.id);
      setName(profile.name || '');
      setPhone(profile.phone || '');
      setCity(profile.city || '');
      setBio(profile.bio || '');
      return profile;
    },
    {
      key: `${user?.id ?? ''}|${accessToken ? 1 : 0}`,
      manual: !accessToken,
      tag: 'profile',
      mapError: (cause) => (cause instanceof Error && cause.message ? cause.message : 'تعذر تحميل الملف الشخصي.'),
    },
  );
  const { data: profile, loading, setData, reload } = resource;
  const error = actionError || resource.error || '';

  const applyUserSnapshot = (updated: AccountProfile) => {
    updateUser({
      name: updated.name,
      ...(updated.city !== undefined ? { city: updated.city } : {}),
      ...(updated.avatarUrl !== undefined ? { avatarUrl: updated.avatarUrl } : {}),
      ...(typeof updated.emailVerified === 'boolean' ? { emailVerified: updated.emailVerified } : {}),
    });
  };

  const save = async () => {
    if (!accessToken) return;
    const normalizedPhone = normalizePhoneDigits(phone.trim());
    setPhoneError('');
    if (normalizedPhone && !/^\+?[0-9]{9,15}$/.test(normalizedPhone)) {
      setPhoneError('أدخل 9 إلى 15 رقمًا، ويمكن أن يبدأ الرقم بعلامة +.');
      return;
    }
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      const updated = await updateMyProfile({
        name: name.trim(),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        city: city.trim(),
        bio: bio.trim(),
      }, accessToken, csrfToken, user?.id);
      setData(updated);
      applyUserSnapshot(updated);
      setPhone(updated.phone || '');
      setMessage('تم حفظ بياناتك.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر الحفظ.');
    } finally {
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
      if (!permission.granted) throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (typeof asset.fileSize === 'number' && asset.fileSize > 5 * 1024 * 1024) {
        throw new Error('اختر صورة بحجم 5 ميغابايت أو أقل.');
      }
      const normalizedImage = normalizePickedImage(asset, 'avatar');
      const updated = await uploadMyAvatar(normalizedImage, accessToken, csrfToken);
      setData(updated);
      applyUserSnapshot(updated);
      setMessage('تم تحديث الصورة الشخصية.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر تحديث الصورة الشخصية.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const resendEmailVerification = async () => {
    if (!accessToken) return;
    setActionError('');
    setMessage('');
    try {
      await resendVerification(accessToken, csrfToken);
      setMessage('إذا كان مسموحًا، ستصل رسالة التحقق إلى بريدك.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'تعذر الإرسال.');
    }
  };

  return (
    <PageShell title="ملفي الشخصي">
      {!accessToken ? (
        <><Notice>سجّل الدخول لإدارة ملفك الشخصي.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} /></>
      ) : loading ? (
        <Notice tone="muted">جارٍ تحميل بيانات الحساب…</Notice>
      ) : resource.error || !profile ? (
        <ErrorState title="تعذر تحميل الملف الشخصي" description={resource.error || 'لم تصل بيانات الملف الشخصي من الخادم.'} onAction={() => void reload()} actionLabel="إعادة المحاولة" />
      ) : (
        <>
          <SectionCard>
            <View style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.lg }}>
              <Avatar uri={profile.avatarUrl} name={name} size="hero" />
              <PrimaryButton label={avatarBusy ? 'جارٍ رفع الصورة…' : 'تغيير الصورة الشخصية'} variant="secondary" onPress={() => void chooseAvatar()} busy={avatarBusy} />
            </View>
            <Notice tone="muted">{profile.emailVerified ? 'البريد الإلكتروني مؤكد.' : `البريد ${user?.email || ''} غير مؤكد بعد.`}</Notice>
            {profile.emailVerified === false ? <PrimaryButton label="إعادة إرسال رسالة التحقق" variant="secondary" onPress={() => void resendEmailVerification()} /> : null}
            <Field label="الاسم" value={name} onChangeText={setName} editable={!busy} />
            <Field label="رقم الهاتف" value={phone} onChangeText={(value) => { setPhone(value); if (phoneError) setPhoneError(''); }} keyboardType="phone-pad" maxLength={16} editable={!busy} error={phoneError} hint="تُقبل الأرقام العربية والفارسية؛ مثال: +972591234567" />
            <Field label="المدينة" value={city} onChangeText={setCity} editable={!busy} />
            <Field label="نبذة عنك" value={bio} onChangeText={setBio} multiline maxLength={500} editable={!busy} />
            <PrimaryButton label="حفظ الملف الشخصي" onPress={() => void save()} busy={busy} disabled={busy || avatarBusy} />
          </SectionCard>
          <SectionCard>
            <Text style={{ textAlign: 'right', fontSize: fontSizes[17], fontWeight: fontWeights.bold, color: colors.ink, marginBottom: spacing.xs }}>أمان الحساب</Text>
            <Notice tone="muted">تغيير كلمة المرور وإدارة الجلسات متاحان من صفحة أمان الحساب.</Notice>
            <PrimaryButton label="إدارة كلمة المرور والأمان" variant="secondary" onPress={() => pushOnce('/security')} />
          </SectionCard>
        </>
      )}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error && !resource.error ? <Notice>{error}</Notice> : null}
    </PageShell>
  );
}
