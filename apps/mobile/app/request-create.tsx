import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { Field, Notice, PageShell, PrimaryButton } from '@/components/ui';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/api/client';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { createMarketplaceRequest, fetchRequestCategories, uploadRequestImages, type RequestImageUpload } from '@/features/requests/requests.api';
import { enqueueMarketplaceRequest } from '@/storage/outbox-manager';
import { persistSelectedAdImage } from '@/storage/persist-ad-image';
import { saveEntityFormDraft, loadEntityFormDraft, clearEntityFormDraft } from '@/storage/entity-form-draft-store';
import { showToast } from '@/lib/toast';
import { fontWeights, spacing, radius, sizes } from '@/theme/tokens';

type Kind = 'SERVICE' | 'PRODUCT' | 'RENTAL';
type LocalImage = RequestImageUpload & { sizeBytes: number };
type RequestDraft = { version: 1; type: Kind; categoryId: string; title: string; description: string; city: string; min: string; max: string; expiresInDays: string; images: LocalImage[] };

export default function RequestCreateScreen() {
  const { colors } = useAppTheme();
  const { accessToken, csrfToken, user } = useAuth();
  const operationIdRef = useRef(createMobileOperationId('mobile-request'));
  const restoredRef = useRef(false);
  const [type, setType] = useState<Kind>('SERVICE');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [catLoading, setCatLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [images, setImages] = useState<LocalImage[]>([]);
  const [pickingImages, setPickingImages] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setCatLoading(true);
    void fetchRequestCategories(type).then(items => {
      if (active) { setCategories(items); setCategoryId(current => current || items[0]?.id || ''); }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل التصنيفات.'); })
      .finally(() => { if (active) setCatLoading(false); });
    return () => { active = false; };
  }, [type]);

  useEffect(() => {
    if (!user?.id || restoredRef.current) { if (!user?.id) setFormReady(true); return; }
    let active = true;
    void loadEntityFormDraft<RequestDraft>(String(user.id), 'request-form', 'new').then(saved => {
      if (!active) return;
      const d = saved?.draft;
      if (d?.version === 1) {
        setType(d.type); setCategoryId(d.categoryId); setTitle(d.title); setDescription(d.description);
        setCity(d.city); setMin(d.min); setMax(d.max); setExpiresInDays(d.expiresInDays || '7');
        setImages(Array.isArray(d.images) ? d.images : []);
      }
    }).catch(() => undefined).finally(() => { if (active) { restoredRef.current = true; setFormReady(true); } });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!formReady || !user?.id) return;
    const draft: RequestDraft = { version: 1, type, categoryId, title, description, city, min, max, expiresInDays, images };
    const timeout = setTimeout(() => { void saveEntityFormDraft(String(user.id), 'request-form', 'new', draft).catch(() => undefined); }, 450);
    return () => clearTimeout(timeout);
  }, [formReady, user?.id, type, categoryId, title, description, city, min, max, expiresInDays, images]);

  const chooseImages = async () => {
    setPickingImages(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
      const remaining = 5 - images.length;
      if (remaining <= 0) throw new Error('يمكن إرفاق خمس صور كحد أقصى.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, allowsEditing: false, quality: 0.85 });
      if (result.canceled || !result.assets.length) return;
      const saved = await Promise.all(result.assets.map(async (asset, index) => {
        const raw = asset.mimeType || 'image/jpeg'; const mimeType = raw === 'image/jpg' ? 'image/jpeg' : raw;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('اختر صور JPEG أو PNG أو WebP.');
        return persistSelectedAdImage({ uri: asset.uri, fileName: asset.fileName || `request-${Date.now()}-${index}.${mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'}`, mimeType });
      }));
      setImages(current => [...current, ...saved].slice(0, 5));
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر اختيار الصور.'); }
    finally { setPickingImages(false); }
  };

  const submit = async () => {
    if (!accessToken) { pushOnce('/login'); return; }
    if (!user?.emailVerified) { setError('يجب تأكيد البريد الإلكتروني قبل إنشاء طلب.'); return; }
    if (!categoryId) { setError('اختر تصنيفًا صالحًا من القائمة.'); return; }
    if (title.trim().length < 5 || description.trim().length < 10) { setError('العنوان 5 أحرف على الأقل والوصف 10 أحرف على الأقل.'); return; }
    const a = min.trim() ? Number(normalizeNumericInput(min)) : undefined;
    const b = max.trim() ? Number(normalizeNumericInput(max)) : undefined;
    const expiry = Number(normalizeNumericInput(expiresInDays));
    if ((a !== undefined && (!Number.isFinite(a) || a < 0)) || (b !== undefined && (!Number.isFinite(b) || b <= 0)) || (a !== undefined && b !== undefined && a > b)) { setError('تحقق من نطاق الميزانية.'); return; }
    if (!Number.isInteger(expiry) || expiry < 1 || expiry > 60) { setError('مدة صلاحية الطلب يجب أن تكون بين يوم و60 يومًا.'); return; }
    setBusy(true); setError('');
    const payload = { type, categoryId, title: title.trim(), description: description.trim(), city: city.trim() || undefined, budgetMin: a, budgetMax: b, expiresInDays: expiry };
    try {
      const network = await NetInfo.fetch();
      const online = network.isConnected === true && network.isInternetReachable !== false;
      if (!online) {
        await enqueueMarketplaceRequest(String(user.id), operationIdRef.current, { ...payload, images: images.map(({ uri, fileName, mimeType }) => ({ uri, fileName, mimeType })) });
        await clearEntityFormDraft(String(user.id), 'request-form', 'new').catch(() => undefined);
        showToast('حُفظ الطلب للمزامنة', 'لم يُنشر الطلب على الخادم بعد. سيُرسل عند عودة الاتصال وتوفر جلسة الدخول بالحساب نفسه.', 'info', { label: 'عرض العمليات', onPress: () => router.replace('/offline-queue') });
        return;
      }
      let attachedImages: string[] = [];
      if (images.length) attachedImages = await uploadRequestImages(images, accessToken, csrfToken);
      try {
        const item = await createMarketplaceRequest({ ...payload, ...(attachedImages.length ? { attachedImages } : {}) }, accessToken, csrfToken, operationIdRef.current);
        await clearEntityFormDraft(String(user.id), 'request-form', 'new').catch(() => undefined);
        router.replace({ pathname: '/requests/[id]', params: { id: item.id } });
      } catch (e) {
        if (e instanceof ApiError && e.status == null && user?.id) {
          await enqueueMarketplaceRequest(String(user.id), operationIdRef.current, { ...payload, ...(attachedImages.length ? { attachedImages } : {}), ...(!attachedImages.length && images.length ? { images: images.map(({ uri, fileName, mimeType }) => ({ uri, fileName, mimeType })) } : {}) });
          await clearEntityFormDraft(String(user.id), 'request-form', 'new').catch(() => undefined);
          showToast('حُفظ الطلب للمزامنة', 'انقطع الاتصال قبل تأكيد الخادم. حُفظت العملية بالمعرّف نفسه لتجنب التكرار.', 'warning', { label: 'عرض العمليات', onPress: () => router.replace('/offline-queue') });
        } else {
          if (e instanceof ApiError && e.status != null) operationIdRef.current = createMobileOperationId('mobile-request');
          throw e;
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إنشاء الطلب.'); }
    finally { setBusy(false); }
  };

  const chipStyle = (active: boolean) => ({ minHeight: sizes.touchTarget, justifyContent: 'center' as const, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.control, backgroundColor: active ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: active ? colors.brand : colors.border });
  return <PageShell title="إنشاء طلب">
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>{([['SERVICE', 'خدمة'], ['PRODUCT', 'منتج'], ['RENTAL', 'تأجير']] as [Kind, string][]).map(([value, label]) => <Pressable accessibilityRole="button" key={value} accessibilityState={{ selected: type === value }} onPress={() => { setType(value); setCategoryId(''); }} style={{ flex: 1, ...chipStyle(type === value) }}><Text style={{ textAlign: 'center', color: type === value ? colors.brand : colors.ink, fontWeight: fontWeights.bold }}>{label}</Text></Pressable>)}</View>
    <Text tone="ink" strong>التصنيف</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{categories.map(category => <Pressable accessibilityRole="button" key={category.id} accessibilityState={{ selected: categoryId === category.id }} onPress={() => setCategoryId(category.id)} style={chipStyle(categoryId === category.id)}><Text style={{ color: colors.ink }}>{category.name}</Text></Pressable>)}</View>
    {!catLoading && categories.length === 0 ? <Notice tone="muted">لا توجد تصنيفات متاحة لهذا النوع أو تعذر تحميلها.</Notice> : null}
    <Field label="عنوان الطلب" value={title} onChangeText={setTitle} placeholder="مثال: أحتاج إلى إصلاح مكيف" maxLength={150} />
    <Field label="وصف الطلب" value={description} onChangeText={setDescription} multiline maxLength={1000} placeholder="اشرح المطلوب والمواصفات والموعد المتوقع…" />
    <Field label="المدينة (اختياري)" value={city} onChangeText={setCity} placeholder="المدينة" />
    <View style={{ flexDirection: 'row', gap: spacing.md }}><View style={{ flex: 1 }}><Field label="أقل ميزانية (شيكل)" value={min} onChangeText={value => setMin(normalizeNumericInput(value))} keyboardType="numeric" placeholder="اختياري" /></View><View style={{ flex: 1 }}><Field label="أعلى ميزانية (شيكل)" value={max} onChangeText={value => setMax(normalizeNumericInput(value))} keyboardType="numeric" placeholder="اختياري" /></View></View>
    <Text tone="ink" strong>مدة ظهور الطلب</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{[7, 14, 30, 60].map(days => <Pressable accessibilityRole="button" key={days} accessibilityState={{ selected: expiresInDays === String(days) }} onPress={() => setExpiresInDays(String(days))} style={chipStyle(expiresInDays === String(days))}><Text style={{ color: colors.ink }}>{days} أيام</Text></Pressable>)}</View>
    <Text tone="ink" strong>صور مرفقة (اختياري، حتى 5)</Text>{images.map((image, index) => <View key={`${image.uri}-${index}`} style={{ gap: spacing.xs }}><AppImage uri={image.uri} style={{ width: '100%', height: 150, borderRadius: radius.md, backgroundColor: colors.surface }} /><Pressable accessibilityRole="button" onPress={() => setImages(current => current.filter((_, i) => i !== index))} style={chipStyle(false)}><Text tone="danger">إزالة الصورة</Text></Pressable></View>)}<PrimaryButton label={pickingImages ? 'جارٍ حفظ الصور…' : `اختيار صور (${images.length}/5)`} variant="secondary" busy={pickingImages} disabled={images.length >= 5} onPress={() => void chooseImages()} />
    {error ? <Notice>{error}</Notice> : null}
    <PrimaryButton label="نشر الطلب" onPress={() => void submit()} busy={busy} />
  </PageShell>;
}
