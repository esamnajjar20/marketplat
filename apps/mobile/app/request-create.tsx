import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/api/client';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { createMarketplaceRequest, fetchRequestCategories } from '@/features/requests/requests.api';
import { enqueueMarketplaceRequest } from '@/storage/outbox-manager';
import { Field, Notice, PageShell, PrimaryButton } from '@/components/MobileUI';
import { showToast } from '@/lib/toast';
import { fontWeights, spacing, radius } from '@/theme/tokens';
type Kind = 'SERVICE' | 'PRODUCT' | 'RENTAL';
export default function RequestCreateScreen() {
  const { colors } = useAppTheme();
  const { accessToken, csrfToken, user } = useAuth();
  const operationIdRef = useRef(createMobileOperationId('mobile-request'));
  const [type, setType] = useState<Kind>('SERVICE');
  const [categories, setCategories] = useState<{
    id: string;
    name: string;
  }[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [catLoading, setCatLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setCategoryId('');
    setCatLoading(true);
    void fetchRequestCategories(type).then(a => {
      if (active) {
        setCategories(a);
        setCategoryId(a[0]?.id || '');
      }
    }).catch(e => {
      if (active)
        setError(e instanceof Error ? e.message : 'تعذر تحميل التصنيفات.');
    }).finally(() => {
      if (active)
        setCatLoading(false);
    });
    return () => {
      active = false;
    };
  }, [type]);
  const submit = async () => {
    if (!accessToken) {
      pushOnce('/login');
      return;
    }
    if (!user?.emailVerified) {
      setError('يجب تأكيد البريد الإلكتروني قبل إنشاء طلب.');
      return;
    }
    if (!categoryId) {
      setError('اختر تصنيفًا صالحًا من القائمة.');
      return;
    }
    if (title.trim().length < 5 || description.trim().length < 10) {
      setError('العنوان 5 أحرف على الأقل والوصف 10 أحرف على الأقل.');
      return;
    }
    const a = min.trim() ? Number(normalizeNumericInput(min)) : undefined, b = max.trim() ? Number(normalizeNumericInput(max)) : undefined;
    if ((a !== undefined && (!Number.isFinite(a) || a < 0)) || (b !== undefined && (!Number.isFinite(b) || b <= 0)) || (a !== undefined && b !== undefined && a > b)) {
      setError('تحقق من نطاق الميزانية.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        type, categoryId, title: title.trim(), description: description.trim(), city: city.trim() || undefined, budgetMin: a, budgetMax: b
      };
      const network = await NetInfo.fetch();
      const online = network.isConnected === true && network.isInternetReachable !== false;
      if (!online) {
        await enqueueMarketplaceRequest(String(user.id), operationIdRef.current, payload);
        showToast('حُفظ الطلب للمزامنة', 'لم يُنشر الطلب على الخادم بعد. سيُرسل تلقائيًا عند عودة الاتصال وتوفر جلسة الدخول بالحساب نفسه.', 'info', {
          label: 'عرض العمليات', onPress: () => router.replace('/offline-queue')
        });
        return;
      }
      const item = await createMarketplaceRequest(payload, accessToken, csrfToken, operationIdRef.current);
      router.replace({
        pathname: '/requests/[id]', params: { id: item.id }
      });
    }
    catch (e) {
      if (e instanceof ApiError && e.status == null && user?.id) {
        try {
          const payload = {
            type, categoryId, title: title.trim(), description: description.trim(), city: city.trim() || undefined, budgetMin: a, budgetMax: b
          };
          await enqueueMarketplaceRequest(String(user.id), operationIdRef.current, payload);
          showToast('حُفظ الطلب للمزامنة', 'انقطع الاتصال قبل تأكيد الخادم. حُفظت العملية بنفس معرّفها لمنع إنشاء طلب مكرر.', 'warning', {
            label: 'عرض العمليات', onPress: () => router.replace('/offline-queue')
          });
        }
        catch (queueError) {
          setError(queueError instanceof Error ? queueError.message : 'تعذر حفظ العملية للمزامنة.');
        }
      }
      else {
        if (e instanceof ApiError && e.status != null)
          operationIdRef.current = createMobileOperationId('mobile-request');
        setError(e instanceof Error ? e.message : 'تعذر إنشاء الطلب.');
      }
    }
    finally {
      setBusy(false);
    }
  };
  return <PageShell title="إنشاء طلب"><View style={{
    flexDirection: 'row', gap: spacing.sm
  }}>{([['SERVICE', 'خدمة'], ['PRODUCT', 'منتج'], ['RENTAL', 'تأجير']] as [
    Kind,
    string
  ][]).map(([v, l]) => <Pressable accessibilityRole="button" key={v} onPress={() => setType(v)} style={{
    flex: 1, minHeight: 48, justifyContent: 'center', padding: spacing.md, borderRadius: 14, backgroundColor: type === v ? colors.brand : colors.surface, borderWidth: 1, borderColor: type === v ? colors.brand : colors.border
  }}><Text style={{
    textAlign: 'center', color: type === v ? colors.white : colors.ink, fontWeight: fontWeights.bold
  }}>{l}</Text></Pressable>)}</View><Text tone="ink" strong>التصنيف</Text><View style={{
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm
  }}>{categories.map(c => <Pressable accessibilityRole="button" key={c.id} onPress={() => setCategoryId(c.id)} style={{
    minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.control, backgroundColor: categoryId === c.id ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: categoryId === c.id ? colors.brand : colors.border
  }}><Text style={{ color: colors.ink }}>{c.name}</Text></Pressable>)}</View>{!catLoading && categories.length === 0 ? <Notice tone="muted">لا توجد تصنيفات متاحة لهذا النوع أو تعذر تحميلها.</Notice> : null}<Field label="عنوان الطلب" value={title} onChangeText={setTitle} placeholder="مثال: أحتاج إلى إصلاح مكيف" maxLength={150}/><Field label="وصف الطلب" value={description} onChangeText={setDescription} multiline maxLength={1000} placeholder="اشرح المطلوب والمواصفات والموعد المتوقع…"/><Field label="المدينة (اختياري)" value={city} onChangeText={setCity} placeholder="المدينة"/><View style={{
    flexDirection: 'row', gap: 10
  }}><View style={{ flex: 1 }}><Field label="أقل ميزانية (شيكل)" value={min} onChangeText={(v) => setMin(normalizeNumericInput(v))} keyboardType="numeric" placeholder="اختياري"/></View><View style={{ flex: 1 }}><Field label="أعلى ميزانية (شيكل)" value={max} onChangeText={(v) => setMax(normalizeNumericInput(v))} keyboardType="numeric" placeholder="اختياري"/></View></View>{error ? <Notice>{error}</Notice> : null}<PrimaryButton label="نشر الطلب" onPress={() => void submit()} busy={busy}/></PageShell>;
}
