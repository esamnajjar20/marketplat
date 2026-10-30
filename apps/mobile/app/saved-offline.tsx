import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { listSavedOfflineResources, removeSavedOfflineResource, type SavedOfflineItem } from '@/storage/saved-offline';
import { EmptyState, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const kindName = (kind: SavedOfflineItem['kind']) => kind === 'ad' ? 'إعلان' : kind === 'product' ? 'منتج' : 'متجر';
const dateLabel = (value: number) => new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export default function SavedOfflineScreen() {
  const [items, setItems] = useState<SavedOfflineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listSavedOfflineResources()); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر قراءة المحتوى المحفوظ.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const remove = (item: SavedOfflineItem) => Alert.alert('إزالة الحفظ دون اتصال', `إزالة «${item.title}» من قائمة المحفوظات؟`, [{ text: 'إلغاء', style: 'cancel' }, { text: 'إزالة', style: 'destructive', onPress: () => { void removeSavedOfflineResource(item.kind, item.id).then(() => setItems((current) => current.filter((row) => row.id !== item.id || row.kind !== item.kind))).catch((e) => Alert.alert('تعذر الإزالة', e instanceof Error ? e.message : 'حاول مجددًا.')); } }]);
  return <PageShell title="المحتوى المحفوظ دون اتصال" right={<Pressable accessibilityRole="button" onPress={() => void load()} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, ...typography.captionStrong }}>تحديث</Text></Pressable>}>
    <Notice tone="muted">هذه القائمة منفصلة عن الكاش التلقائي، وتحتفظ بنسخة تفاصيل ومراجع الصور التي تم تنزيلها بنجاح. تبقى صلاحية البيانات النصية مرتبطة بوقت الحفظ.</Notice>
    {loading ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ قراءة المحتوى المحفوظ…</Text></SectionCard> : null}
    {error ? <SectionCard><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()} /></SectionCard> : null}
    {!loading && !error && items.length === 0 ? <EmptyState title="لا يوجد محتوى محفوظ" description="افتح تفاصيل إعلان أو منتج واضغط «حفظ دون اتصال» لإضافة نسخة مستقلة هنا." /> : null}
    {items.map((item) => {
      const rawImages = item.payload.images;
      const firstImage = Array.isArray(rawImages) ? rawImages.find((value): value is string => typeof value === 'string') : undefined;
      const description = typeof item.payload.description === 'string' ? item.payload.description : '';
      const price = item.payload.price === null || item.payload.price === undefined ? '' : String(item.payload.price);
      return <SectionCard key={`${item.kind}:${item.id}`}>
        <View style={{ flexDirection: 'row-reverse', gap: spacing.md, alignItems: 'flex-start' }}>
          {firstImage ? <Image source={{ uri: firstImage }} style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.border }} /> : null}
          <View style={{ flex: 1, gap: spacing.xs }}><Text style={{ textAlign: 'right', color: colors.ink, fontWeight: '900', fontSize: 15 }}>{item.title}</Text><Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800', fontSize: 12 }}>{kindName(item.kind)}{price ? ` · ${price} ₪` : ''}</Text>{description ? <Text numberOfLines={3} style={{ textAlign: 'right', color: colors.muted, fontSize: 12, lineHeight: 18 }}>{description}</Text> : null}<Text style={{ textAlign: 'right', color: colors.muted, fontSize: 11 }}>تاريخ الحفظ: {dateLabel(item.savedAt)}</Text></View>
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: spacing.sm }}>
          <PrimaryButton label="فتح التفاصيل" variant="secondary" onPress={() => router.push(item.kind === 'ad' ? { pathname: '/ads/[id]', params: { id: item.id } } : item.kind === 'product' ? { pathname: '/products/[id]', params: { id: item.id } } : { pathname: '/stores/[id]', params: { id: item.id } })} />
          <PrimaryButton label="إزالة الحفظ" variant="danger" onPress={() => remove(item)} />
        </View>
      </SectionCard>;
    })}
  </PageShell>;
}
