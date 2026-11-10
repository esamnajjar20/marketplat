import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyStore } from '@/features/commerce/commerce.api';
import { fetchMyActiveStoreMemberships, fetchStoreMembers, inviteStoreMember, removeStoreMember, updateStoreMemberRole, type StoreMember } from '@/features/commerce/store-management.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes } from '@/theme/tokens';
import { roleLabel } from '@/lib/status-labels';

const roles = [['MANAGER', 'مدير'], ['EDITOR', 'محرر'], ['STAFF', 'موظف']] as const;

export default function StoreTeamScreen() {
  const { colors } = useAppTheme();

  const { accessToken, csrfToken, user } = useAuth();
  const routeParams = useLocalSearchParams<{ storeId?: string | string[] }>();
  const requestedStoreId = Array.isArray(routeParams.storeId) ? routeParams.storeId[0] : routeParams.storeId;
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [myRole, setMyRole] = useState<StoreMember['role'] | 'OWNER' | ''>('');
  const [items, setItems] = useState<StoreMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StoreMember['role']>('STAFF');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(false);
  const canManage = myRole === 'OWNER' || myRole === 'MANAGER';

  const load = useCallback(async () => {
    if (!accessToken) { setLoading(false); return; }
    if (!hasLoadedRef.current) setLoading(true);
    setError('');
    try {
      const owned = await fetchMyStore(accessToken);
      let selectedStoreId = owned && (!requestedStoreId || requestedStoreId === owned.id) ? owned.id : '';
      let selectedStoreName = selectedStoreId ? owned?.name ?? '' : '';
      let selectedRole: StoreMember['role'] | 'OWNER' | '' = selectedStoreId ? 'OWNER' : '';
      if (!selectedStoreId) {
        const memberships = await fetchMyActiveStoreMemberships(accessToken);
        const membership = requestedStoreId
          ? memberships.find((entry) => entry.store.id === requestedStoreId)
          : memberships.find((entry) => entry.role === 'MANAGER') ?? memberships[0];
        if (membership) {
          selectedStoreId = membership.store.id;
          selectedStoreName = membership.store.name;
          selectedRole = membership.role;
        } else if (requestedStoreId) {
          throw new Error('لا تملك عضوية نشطة في هذا المتجر.');
        }
      }
      setStoreId(selectedStoreId);
      setStoreName(selectedStoreName);
      setMyRole(selectedRole);
      if (!selectedStoreId) { setItems([]); return; }
      setItems(await fetchStoreMembers(selectedStoreId, accessToken));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل فريق المتجر.');
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [accessToken, requestedStoreId]);

  useEffect(() => { void load(); }, [load]);

  const invite = async () => {
    if (!accessToken) return router.push('/login');
    if (!canManage) return setError('لا تملك صلاحية إدارة أعضاء هذا المتجر.');
    if (!storeId) return setError('لا يوجد متجر مرتبط بحسابك.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('أدخل بريدًا إلكترونيًا صحيحًا.');
    setBusy(true); setError('');
    try {
      await inviteStoreMember(storeId, email.trim().toLowerCase(), role, accessToken, csrfToken);
      setEmail('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إرسال الدعوة.'); }
    finally { setBusy(false); }
  };

  const act = async (fn: () => Promise<unknown>) => {
    if (!accessToken || !canManage) return;
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تنفيذ العملية.'); }
    finally { setBusy(false); }
  };

  return <PageShell title="فريق المتجر">
    {!accessToken ? <><Notice>سجّل الدخول لعرض فريق المتجر.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : null}
    {accessToken && loading ? <Notice tone="muted">جارٍ تحميل أعضاء الفريق…</Notice> : null}
    {accessToken && !loading && !storeId ? <SectionCard><Notice tone="muted">لا يوجد متجر تملكه أو عضوية متجر نشطة مرتبطة بحسابك.</Notice><PrimaryButton label="المتاجر التي أعمل بها" variant="secondary" onPress={() => router.push('/my-stores')} /><PrimaryButton label="إنشاء متجر" onPress={() => router.push('/my-store')} /></SectionCard> : null}
    {accessToken && !loading && storeId ? <>
      <SectionCard>
        <Text style={{ textAlign: 'right', fontSize: fontSizes[17], fontWeight: '900', color: colors.ink }}>{storeName || 'فريق المتجر'}</Text>
        <Text style={{ textAlign: 'right', color: colors.muted }}>صلاحيتك: {myRole === 'OWNER' ? 'مالك المتجر' : roleLabel(myRole)}</Text>
        {canManage ? <>
          <Text style={{ textAlign: 'right', fontSize: fontSizes[16], fontWeight: '900', color: colors.ink }}>دعوة عضو جديد</Text>
          <Field label="البريد الإلكتروني" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="person@example.com" />
          <Text style={{ textAlign: 'right', fontWeight: '800', color: colors.ink }}>الصلاحية</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>{roles.filter(([value]) => myRole === 'OWNER' || value !== 'MANAGER').map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: role === value }} onPress={() => setRole(value)} style={{ flex: 1, padding: 9, borderRadius: 10, backgroundColor: role === value ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: role === value ? colors.brand : colors.border }}><Text style={{ textAlign: 'center', color: colors.ink, fontSize: fontSizes[12], fontWeight: '700' }}>{label}</Text></Pressable>)}</View>
          <PrimaryButton label="إرسال الدعوة" onPress={() => void invite()} busy={busy} />
          <PrimaryButton label="الدعوات الواردة إليّ" variant="secondary" onPress={() => router.push('/store-invites')} />
        </> : <Notice tone="muted">يمكنك الاطلاع على أعضاء الفريق. تعديل الصلاحيات أو دعوة أعضاء متاح لمالك المتجر والمدير فقط.</Notice>}
      </SectionCard>
      {items.length === 0 ? <Notice tone="muted">لا يوجد أعضاء آخرون في الفريق حاليًا.</Notice> : items.map((member) => <SectionCard key={member.id}>
        <Text style={{ textAlign: 'right', fontSize: fontSizes[15], fontWeight: '900', color: colors.ink }}>{member.user?.name || member.user?.email || 'عضو فريق'}</Text>
        <Text style={{ textAlign: 'right', color: colors.muted }}>{member.user?.email || '—'} · {member.status === 'ACTIVE' ? 'نشط' : member.status === 'PENDING' ? 'بانتظار القبول' : 'مزال'} · {roleLabel(member.role)}</Text>
        {canManage && member.status !== 'REMOVED' && member.user?.id !== user?.id ? <>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{roles.filter(([value]) => myRole === 'OWNER' || value !== 'MANAGER').map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: member.role === value }} onPress={() => member.role !== value && void act(() => updateStoreMemberRole(storeId, member.id, value, accessToken, csrfToken))} style={{ padding: 8, borderRadius: 8, borderWidth: 1, borderColor: member.role === value ? colors.brand : colors.border, backgroundColor: member.role === value ? colors.brandSoft : colors.surface }}><Text style={{ color: colors.ink, fontSize: fontSizes[12] }}>{label}</Text></Pressable>)}</View>
          {myRole === 'OWNER' || member.role !== 'MANAGER' ? <PrimaryButton label="إزالة من الفريق" variant="danger" onPress={() => Alert.alert('إزالة العضو', 'سيُلغى وصول هذا العضو إلى المتجر. هل تريد المتابعة؟', [{ text: 'إلغاء', style: 'cancel' }, { text: 'إزالة', style: 'destructive', onPress: () => void act(() => removeStoreMember(storeId, member.id, accessToken, csrfToken)) }]) } /> : null}
        </> : null}
      </SectionCard>)}
    </> : null}
    {error ? <Notice>{error}</Notice> : null}
  </PageShell>;
}
