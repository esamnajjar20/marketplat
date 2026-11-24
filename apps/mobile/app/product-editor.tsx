import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { ErrorState, Field, LoadingState, Notice, PageShell } from '@/components/ui';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { onlineOnlyBlockReason } from '@/lib/offline-support';
import { StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { addProductImages, createProduct, fetchProduct, fetchProductCategories, fetchMyStore, fetchStoreTypeFields, removeProductImage, updateProduct, type ProductCategory, type ProductSummary, type StoreTypeFieldSummary } from '@/features/commerce/commerce.api';
import { fontSizes, radius, spacing, fontWeights, sizes } from '@/theme/tokens';
import { enqueueOfflineCreate } from '@/storage/outbox-manager';
import { persistSelectedAdImage } from '@/storage/persist-ad-image';
import type { SelectedAdImage } from '@/features/ads/manage-ads.api';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { createMobileOperationId } from '@/lib/operation-id';
import { fetchStore } from '@/features/commerce/commerce.api';
import { ApiError } from '@/api/client';
import { showToast } from '@/lib/toast';
import { saveEntityFormDraft, loadEntityFormDraft, clearEntityFormDraft } from '@/storage/entity-form-draft-store';
import { COPY } from '@/lib/copy';
export default function ProductEditorScreen() {
    const { colors } = useAppTheme();
    const s = useMemo(() => createThemeS(colors), [colors]);
    const { accessToken, csrfToken, user } = useAuth();
    const operationIdRef = useRef(createMobileOperationId('mobile-product'));
    const [availability, setAvailability] = useState<'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK'>('IN_STOCK');
    const [discountPrice, setDiscountPrice] = useState('');
    const [wholesalePrice, setWholesalePrice] = useState('');
    const [wholesaleMinQty, setWholesaleMinQty] = useState('');
    const [costPrice, setCostPrice] = useState('');
    const [storeTypeFields, setStoreTypeFields] = useState<StoreTypeFieldSummary[]>([]);
    const [storeTypeFieldsError, setStoreTypeFieldsError] = useState<string | null>(null);
    const [attributes, setAttributes] = useState<Record<string, string | number | boolean>>({});
    const [formReady, setFormReady] = useState(false);
    const [stockDirty, setStockDirty] = useState(false);
    const { id, storeId: routeStoreId } = useLocalSearchParams<{
        id?: string;
        storeId?: string | string[];
    }>();
    const storeId = Array.isArray(routeStoreId) ? routeStoreId[0] : routeStoreId;
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [categoryId, setCategoryId] = useState('');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [stock, setStock] = useState('');
    const [selectedImages, setSelectedImages] = useState<(SelectedAdImage & {
        sizeBytes: number;
    })[]>([]);
    const [existingImages, setExistingImages] = useState<string[]>([]);
    const [removedImages, setRemovedImages] = useState<string[]>([]);
    const [pickingImage, setPickingImage] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imageUpdateWarning, setImageUpdateWarning] = useState<string | null>(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setImageUpdateWarning(null);
        setFormReady(false);
        setStoreTypeFieldsError(null);
        try {
            const cats = await fetchProductCategories();
            setCategories(cats);
            setCategoryId(current => current || cats[0]?.id || '');
            let loadedProduct: ProductSummary | null = null;
            if (id) {
                const p = await fetchProduct(id);
                loadedProduct = p;
                setName(p.name);
                setDescription(p.description || '');
                setPrice(String(p.price));
                setStock(p.stockQuantity == null ? '' : String(p.stockQuantity));
                setStockDirty(false);
                setAvailability(p.availability === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : p.availability === 'LIMITED' ? 'LIMITED' : 'IN_STOCK');
                setExistingImages(p.images || []);
                setRemovedImages([]);
                setSelectedImages([]);
                setCategoryId(p.category?.id || cats[0]?.id || '');
                setDiscountPrice(p.discountPrice == null ? '' : String(p.discountPrice));
                setWholesalePrice(p.wholesalePrice == null ? '' : String(p.wholesalePrice));
                setWholesaleMinQty(p.wholesaleMinQty == null ? '' : String(p.wholesaleMinQty));
                setCostPrice(p.costPrice == null ? '' : String(p.costPrice));
                setAttributes((p.attributes || {}) as Record<string, string | number | boolean>);
            }
            try {
                const store = !id && accessToken
                    ? (storeId ? await fetchStore(storeId) : await fetchMyStore(accessToken))
                    : null;
                const typeId = loadedProduct?.store?.storeTypeId || store?.storeTypeId || '';
                const fields = typeId ? await fetchStoreTypeFields(typeId) : [];
                setStoreTypeFields(fields);
            } catch (fieldError) {
                setStoreTypeFields([]);
                setStoreTypeFieldsError(fieldError instanceof Error ? fieldError.message : 'تعذر تحميل خصائص نوع المتجر.');
            }
            if (user?.id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: replace with proper type
                const saved = await loadEntityFormDraft<Record<string, any>>(String(user.id), 'product-form', id || 'new').catch(() => null);
                const d = saved?.draft;
                if (d && d.version === 1) {
                    setName(typeof d.name === 'string' ? d.name : '');
                    setDescription(typeof d.description === 'string' ? d.description : '');
                    setPrice(typeof d.price === 'string' ? d.price : '');
                    setStock(typeof d.stock === 'string' ? d.stock : '');
                    setStockDirty(Boolean(d.stockDirty));
                    setCategoryId(typeof d.categoryId === 'string' ? d.categoryId : (cats[0]?.id || ''));
                    setAvailability(d.availability === 'LIMITED' || d.availability === 'OUT_OF_STOCK' ? d.availability : 'IN_STOCK');
                    setDiscountPrice(typeof d.discountPrice === 'string' ? d.discountPrice : '');
                    setWholesalePrice(typeof d.wholesalePrice === 'string' ? d.wholesalePrice : '');
                    setWholesaleMinQty(typeof d.wholesaleMinQty === 'string' ? d.wholesaleMinQty : '');
                    setCostPrice(typeof d.costPrice === 'string' ? d.costPrice : '');
                    setAttributes(d.attributes && typeof d.attributes === 'object' ? d.attributes : {});
                    setSelectedImages(Array.isArray(d.selectedImages) ? d.selectedImages : []);
                    setRemovedImages(Array.isArray(d.removedImages) ? d.removedImages : []);
                    if (Array.isArray(d.existingImages)) setExistingImages(d.existingImages);
                }
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات النموذج.');
        }
        finally {
            setLoading(false);
            setFormReady(true);
        }
    }, [id, accessToken, user?.id, storeId]);
    useEffect(() => {
        void load();
    }, [load]);
    useEffect(() => {
        if (!formReady || !user?.id) return;
        const timeout = setTimeout(() => {
            void saveEntityFormDraft(String(user.id), 'product-form', id || 'new', {
                version: 1, name, description, price, stock, stockDirty, categoryId, availability,
                discountPrice, wholesalePrice, wholesaleMinQty, costPrice, attributes,
                selectedImages, removedImages, existingImages,
            }).catch(() => undefined);
        }, 450);
        return () => clearTimeout(timeout);
    }, [formReady, user?.id, id, name, description, price, stock, stockDirty, categoryId, availability, discountPrice, wholesalePrice, wholesaleMinQty, costPrice, attributes, selectedImages, removedImages, existingImages]);
    const submit = async () => {
        if (!accessToken) {
            pushOnce('/login');
            return;
        }
        if (storeTypeFieldsError) {
            showToast('تعذر تحميل خصائص المتجر', 'أعد تحميل النموذج قبل الحفظ حتى لا تفقد الخصائص المطلوبة.', 'warning');
            return;
        }
        if (!id && !user?.emailVerified) {
            showToast('البريد غير مؤكد', 'أكد بريدك الإلكتروني قبل نشر المنتج.', 'info');
            return;
        }
        const numericPrice = Number(normalizeNumericInput(price));
        const numericStock = stock.trim() === '' ? null : Number(normalizeNumericInput(stock));
        const parseOptional = (value: string) => value.trim() === '' ? undefined : Number(normalizeNumericInput(value));
        const numericDiscount = parseOptional(discountPrice);
        const numericWholesale = parseOptional(wholesalePrice);
        const numericWholesaleMin = parseOptional(wholesaleMinQty);
        const numericCost = parseOptional(costPrice);
        const missingRequired = storeTypeFields.filter(field => field.required && (attributes[field.key] === undefined || attributes[field.key] === null || attributes[field.key] === ''));
        const invalidNumberAttr = storeTypeFields.some(field => field.type === 'NUMBER' && attributes[field.key] !== undefined && !Number.isFinite(Number(attributes[field.key])));
        if (name.trim().length < 2 || description.trim().length < 10 || !categoryId || !Number.isFinite(numericPrice) || numericPrice <= 0 || (numericStock !== null && (!Number.isInteger(numericStock) || numericStock < 0)) ||
            [numericDiscount, numericWholesale, numericWholesaleMin, numericCost].some(v => v !== undefined && !Number.isFinite(v)) ||
            (numericDiscount !== undefined && (numericDiscount <= 0 || numericDiscount >= numericPrice)) ||
            ((numericWholesale === undefined) !== (numericWholesaleMin === undefined)) ||
            (numericWholesale !== undefined && (numericWholesale <= 0 || numericWholesaleMin! < 1 || !Number.isInteger(numericWholesaleMin))) ||
            (numericCost !== undefined && numericCost < 0) || missingRequired.length > 0 || invalidNumberAttr) {
            showToast('تحقق من البيانات', missingRequired.length ? `أكمل الخصائص المطلوبة: ${missingRequired.map(f => f.labelAr || f.label || f.key).join('، ')}` : 'راجع السعر والخصم وسعر الجملة والكمية الدنيا والتكلفة والمخزون والخصائص.', 'info');
            return;
        }
        setSaving(true);
        setImageUpdateWarning(null);
        try {
            if (!id && selectedImages.length === 0) {
                showToast('الصورة مطلوبة', 'اختر صورة واحدة على الأقل للمنتج قبل حفظه.', 'info');
                return;
            }
            if (existingImages.length + selectedImages.length > 10) {
                showToast('عدد الصور', 'لا يمكن أن يتجاوز مجموع صور المنتج 10 صور.', 'error');
                return;
            }
            if (existingImages.length + selectedImages.length === 0) {
                showToast('الصورة مطلوبة', 'يجب أن يبقى للمنتج صورة واحدة على الأقل.', 'info');
                return;
            }
            const dynamicAttributes = Object.fromEntries(Object.entries(attributes).filter(([key, value]) => storeTypeFields.some(field => field.key === key) && value !== undefined && value !== '')) as Record<string, string | number | boolean>;
            const commonPayload = {
                categoryId, name: name.trim(), description: description.trim(), price: numericPrice, availability,
                ...(numericDiscount !== undefined ? { discountPrice: numericDiscount } : {}),
                ...(numericWholesale !== undefined ? { wholesalePrice: numericWholesale } : {}),
                ...(numericWholesaleMin !== undefined ? { wholesaleMinQty: numericWholesaleMin } : {}),
                ...(numericCost !== undefined ? { costPrice: numericCost } : {}),
                ...(Object.keys(dynamicAttributes).length ? { attributes: dynamicAttributes } : {}),
            };
            const updatePayload = { ...commonPayload, discountPrice: numericDiscount ?? null, wholesalePrice: numericWholesale ?? null, wholesaleMinQty: numericWholesaleMin ?? null, costPrice: numericCost ?? null, ...(stockDirty ? { stockQuantity: numericStock } : {}) };
            const createPayload = { ...commonPayload, ...(stockDirty && numericStock !== null ? { stockQuantity: numericStock } : {}) };
            if (id) {
                const blocked = await onlineOnlyBlockReason('edit-product');
                if (blocked) {
                    showToast(blocked.title, blocked.message, 'info');
                    return;
                }
                await updateProduct(id, updatePayload, accessToken, csrfToken);
                try {
                    for (const imageUrl of removedImages) await removeProductImage(id, imageUrl, accessToken, csrfToken);
                    if (selectedImages.length) await addProductImages(id, selectedImages, accessToken, csrfToken);
                } catch (imageError) {
                    // The data PATCH succeeded; image operations are separate requests.
                    // Refresh the server's authoritative image list and do not blindly
                    // replay local uploads because a timed-out upload may have succeeded.
                    const latest = await fetchProduct(id).catch(() => null);
                    if (latest) {
                        setExistingImages(Array.isArray(latest.images) ? latest.images : []);
                        setRemovedImages([]);
                        setSelectedImages([]);
                    }
                    const message = `تم حفظ بيانات المنتج، لكن تعذر تأكيد اكتمال تغييرات الصور. ${imageError instanceof Error ? imageError.message : 'حدث خطأ أثناء رفع الصور أو حذفها.'} حدّثنا قائمة الصور من الخادم إن أمكن؛ راجع الصور قبل إعادة اختيار الملفات حتى لا تتكرر صورة رُفعت بالفعل.`;
                    setImageUpdateWarning(message);
                    showToast('تم حفظ البيانات جزئيًا', 'تم تحديث بيانات المنتج، لكن تغييرات الصور تحتاج إلى مراجعة.', 'warning');
                    return;
                }
                if (user?.id) await clearEntityFormDraft(String(user.id), 'product-form', id).catch(() => undefined);
                showToast('تم الحفظ', 'تم تحديث بيانات المنتج وصوره بنجاح.', 'success', {
                    label: 'عرض المنتجات', onPress: () => router.replace(storeId ? { pathname: '/my-products', params: { storeId } } : '/products')
                });
            }
            else {
                const opId = operationIdRef.current;
                const net = await NetInfo.fetch();
                if (net.isConnected !== true || net.isInternetReachable === false) {
                    if (!user?.id)
                        throw new Error('تعذر تحديد الحساب لحفظ المنتج دون اتصال.');
                    await enqueueOfflineCreate(String(user.id), opId, 'create-product', {
                        ...createPayload, ...(storeId ? { storeId } : {}), images: selectedImages.map(image => ({
                            uri: image.uri, fileName: image.fileName, mimeType: image.mimeType
                        }))
                    });
                    if (user?.id) await clearEntityFormDraft(String(user.id), 'product-form', 'new').catch(() => undefined);
                    showToast('حُفظ على الجهاز', 'لم يُنشر المنتج بعد. سيُرسل عند عودة الإنترنت، وقد يُرفض إذا لم يعد التصنيف أو المتجر متاحًا.', 'info', {
                        label: 'عرض العمليات', onPress: () => router.replace('/offline-queue')
                    });
                }
                else {
                    try {
                        await createProduct(createPayload, accessToken, csrfToken, opId, selectedImages, storeId);
                    }
                    catch (uploadError) {
                        if (uploadError instanceof ApiError && uploadError.status == null && user?.id) {
                            await enqueueOfflineCreate(String(user.id), opId, 'create-product', {
                                ...createPayload, ...(storeId ? { storeId } : {}), images: selectedImages.map(image => ({
                                    uri: image.uri, fileName: image.fileName, mimeType: image.mimeType
                                }))
                            });
                            if (user?.id) await clearEntityFormDraft(String(user.id), 'product-form', 'new').catch(() => undefined);
                            showToast('حُفظ للمزامنة', 'تعذر تأكيد الاستجابة من الخادم. حُفظت العملية بنفس المفتاح لتجنب تكرار المنتج.', 'warning', {
                                label: 'عرض العمليات', onPress: () => router.replace('/offline-queue')
                            });
                            return;
                        }
                        throw uploadError;
                    }
                    if (user?.id) await clearEntityFormDraft(String(user.id), 'product-form', 'new').catch(() => undefined);
                    showToast('تم الحفظ', 'أُرسل المنتج إلى الخادم بنجاح.', 'success', {
                        label: 'عرض المنتجات', onPress: () => router.replace(storeId ? { pathname: '/my-products', params: { storeId } } : '/products')
                    });
                }
            }
        }
        catch (e) {
            if (!id && e instanceof ApiError && e.status != null)
                operationIdRef.current = createMobileOperationId('mobile-product');
            showToast('تعذر حفظ المنتج', e instanceof Error ? e.message : COPY.tryAgain, 'error');
        }
        finally {
            setSaving(false);
        }
    };
    return <PageShell title={id ? 'تعديل المنتج' : 'إضافة منتج'}><View style={s.content}>{loading ? <LoadingState message="جاري تحميل البيانات…"/> : error ? <ErrorState description={error} onAction={() => void load()}/> : <>
        <Field label="اسم المنتج" value={name} onChangeText={setName} maxLength={200} placeholder="مثال: هاتف مستعمل"/>
        <Field label="الوصف" value={description} onChangeText={setDescription} maxLength={2000} multiline placeholder="اكتب تفاصيل المنتج وحالته…"/>
        <Text style={s.label}>التصنيف</Text><View style={s.chips}>{categories.map(c => <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`تصنيف ${c.nameAr || c.name}`} accessibilityState={{ selected: categoryId === c.id }} onPress={() => setCategoryId(c.id)} style={[s.chip, categoryId === c.id && s.chipSelected]}><Text style={[s.chipText, categoryId === c.id && s.chipTextSelected]}>{c.nameAr || c.name}</Text></Pressable>)}</View>
        <Field label="السعر (شيكل)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00"/>
        <Text style={s.label}>التسعير المتقدم (اختياري)</Text>
        <Field label="سعر العرض (أقل من السعر الأساسي)" value={discountPrice} onChangeText={setDiscountPrice} keyboardType="decimal-pad" placeholder="اتركه فارغًا بدون خصم" />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}><View style={{ flex: 1 }}><Field label="سعر الجملة" value={wholesalePrice} onChangeText={setWholesalePrice} keyboardType="decimal-pad" placeholder="اختياري" /></View><View style={{ flex: 1 }}><Field label="أقل كمية للجملة" value={wholesaleMinQty} onChangeText={setWholesaleMinQty} keyboardType="number-pad" placeholder="مثال: 3" /></View></View>
        <Field label="تكلفة المنتج (للسجل الداخلي)" value={costPrice} onChangeText={setCostPrice} keyboardType="decimal-pad" placeholder="اختياري" />
        {storeTypeFieldsError ? <Notice tone="warning">{storeTypeFieldsError} أعد تحميل النموذج قبل الحفظ.</Notice> : null}
        {imageUpdateWarning ? <Notice tone="warning">{imageUpdateWarning}</Notice> : null}
        {storeTypeFields.length ? <><Text style={s.label}>خصائص نوع المتجر</Text>{storeTypeFields.map(field => <View key={field.key} style={{ gap: spacing.xs }}>
          <Text style={s.label}>{field.labelAr || field.label || field.key}{field.required ? ' *' : ''}</Text>
          {field.type === 'BOOLEAN' ? <View style={s.chips}>{[['true','نعم'],['false','لا']].map(([value,label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: attributes[field.key] === (value === 'true') }} onPress={() => setAttributes(current => ({ ...current, [field.key]: value === 'true' }))} style={[s.chip, attributes[field.key] === (value === 'true') && s.chipSelected]}><Text style={[s.chipText, attributes[field.key] === (value === 'true') && s.chipTextSelected]}>{label}</Text></Pressable>)}</View>
          : field.type === 'SELECT' && field.options?.length ? <View style={s.chips}>{field.options.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: attributes[field.key] === option.value }} onPress={() => setAttributes(current => ({ ...current, [field.key]: option.value }))} style={[s.chip, attributes[field.key] === option.value && s.chipSelected]}><Text style={[s.chipText, attributes[field.key] === option.value && s.chipTextSelected]}>{option.labelAr || option.label || option.value}</Text></Pressable>)}</View>
          : <Field label={field.type === 'NUMBER' ? 'قيمة رقمية' : 'القيمة'} value={attributes[field.key] === undefined ? '' : String(attributes[field.key])} onChangeText={value => setAttributes(current => ({ ...current, [field.key]: field.type === 'NUMBER' && value.trim() !== '' ? Number(normalizeNumericInput(value)) : value }))} keyboardType={field.type === 'NUMBER' ? 'decimal-pad' : 'default'} multiline={field.type === 'TEXTAREA'} placeholder={field.labelAr || field.label || field.key} />}
        </View>)}</> : null}
        <Field label="الكمية المتوفرة (اختياري)" value={stock} onChangeText={(value) => {
            setStockDirty(true);
            setStock(value);
        }} keyboardType="number-pad" placeholder="اتركه فارغًا إذا لم تستخدم المخزون"/>
        <Text style={s.label}>حالة التوفر</Text><View style={s.chips}>{([['IN_STOCK', 'متوفر'], ['LIMITED', 'كمية محدودة'], ['OUT_OF_STOCK', 'غير متوفر']] as const).map(([v, l]) => <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: availability === v }} onPress={() => setAvailability(v)} style={[s.chip, availability === v && s.chipSelected]}><Text style={[s.chipText, availability === v && s.chipTextSelected]}>{l}</Text></Pressable>)}</View>
        <Text style={s.label}>صور المنتج (حتى 10 صور)</Text>{existingImages.map((uri, index) => <View key={`${uri}-${index}`} style={{ gap: spacing.sm }}><AppImage uri={uri} style={{
            width: '100%', height: 170, borderRadius: radius.control
        }}/><Pressable accessibilityRole="button" onPress={() => {
            setExistingImages(current => current.filter((_, i) => i !== index));
            setRemovedImages(current => [...current, uri]);
        }} style={s.removeImage}><Text style={s.removeImageText}>إزالة هذه الصورة عند الحفظ</Text></Pressable></View>)}{selectedImages.map((image, index) => <View key={`${image.uri}-${index}`} style={{ gap: spacing.sm }}><AppImage uri={image.uri} style={{
            width: '100%', height: 170, borderRadius: radius.control
        }}/><Pressable accessibilityRole="button" onPress={() => setSelectedImages(current => current.filter((_, i) => i !== index))} style={s.removeImage}><Text style={s.removeImageText}>إزالة الصورة الجديدة</Text></Pressable></View>)}<Pressable accessibilityRole="button" disabled={pickingImage || existingImages.length + selectedImages.length >= 10} onPress={() => void (async () => {
            setPickingImage(true);
            try {
                const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!permission.granted)
                    throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(1, 10 - existingImages.length - selectedImages.length), allowsEditing: false, quality: 0.85
                });
                if (result.canceled || !result.assets.length)
                    return;
                if (existingImages.length + selectedImages.length + result.assets.length > 10)
                    throw new Error('لا يمكن أن يتجاوز مجموع الصور 10.');
                const saved = await Promise.all(result.assets.map(async (asset, index) => {
                    const mime = asset.mimeType || 'image/jpeg';
                    const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime;
                    if (!['image/jpeg', 'image/png', 'image/webp'].includes(normalized))
                        throw new Error('اختر صور JPEG أو PNG أو WebP.');
                    return persistSelectedAdImage({
                        uri: asset.uri, fileName: asset.fileName || `product-${Date.now()}-${index}.${normalized === 'image/png' ? 'png' : normalized === 'image/webp' ? 'webp' : 'jpg'}`, mimeType: normalized
                    });
                }));
                setSelectedImages(current => [...current, ...saved]);
            }
            catch (e) {
                showToast('تعذر اختيار الصور', e instanceof Error ? e.message : 'حاول مرة أخرى.', 'error');
            }
            finally {
                setPickingImage(false);
            }
        })()} style={s.primary}><Text style={s.primaryText}>{pickingImage ? 'جارٍ حفظ الصور…' : 'اختيار صور من الهاتف'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()} style={[s.primary, saving && s.disabled]}><Text style={s.primaryText}>{saving ? 'جاري الحفظ…' : id ? 'حفظ التعديلات' : 'إنشاء المنتج'}</Text></Pressable></>}</View></PageShell>;
}
const createThemeS = (colors: ColorPalette) => StyleSheet.create({
    content: { gap: spacing.md }, label: {
        fontSize: fontSizes[14], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right', marginTop: spacing.sm
    }, input: {
        minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.md, color: colors.ink, fontSize: fontSizes[15], writingDirection: 'rtl'
    }, multiline: { minHeight: 120 }, chips: {
        flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm
    }, chip: {
        minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.surface
    }, chipSelected: {
        backgroundColor: colors.brandSoft, borderColor: colors.brand
    }, chipText: {
        color: colors.ink, fontSize: fontSizes[13]
    }, chipTextSelected: {
        color: colors.brandOnSoft, fontWeight: fontWeights.bold
    }, primary: {
        minHeight: 52, backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md
    }, primaryText: {
        color: colors.onBrand, fontWeight: fontWeights.bold
    }, removeImage: {
        minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.danger, borderRadius: radius.sm
    }, removeImageText: {
        color: colors.danger, fontWeight: fontWeights.bold
    }, disabled: { opacity: .6 }, muted: {
        fontSize: fontSizes[13], color: colors.muted, textAlign: 'right'
    }
});
