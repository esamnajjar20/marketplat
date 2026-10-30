import { useEffect, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { isSavedOfflineResource, saveOfflineResource, type SavedOfflineKind } from '@/storage/saved-offline';
import { colors, radius, sizes, typography } from '@/theme/tokens';
export function SaveOfflineButton({ id, kind, title, payload }: { id: string; kind: SavedOfflineKind; title: string; payload: Record<string, unknown> }) {
  const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void isSavedOfflineResource(kind, id).then((value) => { if (active) setSaved(value); }).catch(() => undefined); return () => { active = false; }; }, [id, kind]);
  const save = async () => { if (busy) return; setBusy(true); try { await saveOfflineResource({ id, kind, title, payload }); setSaved(true); Alert.alert('تم الحفظ دون اتصال', 'حُفظت نسخة مستقلة عن الكاش التلقائي. ستجدها في «المحتوى المحفوظ دون اتصال» من الإعدادات.'); } catch (error) { Alert.alert('تعذر الحفظ دون اتصال', error instanceof Error ? error.message : 'تحقق من مساحة التخزين ثم حاول مجددًا.'); } finally { setBusy(false); } };
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, selected: saved }} disabled={busy || saved} onPress={() => void save()} style={{ minHeight: sizes.touchTarget, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: saved ? colors.brandSoft : colors.surface }}><Text style={{ color: saved ? colors.brand : colors.ink, ...typography.captionStrong }}>{busy ? 'جارٍ الحفظ…' : saved ? '✓ محفوظ دون اتصال' : 'حفظ دون اتصال'}</Text></Pressable>;
}
