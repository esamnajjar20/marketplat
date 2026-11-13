import { useAppTheme } from '@/theme/ThemeProvider';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { onlineOnlyBlockReason } from '@/lib/offline-support';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { createMyServiceListing, fetchServiceCategoryOptions, fetchServiceListing, updateMyServiceListing, type ServiceCategoryOption, type ServiceListing } from '@/features/services/services.api';
import { Field, Notice, PageShell, PrimaryButton } from '@/components/ui';
import { fontSizes, spacing, fontWeights, radius, sizes } from '@/theme/tokens';
import { enqueueOfflineCreate } from '@/storage/outbox-manager';
import { persistSelectedAdImage } from '@/storage/persist-ad-image';
import type { SelectedAdImage } from '@/features/ads/manage-ads.api';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { ApiError } from '@/api/client';
export default function ServiceEditorScreen() {
  const { colors } = useAppTheme();
  const operationIdRef = useRef(createMobileOperationId('mobile-service'));
  const { id } = useLocalSearchParams<{
    id?: string;
  }>();
  const { accessToken, csrfToken, user } = useAuth();
  const [categories, setCategories] = useState<ServiceCategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pricingType, setPricingType] = useState<'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE'>('NEGOTIABLE');
  const [price, setPrice] = useState('');
  const [selectedImage, setSelectedImage] = useState<(SelectedAdImage & {
    sizeBytes: number;
  }) | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [duration, setDuration] = useState('');
  const [location, setLocation] = useState<'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE'>('AT_PROVIDER');
  const [status, setStatus] = useState<'ACTIVE' | 'PAUSED'>('ACTIVE');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const cats = await fetchServiceCategoryOptions();
        if (!active)
          return;
        setCategories(cats);
        setCategoryId(cats[0]?.id || '');
        if (id) {
          const item: ServiceListing = await fetchServiceListing(id);
          if (!active)
            return;
          setTitle(item.title);
          setDescription(item.description || '');
          setCategoryId(item.category?.id || cats[0]?.id || '');
          setPricingType(item.pricingType === 'FIXED' ? 'FIXED' : item.pricingType === 'STARTING_FROM' ? 'STARTING_FROM' : 'NEGOTIABLE');
          setPrice(item.price == null ? '' : String(item.price));
          setDuration(item.durationEstimate || '');
          setLocation(item.serviceLocation === 'AT_CUSTOMER' || item.serviceLocation === 'REMOTE' ? item.serviceLocation : 'AT_PROVIDER');
          setStatus(item.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE');
        }
      }
      catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'تعذر تحميل نموذج الخدمة.');
      }
      finally {
        if (active)
          setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [id]);
  const submit = async () => {
    if (!accessToken) {
      pushOnce('/login');
      return;
    }
    if (!user?.emailVerified) {
      setError('يجب تأكيد البريد الإلكتروني قبل نشر الخدمة.');
      return;
    }
    if (!categoryId || title.trim().length < 3 || description.trim().length < 10) {
      setError('اختر تصنيفًا، واكتب عنوانًا من 3 أحرف ووصفًا من 10 أحرف على الأقل.');
      return;
    }
    const p = price.trim() ? Number(normalizeNumericInput(price)) : undefined;
    if (pricingType !== 'NEGOTIABLE' && (!Number.isFinite(p) || !p || p <= 0)) {
      setError('أدخل سعرًا صحيحًا أكبر من صفر.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (id) {
        const blocked = await onlineOnlyBlockReason('edit-service');
        if (blocked) {
          setError(blocked.message);
          return;
        }
        await updateMyServiceListing(id, {
          categoryId, title: title.trim(), description: description.trim(), pricingType, price: pricingType === 'NEGOTIABLE' ? null : p, durationEstimate: duration.trim() || null, serviceLocation: location, status
        }, accessToken, csrfToken);
      } else {
        if (!selectedImage) {
          setError('اختر صورة واحدة على الأقل للخدمة.');
          return;
        }
        const payload = {
          categoryId, title: title.trim(), description: description.trim(), pricingType, ...(pricingType !== 'NEGOTIABLE' && p ? { price: p } : {}), durationEstimate: duration.trim() || undefined, serviceLocation: location
        };
        const opId = operationIdRef.current;
        const net = await NetInfo.fetch();
        if (net.isConnected !== true || net.isInternetReachable === false) {
          if (!user?.id)
            throw new Error('تعذر تحديد الحساب لحفظ الخدمة دون اتصال.');
          await enqueueOfflineCreate(String(user.id), opId, 'create-service', {
            ...payload, images: [{
                uri: selectedImage.uri, fileName: selectedImage.fileName, mimeType: selectedImage.mimeType
              }]
          });
          router.replace('/offline-queue');
          return;
        }
        try {
          await createMyServiceListing(payload, accessToken, csrfToken, opId, [selectedImage]);
        }
        catch (createError) {
          if (createError instanceof ApiError && createError.status == null && user?.id) {
            await enqueueOfflineCreate(String(user.id), opId, 'create-service', {
              ...payload, images: [{
                  uri: selectedImage.uri, fileName: selectedImage.fileName, mimeType: selectedImage.mimeType
                }]
            });
            router.replace('/offline-queue');
            return;
          }
          throw createError;
        }
      }
      router.replace('/my-services');
    }
    catch (e) {
      if (!id && e instanceof ApiError && e.status != null)
        operationIdRef.current = createMobileOperationId('mobile-service');
      setError(e instanceof Error ? e.message : 'تعذر حفظ الخدمة.');
    }
    finally {
      setBusy(false);
    }
  };
  return <PageShell title={id ? 'تعديل الخدمة' : 'إضافة خدمة'}><Text style={{
    textAlign: 'right', fontSize: fontSizes[12], lineHeight: 20, color: colors.muted
  }}>أكمل المعلومات الأساسية والتسعير ومكان تقديم الخدمة، ثم راجعها قبل الحفظ.</Text>{loading ? <Notice tone="muted">جارٍ تحميل البيانات…</Notice> : <><Text tone="ink" strong>تصنيف الخدمة</Text><View style={{
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm
  }}>{categories.map(c => <Pressable accessibilityRole="button" key={c.id} onPress={() => setCategoryId(c.id)} style={{
    minHeight: sizes.touchTarget, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.control, backgroundColor: categoryId === c.id ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: categoryId === c.id ? colors.brand : colors.border
  }}><Text style={{ color: colors.ink }}>{c.nameAr || c.name}</Text></Pressable>)}</View>{!id ? <><Text tone="ink" strong>صورة الخدمة (مطلوبة)</Text>{selectedImage ? <AppImage uri={selectedImage.uri} style={{
    width: '100%', height: 210, borderRadius: radius.md, backgroundColor: colors.surface
  }}/> : null}<PrimaryButton label={pickingImage ? 'جارٍ حفظ الصورة…' : selectedImage ? 'تغيير صورة الخدمة' : 'اختيار صورة من الهاتف'} variant="secondary" busy={pickingImage} onPress={() => void (async () => {
    setPickingImage(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, quality: 0.85
      });
      if (result.canceled || !result.assets[0])
        return;
      const asset = result.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(normalized))
        throw new Error('اختر صورة JPEG أو PNG أو WebP.');
      const saved = await persistSelectedAdImage({
        uri: asset.uri, fileName: asset.fileName || `service-${Date.now()}.${normalized === 'image/png' ? 'png' : normalized === 'image/webp' ? 'webp' : 'jpg'}`, mimeType: normalized
      });
      setSelectedImage(saved);
    }
    catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر اختيار الصورة.');
    }
    finally {
      setPickingImage(false);
    }
  })()}/></> : null}<Field label="عنوان الخدمة" value={title} onChangeText={setTitle} maxLength={200} placeholder="مثال: صيانة أجهزة منزلية"/><Field label="وصف الخدمة" value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="اشرح الخدمة وما تتضمنه…"/><Text tone="ink" strong>طريقة التسعير</Text><View style={{
    flexDirection: 'row', gap: spacing.sm
  }}>{([['NEGOTIABLE', 'قابل للتفاوض'], ['FIXED', 'سعر محدد'], ['STARTING_FROM', 'يبدأ من']] as const).map(([v, l]) => <Pressable accessibilityRole="button" key={v} onPress={() => setPricingType(v)} style={{
    flex: 1, minHeight: 48, justifyContent: 'center', padding: spacing.md, borderRadius: radius.control, backgroundColor: pricingType === v ? colors.brand : colors.surface, borderWidth: 1, borderColor: pricingType === v ? colors.brand : colors.border
  }}><Text style={{
    textAlign: 'center', fontSize: fontSizes[12], color: pricingType === v ? colors.white : colors.ink, fontWeight: fontWeights.bold
  }}>{l}</Text></Pressable>)}</View>{pricingType !== 'NEGOTIABLE' ? <Field label="السعر (شيكل)" value={price} onChangeText={(v) => setPrice(normalizeNumericInput(v))} keyboardType="numeric" placeholder="0.00"/> : null}<Field label="مدة التنفيذ التقريبية (اختياري)" value={duration} onChangeText={setDuration} maxLength={100} placeholder="مثال: ساعتان"/><Text tone="ink" strong>مكان تقديم الخدمة</Text><View style={{
    flexDirection: 'row', gap: spacing.sm
  }}>{([['AT_CUSTOMER', 'عند العميل'], ['AT_PROVIDER', 'عند مقدم الخدمة'], ['REMOTE', 'عن بُعد']] as const).map(([v, l]) => <Pressable accessibilityRole="button" key={v} onPress={() => setLocation(v)} style={{
    flex: 1, minHeight: 48, justifyContent: 'center', padding: spacing.md, borderRadius: radius.control, backgroundColor: location === v ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: location === v ? colors.brand : colors.border
  }}><Text style={{
    textAlign: 'center', fontSize: fontSizes[11], color: colors.ink
  }}>{l}</Text></Pressable>)}</View>{id ? <Pressable accessibilityRole="button" onPress={() => setStatus(s => s === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}><Text tone="brand" strong>الحالة الحالية: {status === 'ACTIVE' ? 'نشطة' : 'متوقفة'} (اضغط للتغيير)</Text></Pressable> : null}</>}{id ? <PrimaryButton label="إدارة صور الخدمة" variant="secondary" onPress={() => pushOnce({
    pathname: '/service-images', params: { id }
  })}/> : null}{error ? <Notice>{error}</Notice> : null}<PrimaryButton label={id ? 'حفظ التعديلات' : 'نشر الخدمة'} onPress={() => void submit()} busy={busy}/></PageShell>;
}
