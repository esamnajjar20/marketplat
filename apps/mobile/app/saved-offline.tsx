import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { showToast } from '@/lib/toast';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { pushOnce } from '@/lib/navigation';
import { listSavedOfflineResources, removeSavedOfflineResource, type SavedOfflineItem } from '@/storage/saved-offline';
import { EmptyState, Notice, PrimaryButton, SectionCard } from '@/components/ui';
import { PageList } from '@/components/ui/PageList';
import { pickRemoteImageUri } from '@/lib/list-image';
import { fontSizes, radius, spacing, typography } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';

const kindName = (kind: SavedOfflineItem['kind']) => kind === 'ad' ? 'إعلان' : kind === 'product' ? 'منتج' : 'متجر';
const dateLabel = (value: number) => formatSafeDate(value, 'dateTime');
const savedKey = (item: SavedOfflineItem) => `${item.kind}:${item.id}`;

const SavedRow = memo(function SavedRow({ item, onOpen, onRemove }: { item: SavedOfflineItem; onOpen: (item: SavedOfflineItem) => void; onRemove: (item: SavedOfflineItem) => void }) {
  const { colors } = useAppTheme();
  const firstImage = pickRemoteImageUri(item.payload.images) ?? (Array.isArray(item.payload.images) ? item.payload.images.find((value): value is string => typeof value === 'string') : undefined);
  const description = typeof item.payload.description === 'string' ? item.payload.description : '';
  const price = item.payload.price === null || item.payload.price === undefined ? '' : String(item.payload.price);
  return (
    <SectionCard>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        {firstImage ? <AppImage uri={firstImage} variant="list" style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.border }} /> : null}
        <View style={{ flex: 1, gap: spacing.xs }}><Text tone="ink" strong size={15}>{item.title}</Text><Text tone="brand" strong size={12}>{kindName(item.kind)}{price ? ` · ${formatMoney(price)}` : ''}</Text>{description ? <Text numberOfLines={3} style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[12], lineHeight: 18 }}>{description}</Text> : null}<Text tone="muted" size={11}>تاريخ الحفظ: {dateLabel(item.savedAt)}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <PrimaryButton label="فتح التفاصيل" variant="secondary" onPress={() => onOpen(item)} />
        <PrimaryButton label="إزالة الحفظ" variant="danger" onPress={() => onRemove(item)} />
      </View>
    </SectionCard>
  );
});

export default function SavedOfflineScreen() {
  const { colors } = useAppTheme();

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
  const remove = useCallback((item: SavedOfflineItem) => { void removeSavedOfflineResource(item.kind, item.id).then(() => { setItems((current) => current.filter((row) => row.id !== item.id || row.kind !== item.kind)); showToast('تمت إزالة النسخة المحفوظة', 'يمكنك حفظ المحتوى دون اتصال مرة أخرى من صفحة التفاصيل.', 'success'); }).catch((e) => showToast('تعذر الإزالة', e instanceof Error ? e.message : 'حاول مرة أخرى.', 'error')); }, []);
  const open = useCallback((item: SavedOfflineItem) => pushOnce(item.kind === 'ad' ? { pathname: '/ads/[id]', params: { id: item.id } } : item.kind === 'product' ? { pathname: '/products/[id]', params: { id: item.id } } : { pathname: '/stores/[id]', params: { id: item.id } }), []);
  const renderItem = useCallback(({ item }: { item: SavedOfflineItem }) => <SavedRow item={item} onOpen={open} onRemove={remove} />, [open, remove]);
  return <PageList
    title="المحتوى المحفوظ دون اتصال"
    right={<Pressable accessibilityRole="button" onPress={() => void load()} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, ...typography.captionStrong }}>تحديث</Text></Pressable>}
    data={items}
    keyExtractor={savedKey}
    renderItem={renderItem}
    header={<>
      <Notice tone="muted">هذه القائمة منفصلة عن الكاش التلقائي، وتحتفظ بنسخة تفاصيل ومراجع الصور التي تم تنزيلها بنجاح. تبقى صلاحية البيانات النصية مرتبطة بوقت الحفظ.</Notice>
      {loading ? <SectionCard><Text style={{ textAlign: 'center', color: colors.muted }}>جارٍ قراءة المحتوى المحفوظ…</Text></SectionCard> : null}
      {error ? <SectionCard><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void load()} /></SectionCard> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="لا يوجد محتوى محفوظ" description="افتح تفاصيل إعلان أو منتج واضغط «حفظ دون اتصال» لإضافة نسخة مستقلة هنا." /> : null}
    </>}
  />;
}
