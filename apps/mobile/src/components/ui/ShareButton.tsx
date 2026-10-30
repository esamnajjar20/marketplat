import { useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { shareMarketPlatResource, type ShareableResource } from '@/features/sharing/deep-links';
import { colors, sizes, typography } from '@/theme/tokens';
export function ShareButton({ resource, id, title, label = 'مشاركة', compact = false }: { resource: ShareableResource; id: string; title: string; label?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${title}`} disabled={busy} onPress={() => { if (busy) return; setBusy(true); void shareMarketPlatResource(resource, id, title).catch((e) => Alert.alert('تعذرت المشاركة', e instanceof Error ? e.message : 'حاول مرة أخرى.')).finally(() => setBusy(false)); }} style={{ minWidth: compact ? 44 : sizes.touchTarget, minHeight: sizes.touchTarget, paddingHorizontal: compact ? 8 : 12, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.brand, ...typography.captionStrong }}>{busy ? 'جارٍ…' : label}</Text></Pressable>;
}
