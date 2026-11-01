import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { subscribeToToasts, type ToastMessage } from '@/lib/toast';
import { colors, radius, spacing, fontSizes } from '@/theme/tokens';

export function ToastHost() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => subscribeToToasts(setToast), []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const accent = toast.tone === 'success' ? colors.success
    : toast.tone === 'error' ? colors.danger
      : toast.tone === 'warning' ? colors.warning : colors.brand;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${toast.title}. ${toast.message}. ${toast.action ? `إجراء: ${toast.action.label}` : 'إغلاق'}`}
        accessibilityLiveRegion="polite"
        onPress={() => {
          const action = toast.action;
          setToast(null);
          action?.onPress();
        }}
        style={[styles.toast, { borderRightColor: accent }]}
      >
        <Text style={styles.title}>{toast.title}</Text>
        {toast.message ? <Text style={styles.message}>{toast.message}</Text> : null}
        {toast.action ? <Text style={styles.action}>{toast.action.label}</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, zIndex: 2000, elevation: 20 },
  toast: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRightWidth: 4, borderRadius: radius.md, padding: spacing.md, gap: 4, shadowColor: colors.black, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  title: { fontSize: fontSizes[13], fontWeight: '900', color: colors.ink, textAlign: 'right' },
  message: { fontSize: fontSizes[12], lineHeight: 19, color: colors.muted, textAlign: 'right' },
  action: { marginTop: spacing.xs, fontSize: fontSizes[12], fontWeight: '900', color: colors.brand, textAlign: 'right' },
});
