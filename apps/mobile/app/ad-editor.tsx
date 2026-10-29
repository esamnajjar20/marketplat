import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { fetchAdDetail } from '@/features/ads/ads.api';
import { createAd, updateAd, removeAdImage, reorderAdImages, PartialAdUpdateError, type AdDraft, type SelectedAdImage } from '@/features/ads/manage-ads.api';
import type { PublicCategory } from '@/features/categories/categories.api';
import { useAdEditorCategories } from '@/features/ads/useAdEditorCategories';
import { useAuth } from '@/features/auth/AuthContext';
import { cleanupStaleUnreferencedAdImages, persistSelectedAdImage, removePersistedAdImageIfUnused } from '@/storage/persist-ad-image';
import { clearAdDraft, loadAdDraft, saveAdDraft, clearAdEditDraft, loadAdEditDraft, saveAdEditDraft } from '@/storage/ad-draft-store';
import { enqueueMutation } from '@/storage/mutation-outbox';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { adEditorSchema, validate } from '@/lib/validation';
import { AppHeader, Field, Notice, PrimaryButton, LoadingState, SectionCard } from '@/components/MobileUI';

const emptyDraft: AdDraft = { title: '', description: '', price: '', city: '', categoryId: '', isNegotiable: false, images: [] };
export default function AdEditorScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { accessToken, csrfToken, user } = useAuth();
  const [draft, setDraft] = useState<AdDraft>(emptyDraft);
  const [originalImages, setOriginalImages] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { categories, categoriesError } = useAdEditorCategories();
  const [pickingImages, setPickingImages] = useState(false);
  const [draftCompleted, setDraftCompleted] = useState(false);
  const [draftOwnerReady, setDraftOwnerReady] = useState<string | null>(null);
  // Reclaim only old, unreferenced files; this never blocks editing or network work.
  useEffect(() => { void cleanupStaleUnreferencedAdImages().catch(() => undefined); }, []);
  // New-ad drafts are scoped by account and restored from SQLite after app restart.
  useEffect(() => {
    let active = true;
    if (id || !user?.id) { setDraftOwnerReady(null); return () => { active = false; }; }
    const ownerId = String(user.id);
    setDraftOwnerReady(null);
    setDraft(emptyDraft);
    void loadAdDraft(ownerId).then((saved) => {
      if (!active) return;
      setDraft(saved?.draft ?? emptyDraft);
      setDraftOwnerReady(ownerId);
    }).catch(() => {
      if (!active) return;
      setError('تعذر استعادة المسودة المحفوظة. يمكنك متابعة الكتابة وحفظها مجددًا.');
      setDraftOwnerReady(ownerId);
    });
    return () => { active = false; };
  }, [id, user?.id]);

  useEffect(() => {
    const ownerId = user?.id ? String(user.id) : null;
    if (id || !ownerId || draftOwnerReady !== ownerId || draftCompleted) return;
    let active = true;
    const handle = setTimeout(() => {
      void saveAdDraft(ownerId, draft).then(async (removedUris) => {
        // The new draft is committed before cleanup checks all draft/outbox references.
        for (const uri of removedUris) {
          await removePersistedAdImageIfUnused(uri).catch(() => undefined);
        }
      }).catch(() => {
        if (active) setError('تعذر حفظ المسودة محليًا؛ تحقق من مساحة التخزين ثم حاول مجددًا.');
      });
    }, 450);
    return () => { active = false; clearTimeout(handle); };
  }, [id, user?.id, draft, draftCompleted, draftOwnerReady]);
  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };
    if (!accessToken) { setError('انتهت جلسة الدخول؛ سجّل الدخول مجددًا.'); setLoading(false); return () => { active = false; }; }
    fetchAdDetail(id).then(async (ad) => {
      if (!active) return;
      const baseDraft: AdDraft = { title: ad.title, description: ad.description || '', price: ad.price == null ? '' : String(ad.price), city: ad.city || '', categoryId: ad.category?.id || '', isNegotiable: Boolean(ad.isNegotiable), images: [] };
      setOriginalImages(Array.isArray(ad.images) ? ad.images.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url)) : []);
      setExistingImages(Array.isArray(ad.images) ? ad.images.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url)) : []);
      const savedEdit = user?.id ? await loadAdEditDraft(String(user.id), String(id)).catch(() => null) : null;
      if (active) setDraft(savedEdit?.draft ?? baseDraft);
      if (active && savedEdit) setError('استُعيدت مسودة تعديل محفوظة على الجهاز. لم تُرسل إلى الخادم بعد.');
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل الإعلان للتعديل.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, accessToken, user?.id]);

  useEffect(() => {
    const ownerId = user?.id ? String(user.id) : null;
    if (!id || !ownerId || loading || draftCompleted) return;
    const handle = setTimeout(() => {
      void saveAdEditDraft(ownerId, String(id), draft).catch(() => setError('تعذر حفظ مسودة التعديل محليًا؛ انسخ التغييرات المهمة قبل إغلاق الشاشة.'));
    }, 450);
    return () => clearTimeout(handle);
  }, [id, user?.id, draft, loading, draftCompleted]);

  const set = (key: keyof AdDraft, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!accessToken) { Alert.alert('يلزم تسجيل الدخول', 'سجّل الدخول ثم حاول مجددًا.'); return; }
        if (!id && draft.images.length === 0) { setError('أضف صورة واحدة على الأقل للإعلان.'); return; }
    const checked = validate(adEditorSchema, {
      title: draft.title,
      description: draft.description,
      city: draft.city,
      price: draft.price,
      categoryId: draft.categoryId,
    });
    if (!checked.ok) { setError(checked.message); return; }
    setSaving(true); setError(null);
    try {
      if (id) {
        const network = await NetInfo.fetch();
        if (network.isConnected !== true || network.isInternetReachable === false) {
          const imagesChanged = existingImages.length !== originalImages.length || existingImages.some((url, index) => originalImages[index] !== url);
          if (imagesChanged) throw new Error('إدارة الصور الحالية تتطلب اتصالًا بالإنترنت. لم تُحفظ تغييرات الصور؛ أعد الاتصال ثم حاول.');
          if (!user?.id) throw new Error('يلزم تسجيل الدخول لحفظ تعديل محلي مرتبط بحسابك.');
          // Persisted image URIs are included in the same durable outbox payload.
          // The worker replays field updates first, then appends images with the same
          // operation ID; the API's image-operation ledger makes that append replay-safe.
          const operationId = `offline-update:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
          await saveAdEditDraft(String(user.id), String(id), draft);
          await enqueueMutation({
            ownerId: String(user.id),
            id: operationId,
            operation: 'update-ad',
            resourceId: String(id),
            idempotencyKey: operationId,
            payload: {
              title: draft.title.trim(), description: draft.description.trim(), city: draft.city.trim(),
              price: draft.price.trim() ? Number(draft.price) : null,
              categoryId: draft.categoryId.trim() || null,
              isNegotiable: draft.isNegotiable,
              ...(draft.images.length > 0 ? { images: draft.images.map((image) => ({
                uri: image.uri, name: image.fileName, type: image.mimeType,
                ...(typeof (image as SelectedAdImage & { sizeBytes?: number }).sizeBytes === 'number'
                  ? { sizeBytes: (image as SelectedAdImage & { sizeBytes?: number }).sizeBytes } : {}),
              })) } : {}),
            },
          });
          setDraftCompleted(true);
          await clearAdEditDraft(String(user.id), String(id)).catch(() => false);
          Alert.alert('حُفظ التعديل للمزامنة', 'لم يُحدّث الإعلان على الخادم بعد. سيُرسل تعديل الحقول ثم يرفع الصور المحفوظة عند عودة الإنترنت وتوفر جلسة دخول صالحة.', [
            { text: 'عرض العمليات', onPress: () => router.replace('/offline-queue') },
            { text: 'لاحقًا', onPress: () => router.replace('/my-ads') },
          ]);
          return;
        }
        const imagesChanged = existingImages.length !== originalImages.length || existingImages.some((url, index) => originalImages[index] !== url);
        let updated = await updateAd(id, draft, accessToken, csrfToken);
        if (imagesChanged) {
          // Fields PATCH already succeeded. Image operations can fail independently.
          // Wrap each failure in PartialAdUpdateError so the catch block syncs local state
          // to server truth (prevents repeat-removal retries on already-removed images).
          const fieldsUpdated = updated;
          let lastServerState = fieldsUpdated;
          const removed = originalImages.filter((url) => !existingImages.includes(url));
          for (const imageUrl of removed) {
            try { updated = await removeAdImage(id, imageUrl, accessToken, csrfToken); lastServerState = updated; }
            catch (err) {
              throw new PartialAdUpdateError(err instanceof Error ? err.message : 'تعذر حذف الصورة.', lastServerState);
            }
          }
          const currentUrls = Array.isArray(updated.images) ? updated.images.filter((url) => typeof url === 'string') : [];
          const newlyAdded = currentUrls.filter((url) => !originalImages.includes(url));
          const ordered = [...existingImages.filter((url) => currentUrls.includes(url)), ...newlyAdded];
          if (ordered.length > 0 && ordered.length === currentUrls.length && ordered.some((url, index) => currentUrls[index] !== url)) {
            try { updated = await reorderAdImages(id, ordered, accessToken, csrfToken); lastServerState = updated; }
            catch (err) {
              throw new PartialAdUpdateError(err instanceof Error ? err.message : 'تعذر ترتيب الصور.', lastServerState);
            }
          }
          setOriginalImages(updated.images ?? ordered); setExistingImages(updated.images ?? ordered);
        }
        if (user?.id) await clearAdEditDraft(String(user.id), String(id)).catch(() => false);
      } else {
        const network = await NetInfo.fetch();
        const online = network.isConnected === true && network.isInternetReachable !== false;
        if (!online) {
          if (!user?.id) throw new Error('يلزم تسجيل الدخول لحفظ إعلان للمزامنة لاحقًا.');
          if (draft.images.length === 0) throw new Error('لا يمكن حفظ إعلان للمزامنة دون صورة واحدة على الأقل.');
          const operationId = `offline-op:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
          await enqueueMutation({
            ownerId: String(user.id),
            id: operationId,
            operation: 'create-ad',
            resourceId: null,
            idempotencyKey: operationId,
            payload: {
              title: draft.title.trim(),
              description: draft.description.trim(),
              city: draft.city.trim(),
              ...(draft.price.trim() ? { price: draft.price.trim() } : {}),
              ...(draft.categoryId.trim() ? { categoryId: draft.categoryId.trim() } : {}),
              isNegotiable: draft.isNegotiable,
              images: draft.images.map((image) => ({
                uri: image.uri,
                name: image.fileName,
                type: image.mimeType,
                ...(typeof (image as SelectedAdImage & { sizeBytes?: number }).sizeBytes === 'number'
                  ? { sizeBytes: (image as SelectedAdImage & { sizeBytes?: number }).sizeBytes }
                  : {}),
              })),
            },
          });
          setDraftCompleted(true);
          if (user?.id != null) { try { await clearAdDraft(String(user.id)); } catch { /* queued payload is now the durable source of truth */ } }
          Alert.alert('حُفظ الإعلان على الجهاز', 'لم يُنشر بعد. سيحاول التطبيق إرساله عند عودة الإنترنت. يمكنك متابعة حالته من «العمليات دون اتصال».', [
            { text: 'عرض العمليات', onPress: () => router.replace('/offline-queue') },
            { text: 'لاحقًا', onPress: () => router.replace('/') },
          ]);
          return;
        }
        await createAd(draft, accessToken, csrfToken);
        setDraftCompleted(true);
        if (user?.id != null) {
          try { await clearAdDraft(String(user.id)); }
          catch { setError('تم إرسال الإعلان، لكن تعذر حذف نسخة المسودة المحلية. يمكنك حذفها لاحقًا من التطبيق.'); }
        }
      }
      Alert.alert('تم الحفظ', id ? 'تم تحديث الإعلان.' : 'تم إرسال الإعلان إلى الخادم.', [{ text: 'حسنًا', onPress: () => router.replace('/my-ads') }]);
    } catch (e) {
      if (e instanceof PartialAdUpdateError) {
        // Fields were saved on the server, but image upload failed.
        // Sync local state so re-saving does not duplicate existing images.
        setOriginalImages(e.updated.images ?? []);
        setExistingImages(e.updated.images ?? []);
        setDraft((current) => ({ ...current, images: [] }));
        setError('تم تحديث البيانات، لكن رفع الصور فشل. لن تُكرَّر الصور عند إعادة المحاولة — جرّب رفع الصور فقط.');
      } else {
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'تعذر حفظ الإعلان.');
      }
    } finally { setSaving(false); }
  };

  if (!user) return <SafeAreaView style={styles.safe} edges={['top']}><AppHeader title="محرر الإعلان" /><View style={styles.center}><Text style={styles.title}>سجّل الدخول لإدارة إعلاناتك</Text><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></View></SafeAreaView>;
  if (loading) return <SafeAreaView style={styles.safe} edges={['top']}><AppHeader title="محرر الإعلان" /><LoadingState message="جاري تحميل الإعلان…" /></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={['top']}><AppHeader title={id ? 'تعديل الإعلان' : 'إضافة إعلان'} onBack={() => router.back()} />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionLabel}>1) البيانات الأساسية</Text><Text style={styles.sectionHint}>العنوان والسعر والموقع كما سيظهر للمشترين</Text><Text style={styles.label}>عنوان الإعلان *</Text><TextInput value={draft.title} onChangeText={(v) => set('title', v)} maxLength={200} placeholder="مثال: هاتف بحالة ممتازة" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
      <Text style={styles.label}>الوصف *</Text><TextInput value={draft.description} onChangeText={(v) => set('description', v)} maxLength={5000} multiline placeholder="اكتب تفاصيل الإعلان بوضوح…" placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} textAlign="right" textAlignVertical="top" />
      <Text style={styles.label}>السعر (₪)</Text><TextInput value={draft.price} onChangeText={(v) => set('price', v)} keyboardType="decimal-pad" placeholder="اتركه فارغًا إذا لم تحدد السعر" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
      <Text style={styles.label}>المدينة *</Text><TextInput value={draft.city} onChangeText={(v) => set('city', v)} maxLength={100} placeholder="المدينة" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
      <Text style={styles.label}>التصنيف</Text>
      {categoriesError ? <Text style={styles.error}>{categoriesError}</Text> : null}
      <View style={styles.categoryWrap}>{categories.map((category) => <Pressable key={category.id} onPress={() => set('categoryId', category.id)} style={[styles.categoryChip, draft.categoryId === category.id && styles.categoryChipSelected]}><Text style={[styles.categoryText, draft.categoryId === category.id && styles.categoryTextSelected]}>{category.nameAr || category.name}</Text></Pressable>)}</View>
      <Text style={styles.sectionLabel}>2) الصور</Text><Text style={styles.sectionHint}>صورة واحدة على الأقل عند النشر الجديد · حتى 10 صور</Text><Text style={styles.label}>صور الإعلان * (بحد أقصى 10، وحجم 5MB لكل صورة)</Text>
      <Pressable disabled={pickingImages || draft.images.length >= 10} style={[styles.secondary, (pickingImages || draft.images.length >= 10) && styles.disabled]} onPress={() => void (async () => { setPickingImages(true); setError(null); try { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) { setError('اسمح للتطبيق بالوصول إلى الصور لاختيار صور الإعلان.'); return; } const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(1, 10 - draft.images.length), quality: 0.85 }); if (!result.canceled) { const picked: SelectedAdImage[] = result.assets.map((asset, index) => ({ uri: asset.uri, fileName: asset.fileName || `marketplat-${Date.now()}-${index}.jpg`, mimeType: asset.mimeType || 'image/jpeg' })).filter((image) => /^image\/(jpeg|jpg|png|webp)$/.test(image.mimeType)); const persisted = await Promise.all(picked.map(async (image) => { try { return await persistSelectedAdImage(image); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ إحدى الصور محليًا.'); return null; } })); const ready = persisted.filter((image): image is NonNullable<typeof image> => image !== null); setDraft((current) => ({ ...current, images: [...current.images, ...ready].slice(0, 10) })); if (picked.length !== result.assets.length) setError('تم تجاهل بعض الملفات؛ الخادم يقبل JPEG وPNG وWebP فقط.'); } } catch { setError('تعذر فتح معرض الصور. حاول مجددًا.'); } finally { setPickingImages(false); } })()}><Text style={styles.secondaryText}>{pickingImages ? 'جاري فتح الصور…' : 'اختيار صور من الهاتف'}</Text></Pressable>
      {id && existingImages.length ? <><Text style={styles.note}>الصور المنشورة حاليًا — يمكنك حذف صورة أو تحريكها لتغيير ترتيب العرض.</Text><View style={styles.imageGrid}>{existingImages.map((uri, index) => <View key={`${uri}-${index}`} style={styles.imageTile}><Image source={{ uri }} style={styles.previewImage} /><View style={styles.imageControls}><Pressable accessibilityRole="button" accessibilityLabel="تحريك الصورة للأمام" disabled={index === 0} onPress={() => setExistingImages((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} style={[styles.imageControl, index === 0 && styles.disabled]}><Text style={styles.imageControlText}>‹</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="حذف الصورة" disabled={existingImages.length <= 1} onPress={() => setExistingImages((current) => current.filter((_, imageIndex) => imageIndex !== index))} style={[styles.removeImage, existingImages.length <= 1 && styles.disabled]}><Text style={styles.removeImageText}>×</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="تحريك الصورة للخلف" disabled={index === existingImages.length - 1} onPress={() => setExistingImages((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })} style={[styles.imageControl, index === existingImages.length - 1 && styles.disabled]}><Text style={styles.imageControlText}>›</Text></Pressable></View></View>)}</View></> : null}
      {draft.images.length ? <><Text style={styles.note}>صور جديدة ستُضاف عند الحفظ</Text><View style={styles.imageGrid}>{draft.images.map((image, index) => <View key={`${image.uri}-${index}`} style={styles.imageTile}><Image source={{ uri: image.uri }} style={styles.previewImage} /><Pressable accessibilityLabel="إزالة الصورة الجديدة" onPress={() => { setDraft((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) })); }} style={styles.removeImage}><Text style={styles.removeImageText}>×</Text></Pressable></View>)}</View></> : !existingImages.length ? <Text style={styles.note}>لم تختر صورًا بعد.</Text> : null}
      <View style={styles.switchRow}><Text style={styles.sectionLabel}>3) خيارات النشر</Text><Text style={styles.label}>السعر قابل للتفاوض</Text><Switch value={draft.isNegotiable} onValueChange={(v) => set('isNegotiable', v)} trackColor={{ true: colors.brand }}/></View>
      {error ? <Notice>{error}</Notice> : null}
      <Text style={styles.note}>عند حفظ إعلان جديد، يجب رفع صورة واحدة على الأقل. عند تعديل إعلان، تُضاف الصور الجديدة وتُحفظ تغييرات حذف/ترتيب الصور الحالية عند الاتصال بالإنترنت.</Text>
      <PrimaryButton label={saving ? 'جاري الحفظ…' : id ? 'حفظ التعديلات' : 'نشر الإعلان'} busy={saving} onPress={() => { void submit(); }} />
    </ScrollView></KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  sectionLabel:{fontSize:16,fontWeight:'800',color:colors.ink,textAlign:'right',marginTop:spacing.sm},
  sectionHint:{fontSize:12,color:colors.muted,textAlign:'right',marginBottom:spacing.xs,lineHeight:18},safe:{flex:1,backgroundColor:colors.canvas},flex:{flex:1},header:{minHeight:56,paddingHorizontal:spacing.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:17,fontWeight:'900',color:colors.ink},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},form:{padding:spacing.lg,gap:spacing.md,paddingBottom:56},label:{fontSize:14,fontWeight:'800',color:colors.ink,textAlign:'right',marginTop:spacing.sm},input:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.md,color:colors.ink,fontSize:15,minHeight:54},multiline:{minHeight:130},switchRow:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingVertical:spacing.sm},error:{color:colors.danger,backgroundColor:colors.dangerSoft,padding:spacing.md,borderRadius:radius.sm,textAlign:'right',lineHeight:21},note:{color:colors.muted,fontSize:12,lineHeight:19,textAlign:'right'},imageControls:{position:'absolute',bottom:3,left:3,right:3,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},imageControl:{width:25,height:25,borderRadius:13,backgroundColor:'rgba(255,255,255,0.91)',alignItems:'center',justifyContent:'center'},imageControlText:{color:colors.ink,fontSize:20,fontWeight:'900',lineHeight:22},primary:{minHeight:52,alignItems:'center',justifyContent:'center',backgroundColor:colors.brand,borderRadius:radius.md,paddingHorizontal:spacing.lg,paddingVertical:spacing.md,marginTop:spacing.md},primaryText:{color:colors.white,fontWeight:'900'},disabled:{opacity:.6},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},categoryWrap:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8},categoryChip:{minHeight:40,justifyContent:'center',paddingHorizontal:14,paddingVertical:9,borderWidth:1,borderColor:colors.border,borderRadius:20,backgroundColor:colors.surface},categoryChipSelected:{backgroundColor:colors.brand,borderColor:colors.brand},categoryText:{color:colors.ink,fontSize:12,fontWeight:'700'},categoryTextSelected:{color:colors.white},secondary:{alignItems:'center',borderWidth:1,borderColor:colors.brand,borderRadius:radius.md,padding:spacing.md,marginTop:spacing.sm},secondaryText:{color:colors.brand,fontWeight:'900'},imageGrid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:10,marginTop:spacing.sm},imageTile:{width:96,height:96,position:'relative'},previewImage:{width:96,height:96,borderRadius:radius.md,backgroundColor:colors.border},removeImage:{position:'absolute',top:3,right:3,width:28,height:28,borderRadius:14,backgroundColor:colors.danger,alignItems:'center',justifyContent:'center'},removeImageText:{color:colors.white,fontSize:22,fontWeight:'900',lineHeight:25},title:{color:colors.ink,fontWeight:'800',fontSize:17},muted:{color:colors.muted,fontSize:13,textAlign:'center'}});
