import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Notice, PageShell, Field, PrimaryButton, SectionCard } from '@/components/ui';
import { AppText as Text } from '@/components/ui/AppText';
import { useAuthActions, useAuthSession, useAuthUser } from '@/features/auth/AuthContext';
import { fetchManagedStoreSettings, updateManagedStoreSettings } from '@/features/commerce/store-management.api';
import type { StoreSummary } from '@/features/commerce/commerce.api';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { showToast } from '@/lib/toast';

export default function ManagedStoreSettingsScreen() {
  const params = useLocalSearchParams<{ storeId?: string | string[] }>();
  const storeId = Array.isArray(params.storeId) ? params.storeId[0] : params.storeId;
  const { user } = useAuthUser();
  const { accessToken, csrfToken } = useAuthSession();
  const { getAccessToken } = useAuthActions();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const resource = useAsyncResource<StoreSummary | null>(
    async () => {
      const token = getAccessToken();
      if (!token || !storeId) return null;
      const store = await fetchManagedStoreSettings(storeId, token);
      setName(store.name ?? '');
      setDescription(store.description ?? '');
      setCity(store.city ?? '');
      setAddress(store.address ?? '');
      setPhone(store.phone ?? '');
      return store;
    },
    {
      key: `${user?.id ?? ''}|${storeId ?? ''}`,
      manual: !accessToken || !storeId,
      tag: 'managed-store-settings',
      mapError: (error) => error instanceof Error ? error.message : 'تعذر تحميل إعدادات المتجر.',
    },
  );

  const save = async () => {
    const token = getAccessToken();
    if (!token) return router.push('/login');
    if (!storeId) return;
    if (name.trim().length < 2 || description.trim().length < 10 || description.trim().length > 1000 || !city.trim() || phone.trim().length < 7 || phone.trim().length > 20) {
      showToast('تحقق من البيانات', 'اسم المتجر حرفان على الأقل، والوصف من 10 إلى 1000 حرف، والمدينة مطلوبة، ورقم الهاتف من 7 إلى 20 خانة.', 'info');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateManagedStoreSettings(storeId, {
        name: name.trim(), description: description.trim(), city: city.trim(),
        address: address.trim(), phone: phone.trim(),
      }, token, csrfToken);
      resource.setData(updated);
      showToast('تم الحفظ', 'تم تحديث إعدادات المتجر.', 'success');
    } catch (error) {
      showToast('تعذر الحفظ', error instanceof Error ? error.message : 'حاول مرة أخرى.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="إعدادات المتجر">
      {!accessToken ? <><Notice>سجّل الدخول لإدارة إعدادات المتجر.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : null}
      {accessToken && !storeId ? <Notice>لم يتم تحديد المتجر. افتح هذه الصفحة من قائمة المتاجر التي تعمل بها.</Notice> : null}
      {resource.loading ? <Notice tone="muted">جارٍ تحميل الإعدادات…</Notice> : null}
      {resource.error ? <Notice>{resource.error}</Notice> : null}
      {resource.data ? (
        <SectionCard>
          <Text tone="ink" strong size={16}>{resource.data.name}</Text>
          <Notice tone="muted">يمكن للمالك والمدير تعديل البيانات الأساسية. تغيير نوع المتجر وخصائصه الأساسية يظل من صلاحيات المالك.</Notice>
          <Field label="اسم المتجر" value={name} onChangeText={setName} maxLength={100} />
          <Field label="الوصف" value={description} onChangeText={setDescription} maxLength={1000} multiline />
          <Field label="المدينة" value={city} onChangeText={setCity} maxLength={100} />
          <Field label="العنوان" value={address} onChangeText={setAddress} maxLength={200} />
          <Field label="رقم الهاتف" value={phone} onChangeText={setPhone} maxLength={20} keyboardType="phone-pad" />
          <PrimaryButton label="حفظ الإعدادات" busy={busy} onPress={() => void save()} />
        </SectionCard>
      ) : null}
      {resource.error ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void resource.reload()} /> : null}
    </PageShell>
  );
}
