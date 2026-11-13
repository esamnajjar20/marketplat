import { useAppTheme } from '@/theme/ThemeProvider';
import { invalidateNavigationCapabilities } from '@/lib/navigation-policy';
import { AppText as Text } from '@/components/ui/AppText';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { createSellerProfile, fetchMySellerProfile, updateSellerProfile, type SellerProfile } from '@/features/account/seller.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';
import { useAsyncResource } from '@/hooks/useAsyncResource';
export default function SellerProfileScreen() {
  const { colors } = useAppTheme();
  const { accessToken, csrfToken, user } = useAuth();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  // دورة الجلب الموحّدة؛ حقول النموذج تُهيَّأ من الملف المُحمَّل.
  const resource = useAsyncResource<SellerProfile | null>(
    async () => {
      const p = await fetchMySellerProfile(accessToken as string, user?.id);
      setName(p?.displayName || '');
      setBio(p?.bio || '');
      return p;
    },
    {
      key: `${user?.id ?? ''}|${accessToken ? 1 : 0}`,
      manual: !accessToken,
      tag: 'seller-profile',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل ملف البائع.'),
    },
  );
  const { data: profile, loading, setData: setProfile } = resource;
  const error = actionError || resource.error || '';
  const save = async () => {
    if (!accessToken) {
      pushOnce('/login');
      return;
    }
    if (!user?.emailVerified) {
      setActionError('أكد بريدك الإلكتروني قبل إنشاء ملف البائع.');
      return;
    }
    if (name.trim().length < 2) {
      setActionError('اسم العرض يجب أن يتكون من حرفين على الأقل.');
      return;
    }
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      const p = profile ? await updateSellerProfile({
        displayName: name.trim(), bio: bio.trim() || null
      }, accessToken, csrfToken) : await createSellerProfile({
        displayName: name.trim(), bio: bio.trim(), agreedToSellerTerms: true
      }, accessToken, csrfToken);
      setProfile(p);
      invalidateNavigationCapabilities();
      setMessage('تم حفظ ملف البائع. يمكنك الآن متابعة إعداد ملف مقدم الخدمة أو المتجر.');
    }
    catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر حفظ الملف.');
    }
    finally {
      setBusy(false);
    }
  };
  return <PageShell title="ملف البائع">{!accessToken ? <><Notice>سجّل الدخول لإعداد ملف البائع.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')}/></> : loading ? <Notice tone="muted">جارٍ تحميل الملف…</Notice> : <SectionCard><Text style={{
    textAlign: 'right', fontWeight: fontWeights.bold, fontSize: fontSizes[18], color: colors.ink, marginBottom: spacing.xs
  }}>{profile ? 'تعديل ملف البائع' : 'إنشاء ملف بائع'}</Text><Field label="اسم العرض" value={name} onChangeText={setName} maxLength={50} placeholder="الاسم الذي يظهر للعملاء"/><Field label="نبذة مختصرة" value={bio} onChangeText={setBio} multiline maxLength={300} placeholder="عرّف العملاء بك وبنشاطك"/>{!profile ? <View style={{
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm
  }}><Switch value={terms} onValueChange={setTerms} trackColor={{ true: colors.brand }}/><Text style={{
    flex: 1, textAlign: 'right', color: colors.ink
  }}>أوافق على شروط البائع وأفهم أن بياناتي ستظهر وفق سياسة المنصة.</Text></View> : null}<PrimaryButton label={profile ? 'حفظ التعديلات' : 'إنشاء ملف البائع'} onPress={() => {
    if (!profile && !terms) {
      setActionError('يجب الموافقة على شروط البائع للمتابعة.');
      return;
    }
    void save();
  }} busy={busy}/>{profile ? <PrimaryButton label="إعداد ملف مقدم الخدمة" variant="secondary" onPress={() => pushOnce('/service-provider-profile')}/> : null}</SectionCard>}{error ? <Notice>{error}</Notice> : null}{message ? <Notice tone="success">{message}</Notice> : null}</PageShell>;
}
