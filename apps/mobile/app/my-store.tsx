import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { invalidateNavigationCapabilities } from '@/lib/navigation-policy';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { EmptyState, ErrorState, LoadingState, PageShell } from '@/components/ui';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/api/client';
import { createStore, fetchMyStore, updateMyStore, uploadMyStoreImage, type StoreSummary } from '@/features/commerce/commerce.api';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { statusLabel } from '@/lib/status-labels';
import { normalizePickedImage } from '@/lib/normalize-image-asset';
import { showToast } from '@/lib/toast';
export default function MyStoreScreen() {
  const { colors } = useAppTheme();
  const s = useMemo(() => createThemeS(colors), [colors]);
  const { getAccessToken, csrfToken, user, isRestoring } = useAuth();
  const dirtyRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState<'logo' | 'cover' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (isRestoring)
      return;
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    if (!hasLoadedRef.current)
      setLoading(true);
    setError(null);
    try {
      const result = await fetchMyStore(token);
      setStore(result);
      if (result && !dirtyRef.current) {
        setName(result.name);
        setDescription(result.description || '');
        setCity(result.city || '');
        setAddress(result.address || '');
        setPhone(result.phone || '');
      }
    }
    catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setStore(null);
        setError(null);
      }
      else
        setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات المتجر.');
    }
    finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [getAccessToken, isRestoring]);
  useEffect(() => {
    void load();
  }, [load]);
  const submit = async () => {
    const token = getAccessToken();
    if (!token) {
      router.push('/login');
      return;
    }
    if (name.trim().length < 2 || description.trim().length < 10 || !city.trim() || phone.trim().length < 7) {
      showToast('تحقق من البيانات', 'اسم المتجر حرفان على الأقل، والوصف 10 أحرف، والمدينة مطلوبة، ورقم الهاتف 7 أرقام على الأقل.', 'info');
      return;
    }
    setSaving(true);
    try {
      const wasUpdate = !!store;
      const base = {
        name: name.trim(), description: description.trim(), city: city.trim(), phone: phone.trim()
      };
      const payload = wasUpdate ? {
        ...base, address: address.trim()
      } : address.trim() ? {
        ...base, address: address.trim()
      } : base;
      const result = wasUpdate ? await updateMyStore(payload, token, csrfToken) : await createStore(payload, token, csrfToken);
      setStore(result);
      if (!wasUpdate)
        invalidateNavigationCapabilities();
      dirtyRef.current = false;
      showToast('تم الحفظ', wasUpdate ? 'تم تحديث بيانات المتجر.' : 'تم إنشاء المتجر/إرسال طلبه بنجاح.', 'success');
    }
    catch (e) {
      showToast('تعذر حفظ المتجر', e instanceof Error ? e.message : 'حاول مرة أخرى.', 'error');
    }
    finally {
      setSaving(false);
    }
  };
  const chooseImage = async (kind: 'logo' | 'cover') => {
    const token = getAccessToken();
    if (!token)
      return router.push('/login');
    setImageBusy(kind);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast('إذن مطلوب', 'اسمح للتطبيق بالوصول إلى الصور لاختيار صورة المتجر.', 'info');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: kind === 'logo' ? [1, 1] : [16, 9], quality: .85
      });
      if (picked.canceled || !picked.assets[0])
        return;
      const asset = picked.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        showToast('الصورة كبيرة', 'اختر صورة بحجم 5 ميغابايت أو أقل.', 'info');
        return;
      }
      const updated = await uploadMyStoreImage(kind, normalizePickedImage(asset, `store-${kind}`), token, csrfToken);
      setStore(updated);
      showToast('تم التحديث', kind === 'logo' ? 'تم تحديث شعار المتجر.' : 'تم تحديث غلاف المتجر.', 'success');
    }
    catch (e) {
      showToast('تعذر رفع الصورة', e instanceof Error ? e.message : 'تحقق من الاتصال وحاول مجددًا.', 'error');
    }
    finally {
      setImageBusy(null);
    }
  };
  if (!user)
    return <PageShell title="إدارة متجري"><EmptyState title="سجّل الدخول لإدارة متجرك" description="بيانات المتجر ومظهره وأدوات إدارته" actionLabel="تسجيل الدخول" onAction={() => router.push('/login')}/></PageShell>;
  return <PageShell title="إدارة متجري"><View style={s.content}>
{loading ? <LoadingState message="جاري تحميل بيانات المتجر…"/> : error ? <ErrorState description={error} onAction={() => void load()}/> : <>
{store ? <><View style={s.images}>{store.coverImageUrl ? <AppImage uri={store.coverImageUrl} style={s.cover}/> : <View style={[s.cover, s.coverPlaceholder]}><Text style={s.glyph}>غلاف المتجر</Text></View>}<Pressable accessibilityRole="button" disabled={!!imageBusy} onPress={() => void chooseImage('cover')} style={s.imageButton}><Text style={s.imageButtonText}>{imageBusy === 'cover' ? 'جاري الرفع…' : 'تغيير الغلاف'}</Text></Pressable><View style={s.logoRow}>{store.logoUrl ? <AppImage uri={store.logoUrl} style={s.logo}/> : <View style={[s.logo, s.logoPlaceholder]}><Text style={s.glyph}>▣</Text></View>}<View style={s.logoText}><Text style={s.label}>شعار المتجر</Text><Text style={s.muted}>PNG أو JPEG أو WebP</Text></View><Pressable accessibilityRole="button" disabled={!!imageBusy} onPress={() => void chooseImage('logo')} style={s.imageButton}><Text style={s.imageButtonText}>{imageBusy === 'logo' ? 'جاري الرفع…' : 'تغيير الشعار'}</Text></Pressable></View></View>
<View style={s.sectionHeading}><Text style={s.sectionTitle}>إدارة المتجر</Text><Text style={s.muted}>حالة المتجر: {statusLabel(store.status)}</Text><Text style={s.muted}>اختر القسم الذي تريد العمل عليه</Text></View><View style={s.quickActions}><Pressable accessibilityRole="button" onPress={() => router.push('/my-store-analytics')} style={s.quickAction}><Text style={s.quickTitle}>إحصاءات المتجر</Text><Text style={s.muted}>الزيارات والمتابعون والمنتجات</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/my-products')} style={s.quickAction}><Text style={s.quickTitle}>منتجاتي</Text><Text style={s.muted}>إضافة المنتجات وتعديل المخزون والأسعار</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/seller-orders')} style={s.quickAction}><Text style={s.quickTitle}>طلبات متجري</Text><Text style={s.muted}>مراجعة طلبات الشراء وتحديث حالاتها</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/my-sales')} style={s.quickAction}><Text style={s.quickTitle}>مبيعاتي</Text><Text style={s.muted}>سجل المبيعات والإيرادات والمدفوعات المستحقة</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/store-collections')} style={s.quickAction}><Text style={s.quickTitle}>مجموعات المنتجات</Text><Text style={s.muted}>تنظيم المنتجات في مجموعات ظاهرة للزوار</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/store-promotions')} style={s.quickAction}><Text style={s.quickTitle}>العروض الترويجية</Text><Text style={s.muted}>إنشاء الخصومات وإدارة العروض</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/store-team')} style={s.quickAction}><Text style={s.quickTitle}>فريق المتجر</Text><Text style={s.muted}>دعوة الأعضاء وإدارة الصلاحيات</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/store-hours')} style={s.quickAction}><Text style={s.quickTitle}>ساعات العمل</Text><Text style={s.muted}>تحديد أوقات الفتح والإغلاق لكل يوم</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push(`/stores/${encodeURIComponent(store.id)}`)} style={s.quickAction}><Text style={s.quickTitle}>معاينة صفحة المتجر</Text><Text style={s.muted}>شاهد الصفحة كما يراها المشترون</Text></Pressable></View></> : <><Text style={s.note}>لا يوجد متجر باسمك حاليًا. يمكنك إنشاء متجر أو فتح المتاجر التي تعمل بها كعضو في الفريق.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/my-stores')} style={s.quickAction}><Text style={s.quickTitle}>المتاجر التي أعمل بها</Text><Text style={s.muted}>افتح المتاجر التي منحتك عضوية نشطة</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/store-invites')} style={s.quickAction}><Text style={s.quickTitle}>دعوات المتاجر</Text><Text style={s.muted}>راجع الدعوات المرسلة إلى حسابك</Text></Pressable></>}
<Text style={s.label}>اسم المتجر</Text><TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="اسم المتجر" value={name} onChangeText={(value) => {
      dirtyRef.current = true;
      setName(value);
    }} maxLength={100} style={s.input} textAlign="right" placeholder="اسم المتجر" placeholderTextColor={colors.muted}/><Text style={s.label}>وصف المتجر</Text><TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="وصف المتجر" value={description} onChangeText={(value) => {
      dirtyRef.current = true;
      setDescription(value);
    }} maxLength={2000} multiline style={[s.input, s.multiline]} textAlign="right" placeholder="عرّف العملاء بمتجرك" placeholderTextColor={colors.muted}/><Text style={s.muted}>{description.length}/2000</Text><Text style={s.label}>المدينة</Text><TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="مدينة المتجر" value={city} onChangeText={(value) => {
      dirtyRef.current = true;
      setCity(value);
    }} maxLength={100} style={s.input} textAlign="right" placeholder="المدينة" placeholderTextColor={colors.muted}/><Text style={s.label}>العنوان (اختياري)</Text><TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="عنوان المتجر" value={address} onChangeText={(value) => {
      dirtyRef.current = true;
      setAddress(value);
    }} maxLength={200} style={s.input} textAlign="right" placeholder="العنوان" placeholderTextColor={colors.muted}/><Text style={s.label}>رقم الهاتف</Text><TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="رقم التواصل للمتجر" value={phone} onChangeText={(value) => {
      dirtyRef.current = true;
      setPhone(normalizeNumericInput(value));
    }} maxLength={20} keyboardType="phone-pad" style={s.input} textAlign="right" placeholder="رقم التواصل" placeholderTextColor={colors.muted}/><Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()} style={[s.primary, saving && s.disabled]}><Text style={s.primaryText}>{saving ? 'جاري الحفظ…' : store ? 'حفظ التعديلات' : 'إنشاء المتجر'}</Text></Pressable>
</>}</View></PageShell>;
}
const createThemeS = (colors: ColorPalette) => StyleSheet.create({
  content: { gap: spacing.md }, sectionHeading: {
    gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.xs
  }, sectionTitle: {
    fontSize: fontSizes[17], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right'
  }, note: {
    fontSize: fontSizes[13], color: colors.muted, textAlign: 'right', lineHeight: 21
  }, label: {
    fontSize: fontSizes[14], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right', marginTop: spacing.sm
  }, input: {
    minHeight: 50, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.ink, fontSize: fontSizes[15], writingDirection: 'rtl'
  }, multiline: {
    minHeight: 110, textAlignVertical: 'top'
  }, primary: {
    backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md
  }, primaryText: {
    color: colors.onBrand, fontWeight: fontWeights.bold
  }, disabled: { opacity: .6 }, muted: {
    fontSize: fontSizes[13], color: colors.muted, textAlign: 'right', lineHeight: 20
  }, images: {
    gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md
  }, cover: {
    width: '100%', height: 130, borderRadius: radius.md, backgroundColor: colors.border
  }, coverPlaceholder: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft
  }, glyph: {
    color: colors.brandOnSoft, fontWeight: fontWeights.bold
  }, imageButton: {
    backgroundColor: colors.brandSoft, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, alignItems: 'center'
  }, imageButtonText: {
    color: colors.brandOnSoft, fontWeight: fontWeights.bold, fontSize: fontSizes[12]
  }, logoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm
  }, logo: {
    width: 58, height: 58, borderRadius: 16, backgroundColor: colors.border
  }, logoPlaceholder: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft
  }, logoText: {
    flex: 1, alignItems: 'flex-end', gap: spacing.xs
  }, quickActions: { gap: spacing.sm }, quickAction: {
    padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, gap: 6, shadowColor: colors.ink, shadowOpacity: .035, shadowRadius: 8, shadowOffset: {
      width: 0, height: 2
    }, elevation: 1
  }, quickTitle: {
    fontSize: fontSizes[14], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right'
  }
});
