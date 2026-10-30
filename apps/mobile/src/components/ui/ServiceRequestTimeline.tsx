import { Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme/tokens';
const LABELS: Record<string, string> = { PENDING: 'تم إرسال الطلب', ACCEPTED: 'قُبل الطلب', REJECTED: 'رُفض الطلب', IN_PROGRESS: 'بدأ التنفيذ', COMPLETED: 'اكتمل الطلب', CANCELLED: 'أُلغي الطلب', EXPIRED: 'انتهت صلاحية الطلب', DISPUTED: 'الطلب قيد المراجعة' };
const ORDER = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];
type TimelineEvent = { key: string; date?: string | null; label: string };
export function ServiceRequestTimeline({ status, createdAt, respondedAt }: { status?: string; createdAt?: string; respondedAt?: string | null }) {
  const current = ORDER.indexOf(status || 'PENDING'); const terminal = ['REJECTED', 'CANCELLED', 'EXPIRED', 'DISPUTED'].includes(status || '');
  const events: TimelineEvent[] = [
    { key: 'PENDING', date: createdAt, label: LABELS.PENDING },
    ...(respondedAt ? [{ key: 'RESPONDED', date: respondedAt, label: LABELS[status || ''] || 'تم تحديث حالة الطلب' }] : []),
    ...(status === 'IN_PROGRESS' || status === 'COMPLETED' ? [{ key: 'IN_PROGRESS', label: LABELS.IN_PROGRESS }] : []),
    ...(status === 'COMPLETED' ? [{ key: 'COMPLETED', label: LABELS.COMPLETED }] : []),
    ...(terminal ? [{ key: status || 'END', label: LABELS[status || ''] || 'تم تحديث حالة الطلب' }] : []),
  ];
  return <View style={{ gap: spacing.md }}><Text style={{ textAlign: 'right', color: colors.ink, fontSize: 16, fontWeight: '900' }}>تسلسل حالة الطلب</Text>{events.map((event, i) => { const complete = terminal ? i === events.length - 1 : (event.key === 'PENDING' || (event.key === 'RESPONDED' && current >= 1) || (event.key === 'IN_PROGRESS' && current >= 2) || (event.key === 'COMPLETED' && current >= 3)); const date = event.date ? new Date(event.date) : null; const dateText = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : ''; return <View key={`${event.key}-${i}`} style={{ flexDirection: 'row-reverse', gap: spacing.md, alignItems: 'flex-start' }}><View style={{ width: 24, alignItems: 'center' }}><View style={{ width: 12, height: 12, borderRadius: radius.pill, backgroundColor: complete ? colors.success : colors.borderStrong, marginTop: 4 }} />{i < events.length - 1 ? <View style={{ width: 2, height: 30, backgroundColor: colors.border }} /> : null}</View><View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: spacing.md, gap: 3 }}><Text style={{ textAlign: 'right', color: colors.ink, fontWeight: '800' }}>{event.label}</Text>{dateText ? <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>{dateText}</Text> : null}</View></View>; })}</View>;
}
