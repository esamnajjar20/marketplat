import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {
  getOfflineCacheStatusSnapshot,
  subscribeOfflineCacheStatus,
} from '@/api/offline-cache-status';
import { colors, spacing } from '@/theme/tokens';

function formatAge(ageMs: number): string {
  const minutes = Math.floor(Math.max(0, ageMs) / 60_000);
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ساعة`;
  return `${Math.floor(hours / 24)} يوم`;
}

/** Global, non-identifying notice whenever one or more screens use cached responses. */
export function OfflineCacheNotice() {
  const [status, setStatus] = useState(getOfflineCacheStatusSnapshot);

  useEffect(() => subscribeOfflineCacheStatus(() => {
    setStatus(getOfflineCacheStatusSnapshot());
  }), []);

  if (status.count === 0 || status.latestSavedAt === null) return null;
  const age = formatAge(Date.now() - status.latestSavedAt);
  const resources = status.count === 1 ? 'مصدر بيانات واحد' : `${status.count} مصادر بيانات`;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        marginHorizontal: spacing.md,
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderWidth: 1,
        borderColor: colors.warningBorder,
        borderRadius: 12,
        backgroundColor: colors.warningSoft,
      }}
    >
      <Text style={{ color: colors.warningText, textAlign: 'right', fontWeight: '700' }}>
        تعرض بعض البيانات نسخة محفوظة ({resources}). أحدث نسخة محفوظة عمرها {age}؛ قد لا تعكس آخر التغييرات.
      </Text>
    </View>
  );
}
