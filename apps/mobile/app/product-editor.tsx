import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { ErrorState, Field, LoadingState, PageShell } from '@/components/ui';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { addProductImages, createProduct, fetchProduct, fetchProductCategories, removeProductImage, updateProduct, type ProductCategory } from '@/features/commerce/commerce.api';
import { fontSizes, radius, spacing, fontWeights, sizes } from '@/theme/tokens';
import { enqueueOfflineCreate } from '@/storage/outbox-manager';
import { persistSelectedAdImage } from '@/storage/persist-ad-image';
import type { SelectedAdImage } from '@/features/ads/manage-ads.api';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { createMobileOperationId } from '@/lib/operation-id';
import { ApiError } from '@/api/client';
import { showToast } from '@/lib/toast';
import { COPY } from '@/lib/copy';
export default function ProductEditorScreen() {
    const { colors } = useAppTheme();
    const s = useMemo(() => createThemeS(colors), [colors]);
    const { accessToken, csrfToken, user } = useAuth();
    const operationIdRef = useRef(createMobileOperationId('mobile-product'));
    const [availability, setAvailability] = useState<'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK'>('IN_STOCK');
    const [stockDirty, setStockDirty] = useState(false);
    const { id } = useLocalSearchParams<{
        id?: string;
    }>();
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
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const cats = await fetchProductCategories();
            setCategories(cats);
            setCategoryId(current => current || cats[0]?.id || '');
            if (id) {
                const p = await fetchProduct(id);
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
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات النموذج.');
        }
        finally {
            setLoading(false);
        }
    }, [id]);
    useEffect(() => {
        void load();
    }, [load]);
    const submit = async () => {
        if (!accessToken) {
            pushOnce('/login');
            return;
        }
        if (!id && !user?.emailVerified) {
            showToast('البريد غير مؤكد', 'أكد بريدك الإلكتروني قبل نشر المنتج.', 'info');
            return;
        }
        const numericPrice = Number(normalizeNumericInput(price));
        const numericStock = stock.trim() === '' ? undefined : Number(normalizeNumericInput(stock));
        if (name.trim().length < 2 || description.trim().length < 10 || !categoryId || !Number.isFinite(numericPrice) || numericPrice <= 0 || (numericStock !== undefined && (!Number.isInteger(numericStock) || numericStock < 0))) {
            showToast('تحقق من البيانات', 'أدخل اسمًا من حرفين على الأقل، ووصفًا من 10 أحرف، وتصنيفًا وسعرًا صحيحًا.', 'info');
            return;
        }
        setSaving(true);
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
            const payload = {
                categoryId, name: name.trim(), description: description.trim(), price: numericPrice, availability, ...(stockDirty && numericStock !== undefined ? { stockQuantity: numericStock } : {})
            };
            if (id) {
                await updateProduct(id, payload, accessToken, csrfToken);
                for (const imageUrl of removedImages)
                    await removeProductImage(id, imageUrl, accessToken, csrfToken);
                if (selectedImages.length)
                    await addProductImages(id, selectedImages, accessToken, csrfToken);
                showToast('تم الحفظ', 'تم تحديث بيانات المنتج وصوره بنجاح.', 'success', {
                    label: 'عرض المنتجات', onPress: () => router.replace('/products')
                });
            }
            else {
                const opId = operationIdRef.current;
                const net = await NetInfo.fetch();
                if (net.isConnected !== true || net.isInternetReachable === false) {
                    if (!user?.id)
                        throw new Error('تعذر تحديد الحساب لحفظ المنتج دون اتصال.');
                    await enqueueOfflineCreate(String(user.id), opId, 'create-product', {
                        ...payload, images: selectedImages.map(image => ({
                            uri: image.uri, fileName: image.fileName, mimeType: image.mimeType
                        }))
                    });
                    showToast('حُفظ على الجهاز', 'لم يُنشر المنتج بعد. سيُرسل عند عودة الإنترنت، وقد يُرفض إذا لم يعد التصنيف أو المتجر متاحًا.', 'info', {
                        label: 'عرض العمليات', onPress: () => router.replace('/offline-queue')
                    });
                }
                else {
                    try {
                        await createProduct(payload, accessToken, csrfToken, opId, selectedImages);
                    }
                    catch (uploadError) {
                        if (uploadError instanceof ApiError && uploadError.status == null && user?.id) {
                            await enqueueOfflineCreate(String(user.id), opId, 'create-product', {
                                ...payload, images: selectedImages.map(image => ({
                                    uri: image.uri, fileName: image.fileName, mimeType: image.mimeType
                                }))
                            });
                            showToast('حُفظ للمزامنة', 'تعذر تأكيد الاستجابة من الخادم. حُفظت العملية بنفس المفتاح لتجنب تكرار المنتج.', 'warning', {
                                label: 'عرض العمليات', onPress: () => router.replace('/offline-queue')
                            });
                            return;
                        }
                        throw uploadError;
                    }
                    showToast('تم الحفظ', 'أُرسل المنتج إلى الخادم بنجاح.', 'success', {
                        label: 'عرض المنتجات', onPress: () => router.replace('/products')
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
