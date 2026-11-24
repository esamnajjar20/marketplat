import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { Field, Notice, PageShell, PrimaryButton } from '@/components/ui';
import { fontSizes, spacing, fontWeights, radius, sizes } from '@/theme/tokens';
import { onlineOnlyBlockReason } from '@/lib/offline-support';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/api/client';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { enqueueOfflineCreate } from '@/storage/outbox-manager';
import { persistSelectedAdImage } from '@/storage/persist-ad-image';
import type { SelectedAdImage } from '@/features/ads/manage-ads.api';
import {
  createMyServiceListing,
  fetchPublicServiceTypes,
  fetchServiceCategoryOptions,
  fetchServiceListing,
  updateMyServiceListing,
  type PublicServiceTypeOption,
  type ServiceCategoryOption,
  type ServiceListing,
} from '@/features/services/services.api';
import { saveEntityFormDraft, loadEntityFormDraft, clearEntityFormDraft } from '@/storage/entity-form-draft-store';

type Location = 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE';
type Pricing = 'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE';
type LocalImage = SelectedAdImage & { sizeBytes: number };
type FormDraft = {
  version: 1; serviceTypeId: string; categoryId: string; title: string; description: string;
  pricingType: Pricing; price: string; duration: string; location: Location;
  status: 'ACTIVE' | 'PAUSED'; attributes: Record<string, unknown>; selectedImages: LocalImage[];
};

export default function ServiceEditorScreen() {
  const { colors } = useAppTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { accessToken, csrfToken, user } = useAuth();
  const operationIdRef = useRef(createMobileOperationId('mobile-service'));
  const [serviceTypes, setServiceTypes] = useState<PublicServiceTypeOption[]>([]);
  const [categories, setCategories] = useState<ServiceCategoryOption[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pricingType, setPricingType] = useState<Pricing>('NEGOTIABLE');
  const [price, setPrice] = useState('');
  const [selectedImages, setSelectedImages] = useState<LocalImage[]>([]);
  const [pickingImage, setPickingImage] = useState(false);
  const [duration, setDuration] = useState('');
  const [location, setLocation] = useState<Location>('AT_PROVIDER');
  const [status, setStatus] = useState<'ACTIVE' | 'PAUSED'>('ACTIVE');
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formReady, setFormReady] = useState(false);
  const [error, setError] = useState('');
  const selectedType = useMemo(() => serviceTypes.find(item => item.id === serviceTypeId) ?? null, [serviceTypes, serviceTypeId]);
  const listingFields = useMemo(() => (selectedType?.fields ?? []).filter(field => field.scope === 'LISTING' && field.isActive !== false), [selectedType]);
  const availableCategories = useMemo(() => {
    const byType = categories.filter(item => item.serviceTypeId === serviceTypeId);
    return byType.length ? byType : categories.filter(item => !item.serviceTypeId);
  }, [categories, serviceTypeId]);
  const allowedPricing = selectedType?.capabilities?.allowedPricingTypes?.length
    ? selectedType.capabilities.allowedPricingTypes
    : (['FIXED', 'STARTING_FROM', 'NEGOTIABLE'] as Pricing[]);
  const allowedLocations = selectedType?.capabilities?.allowedLocations?.length
    ? selectedType.capabilities.allowedLocations
    : (['AT_CUSTOMER', 'AT_PROVIDER', 'REMOTE'] as Location[]);

  const load = useCallback(async () => {
    setLoading(true); setFormReady(false); setError('');
    try {
      const [types, cats] = await Promise.all([fetchPublicServiceTypes(), fetchServiceCategoryOptions()]);
      setServiceTypes(types); setCategories(cats);
      let item: ServiceListing | null = null;
      if (id) item = await fetchServiceListing(id);
      const initialType = item?.serviceTypeId || item?.serviceType?.id || types[0]?.id || '';
      setServiceTypeId(initialType);
      const matching = cats.filter(category => category.serviceTypeId === initialType);
      setCategoryId(item?.category?.id || matching[0]?.id || cats.find(category => !category.serviceTypeId)?.id || '');
      if (item) {
        setTitle(item.title); setDescription(item.description || '');
        setPricingType(item.pricingType === 'FIXED' || item.pricingType === 'STARTING_FROM' ? item.pricingType : 'NEGOTIABLE');
        setPrice(item.price == null ? '' : String(item.price)); setDuration(item.durationEstimate || '');
        setLocation(item.serviceLocation === 'AT_CUSTOMER' || item.serviceLocation === 'REMOTE' ? item.serviceLocation : 'AT_PROVIDER');
        setStatus(item.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE');
        setAttributes((item.attributes || {}) as Record<string, unknown>);
      }
      if (user?.id) {
        const saved = await loadEntityFormDraft<FormDraft>(String(user.id), 'service-form', id || 'new').catch(() => null);
        const draft = saved?.draft;
        if (draft?.version === 1) {
          setServiceTypeId(draft.serviceTypeId || initialType); setCategoryId(draft.categoryId || item?.category?.id || '');
          setTitle(draft.title || ''); setDescription(draft.description || ''); setPricingType(draft.pricingType || 'NEGOTIABLE');
          setPrice(draft.price || ''); setDuration(draft.duration || ''); setLocation(draft.location || 'AT_PROVIDER');
          setStatus(draft.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'); setAttributes(draft.attributes || {});
          setSelectedImages(Array.isArray(draft.selectedImages) ? draft.selectedImages : []);
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل نموذج الخدمة.'); }
    finally { setLoading(false); setFormReady(true); }
  }, [id, user?.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!formReady || !user?.id) return;
    const draft: FormDraft = { version: 1, serviceTypeId, categoryId, title, description, pricingType, price, duration, location, status, attributes, selectedImages };
    const timeout = setTimeout(() => { void saveEntityFormDraft(String(user.id), 'service-form', id || 'new', draft).catch(() => undefined); }, 450);
    return () => clearTimeout(timeout);
  }, [formReady, user?.id, id, serviceTypeId, categoryId, title, description, pricingType, price, duration, location, status, attributes, selectedImages]);

  const setAttribute = (key: string, value: unknown) => setAttributes(current => ({ ...current, [key]: value }));
  const chooseServiceType = (nextId: string) => {
    setServiceTypeId(nextId); setAttributes({});
    const nextCategories = categories.filter(item => item.serviceTypeId === nextId);
    setCategoryId(nextCategories[0]?.id || categories.find(item => !item.serviceTypeId)?.id || '');
    const type = serviceTypes.find(item => item.id === nextId);
    const pricing = type?.capabilities?.allowedPricingTypes;
    const locations = type?.capabilities?.allowedLocations;
    if (pricing?.length && !pricing.includes(pricingType)) setPricingType(pricing[0]);
    if (locations?.length && !locations.includes(location)) setLocation(locations[0]);
  };

  const chooseImages = async () => {
    setPickingImage(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
      const room = Math.max(0, 10 - selectedImages.length);
      if (!room) throw new Error('وصلت إلى الحد الأقصى وهو 10 صور.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, allowsEditing: false, quality: 0.85 });
      if (result.canceled || !result.assets.length) return;
      const saved = await Promise.all(result.assets.map(async (asset, index) => {
        const mime = asset.mimeType || 'image/jpeg';
        const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(normalized)) throw new Error('اختر صور JPEG أو PNG أو WebP.');
        return persistSelectedAdImage({ uri: asset.uri, fileName: asset.fileName || `service-${Date.now()}-${index}.${normalized === 'image/png' ? 'png' : normalized === 'image/webp' ? 'webp' : 'jpg'}`, mimeType: normalized });
      }));
      setSelectedImages(current => [...current, ...saved].slice(0, 10));
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر اختيار الصور.'); }
    finally { setPickingImage(false); }
  };

  const submit = async () => {
    if (!accessToken) { pushOnce('/login'); return; }
    if (!user?.emailVerified) { setError('يجب تأكيد البريد الإلكتروني قبل نشر الخدمة.'); return; }
    if (!categoryId || title.trim().length < 3 || description.trim().length < 10) { setError('اختر تصنيفًا، واكتب عنوانًا من 3 أحرف ووصفًا من 10 أحرف على الأقل.'); return; }
    if (serviceTypes.length && !serviceTypeId) { setError('اختر مجال الخدمة أولًا.'); return; }
    if (!allowedPricing.includes(pricingType)) { setError('طريقة التسعير غير متاحة لهذا المجال.'); return; }
    if (!allowedLocations.includes(location)) { setError('مكان تقديم الخدمة غير متاح لهذا المجال.'); return; }
    const numericPrice = price.trim() ? Number(normalizeNumericInput(price)) : undefined;
    if (pricingType !== 'NEGOTIABLE' && (!Number.isFinite(numericPrice) || !numericPrice || numericPrice <= 0)) { setError('أدخل سعرًا صحيحًا أكبر من صفر.'); return; }
    const missing = listingFields.filter(field => field.required && (attributes[field.key] === undefined || attributes[field.key] === null || attributes[field.key] === '' || (Array.isArray(attributes[field.key]) && !(attributes[field.key] as unknown[]).length)));
    if (missing.length) { setError(`أكمل الخصائص المطلوبة: ${missing.map(field => field.labelAr || field.label || field.key).join('، ')}`); return; }
    const invalidField = listingFields.find(field => {
      const value = attributes[field.key];
      if (value === undefined || value === null || value === '') return false;
      if (field.type === 'NUMBER') return typeof value !== 'number' || !Number.isFinite(value);
      if (field.type === 'BOOLEAN') return typeof value !== 'boolean';
      if (field.type === 'TEXT' || field.type === 'TEXTAREA' || field.type === 'SELECT') return typeof value !== 'string' || (field.type === 'SELECT' && !!field.options?.length && !field.options.some(option => option.value === value));
      if (field.type === 'MULTI_SELECT') return !Array.isArray(value) || value.some(item => typeof item !== 'string' || (!!field.options?.length && !field.options.some(option => option.value === item)));
      return false;
    });
    if (invalidField) { setError(`تحقق من قيمة الخاصية: ${invalidField.labelAr || invalidField.label || invalidField.key}`); return; }
    if (!id && selectedImages.length === 0) { setError('اختر صورة واحدة على الأقل للخدمة.'); return; }
    if (selectedImages.length > 10) { setError('الحد الأقصى لصور الخدمة هو 10 صور.'); return; }
    const cleanAttributes = Object.fromEntries(Object.entries(attributes).filter(([key, value]) => listingFields.some(field => field.key === key) && value !== undefined && value !== ''));
    const payload = { serviceTypeId, categoryId, title: title.trim(), description: description.trim(), pricingType, ...(pricingType !== 'NEGOTIABLE' ? { price: numericPrice } : { price: null }), durationEstimate: duration.trim() || undefined, serviceLocation: location, attributes: cleanAttributes, ...(id ? { status } : {}) };
    setBusy(true); setError('');
    try {
      if (id) {
        const blocked = await onlineOnlyBlockReason('edit-service');
        if (blocked) { setError(blocked.message); return; }
        await updateMyServiceListing(id, payload, accessToken, csrfToken);
        if (user?.id) await clearEntityFormDraft(String(user.id), 'service-form', id).catch(() => undefined);
      } else {
        const opId = operationIdRef.current;
        const net = await NetInfo.fetch();
        if (net.isConnected !== true || net.isInternetReachable === false) {
          if (!user?.id) throw new Error('تعذر تحديد الحساب لحفظ الخدمة دون اتصال.');
          await enqueueOfflineCreate(String(user.id), opId, 'create-service', { ...payload, images: selectedImages.map(({ uri, fileName, mimeType }) => ({ uri, fileName, mimeType })) });
          if (user?.id) await clearEntityFormDraft(String(user.id), 'service-form', 'new').catch(() => undefined);
          router.replace('/offline-queue'); return;
        }
        try { await createMyServiceListing(payload, accessToken, csrfToken, opId, selectedImages); }
        catch (createError) {
          if (createError instanceof ApiError && createError.status == null && user?.id) {
            await enqueueOfflineCreate(String(user.id), opId, 'create-service', { ...payload, images: selectedImages.map(({ uri, fileName, mimeType }) => ({ uri, fileName, mimeType })) });
            await clearEntityFormDraft(String(user.id), 'service-form', 'new').catch(() => undefined);
            router.replace('/offline-queue'); return;
          }
          throw createError;
        }
        await clearEntityFormDraft(String(user.id), 'service-form', 'new').catch(() => undefined);
      }
      router.replace('/my-services');
    } catch (e) {
      if (!id && e instanceof ApiError && e.status != null) operationIdRef.current = createMobileOperationId('mobile-service');
      setError(e instanceof Error ? e.message : 'تعذر حفظ الخدمة.');
    } finally { setBusy(false); }
  };

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: sizes.touchTarget, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.control, backgroundColor: selected ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: selected ? colors.brand : colors.border }}><Text style={{ color: selected ? colors.brand : colors.ink, fontWeight: selected ? fontWeights.bold : fontWeights.normal }}>{label}</Text></Pressable>;

  return <PageShell title={id ? 'تعديل الخدمة' : 'إضافة خدمة'}>
    <Text style={{ textAlign: 'right', fontSize: fontSizes[12], lineHeight: 20, color: colors.muted }}>أكمل معلومات المجال والخصائص والتسعير ومكان تقديم الخدمة، ثم راجعها قبل الحفظ.</Text>
    {loading ? <Notice tone="muted">جارٍ تحميل البيانات…</Notice> : error && !categories.length ? <Notice>{error}</Notice> : <>
      <Text tone="ink" strong>مجال الخدمة</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{serviceTypes.map(type => chip(type.nameAr || type.name, serviceTypeId === type.id, () => chooseServiceType(type.id), type.id))}</View>
      {serviceTypes.length === 0 ? <Notice tone="muted">لم تُرجع الخدمة أنواعًا محددة؛ يمكن المتابعة بالتصنيفات المتاحة.</Notice> : null}
      <Text tone="ink" strong>التصنيف</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{availableCategories.map(category => chip(category.nameAr || category.name, categoryId === category.id, () => setCategoryId(category.id), category.id))}</View>
      <Field label="عنوان الخدمة" value={title} onChangeText={setTitle} maxLength={200} placeholder="مثال: صيانة أجهزة منزلية" />
      <Field label="وصف الخدمة" value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="اشرح الخدمة وما تتضمنه…" />
      {listingFields.length ? <><Text tone="ink" strong>خصائص المجال</Text>{listingFields.map(field => <View key={field.key} style={{ gap: spacing.xs }}>
        <Text tone="ink" strong>{field.labelAr || field.label || field.key}{field.required ? ' *' : ''}</Text>
        {field.type === 'BOOLEAN' ? <View style={{ flexDirection: 'row', gap: spacing.sm }}>{chip('نعم', attributes[field.key] === true, () => setAttribute(field.key, true), `${field.key}-yes`)}{chip('لا', attributes[field.key] === false, () => setAttribute(field.key, false), `${field.key}-no`)}</View>
          : field.type === 'SELECT' && field.options?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{field.options.map(option => chip(option.labelAr || option.label || option.value, attributes[field.key] === option.value, () => setAttribute(field.key, option.value), `${field.key}-${option.value}`))}</View>
          : field.type === 'MULTI_SELECT' && field.options?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{field.options.map(option => { const current = Array.isArray(attributes[field.key]) ? attributes[field.key] as string[] : []; const selected = current.includes(option.value); return chip(option.labelAr || option.label || option.value, selected, () => setAttribute(field.key, selected ? current.filter(value => value !== option.value) : [...current, option.value]), `${field.key}-${option.value}`); })}</View>
          : <Field label="القيمة" value={attributes[field.key] == null ? '' : String(attributes[field.key])} onChangeText={value => setAttribute(field.key, field.type === 'NUMBER' && value.trim() ? Number(normalizeNumericInput(value)) : value)} keyboardType={field.type === 'NUMBER' ? 'decimal-pad' : 'default'} multiline={field.type === 'TEXTAREA'} placeholder={field.labelAr || field.label || field.key} />}
      </View>)}</> : null}
      <Text tone="ink" strong>طريقة التسعير</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{allowedPricing.map(value => chip(value === 'NEGOTIABLE' ? 'قابل للتفاوض' : value === 'FIXED' ? 'سعر محدد' : 'يبدأ من', pricingType === value, () => setPricingType(value), value))}</View>
      {pricingType !== 'NEGOTIABLE' ? <Field label="السعر (شيكل)" value={price} onChangeText={value => setPrice(normalizeNumericInput(value))} keyboardType="decimal-pad" placeholder="0.00" /> : null}
      <Field label="مدة التنفيذ التقريبية (اختياري)" value={duration} onChangeText={setDuration} maxLength={100} placeholder="مثال: ساعتان" />
      <Text tone="ink" strong>مكان تقديم الخدمة</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{allowedLocations.map(value => chip(value === 'AT_CUSTOMER' ? 'عند العميل' : value === 'AT_PROVIDER' ? 'عند مقدم الخدمة' : 'عن بُعد', location === value, () => setLocation(value), value))}</View>
      {!id ? <><Text tone="ink" strong>صور الخدمة (من 1 إلى 10)</Text>{selectedImages.map((image, index) => <View key={`${image.uri}-${index}`} style={{ gap: spacing.xs }}><AppImage uri={image.uri} style={{ width: '100%', height: 170, borderRadius: radius.md, backgroundColor: colors.surface }} />{chip('إزالة الصورة', false, () => setSelectedImages(current => current.filter((_, i) => i !== index)), `remove-${index}`)}</View>)}<PrimaryButton label={pickingImage ? 'جارٍ حفظ الصور…' : `اختيار صور (${selectedImages.length}/10)`} variant="secondary" busy={pickingImage} disabled={selectedImages.length >= 10} onPress={() => void chooseImages()} /></> : <PrimaryButton label="إدارة صور الخدمة" variant="secondary" onPress={() => pushOnce({ pathname: '/service-images', params: { id } })} />}
      {id ? <Pressable accessibilityRole="button" onPress={() => setStatus(current => current === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}><Text tone="brand" strong>الحالة الحالية: {status === 'ACTIVE' ? 'نشطة' : 'متوقفة'} (اضغط للتغيير)</Text></Pressable> : null}
      {error ? <Notice>{error}</Notice> : null}
      <PrimaryButton label={id ? 'حفظ التعديلات' : 'نشر الخدمة'} onPress={() => void submit()} busy={busy} />
    </>}
  </PageShell>;
}
