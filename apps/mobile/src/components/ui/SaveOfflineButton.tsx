import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useEffect, useState } from 'react';
import {} from 'react-native';
import { isSavedOfflineResource, saveOfflineResource, type SavedOfflineKind } from '@/storage/saved-offline';
import { radius, sizes, typography, spacing } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
export function SaveOfflineButton({ id, kind, title, payload }: { id: string; kind: SavedOfflineKind; title: string; payload: Record<string, unknown> }) {
  const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false); const { colors } = useAppTheme();
  useEffect(() => { let active = true; void isSavedOfflineResource(kind, id).then((value) => { if (active) setSaved(value); }).catch(() => undefined); return () => { active = false; }; }, [id, kind]);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await saveOfflineResource({ id, kind, title, payload });
      setSaved(true);
      const imageDetail = result.requestedImages > 0 && result.cachedImages < result.requestedImages
        ? ` حُفظ ${result.cachedImages} من ${result.requestedImages} صور محليًا؛ الصور غير المحفوظة قد تحتاج إلى اتصال بالإنترنت.`
        : '';
      showToast('تم الحفظ دون اتصال', `حُفظت نسخة مستقلة عن الكاش التلقائي. ستجدها في «المحتوى المحفوظ دون اتصال» من الإعدادات.${imageDetail}`, 'success');
    } catch (error) {
      showToast('تعذر الحفظ دون اتصال', error instanceof Error ? error.message : 'تحقق من مساحة التخزين ثم حاول مرة أخرى.', 'error');
    } finally { setBusy(false); }
  };
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, selected: saved }} disabled={busy || saved} onPress={() => void save()} style={{ minHeight: sizes.touchTarget, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: saved ? colors.brandSoft : colors.surface }}><Text style={{ color: saved ? colors.brandOnSoft : colors.ink, ...typography.captionStrong }}>{busy ? 'جارٍ الحفظ…' : saved ? '✓ محفوظ دون اتصال' : 'حفظ دون اتصال'}</Text></Pressable>;
}
