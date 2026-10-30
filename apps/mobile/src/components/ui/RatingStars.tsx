import { Text, View } from 'react-native';
import { colors, spacing } from '@/theme/tokens';
export function RatingStars({ score, count, size = 16 }: { score?: number | string | null; count?: number | null; size?: number }) {
  const parsed = Number(score ?? 0); const rounded = Math.max(0, Math.min(5, Math.round(Number.isFinite(parsed) ? parsed : 0)));
  return <View accessible accessibilityLabel={`التقييم ${Number.isFinite(parsed) ? parsed.toFixed(1) : '0.0'} من 5${count != null ? `، ${count} تقييم` : ''}`} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs }}><Text style={{ color: colors.accent, fontSize: size, letterSpacing: 1 }}>{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)}</Text><Text style={{ color: colors.muted, fontSize: Math.max(11, size - 3) }}>{Number.isFinite(parsed) ? parsed.toFixed(1) : '—'}{count != null ? ` (${count})` : ''}</Text></View>;
}
