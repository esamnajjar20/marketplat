import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { SectionCard } from '@/components/ui';
import { useAppTheme, type ThemeMode } from '@/theme/ThemeProvider';
import { createSettingsStyles } from './settings.styles';

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'حسب الجهاز' },
  { mode: 'light', label: 'فاتح' },
  { mode: 'dark', label: 'داكن' },
];

/** اختيار مظهر التطبيق (نظام / فاتح / داكن). يُحفظ عبر `ThemeProvider`. */
export function ThemeSection() {
  const { colors, mode, setMode } = useAppTheme();
  const styles = useMemo(() => createSettingsStyles(colors), [colors]);
  const [persistFailed, setPersistFailed] = useState(false);

  const choose = async (next: ThemeMode) => {
    setPersistFailed(false);
    const saved = await setMode(next);
    if (!saved) setPersistFailed(true);
  };

  return (
    <SectionCard>
      <View style={styles.groupHeader}>
        <Text tone="ink" strong>المظهر</Text>
        <Text tone="muted" size={12}>اختر مظهر التطبيق</Text>
      </View>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {OPTIONS.map((option) => {
          const active = option.mode === mode;
          return (
            <Pressable
              key={option.mode}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
              onPress={() => void choose(option.mode)}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {persistFailed ? (
        <Text tone="muted" size={12}>تعذّر حفظ الاختيار؛ سيبقى مطبّقًا حتى إغلاق التطبيق.</Text>
      ) : null}
    </SectionCard>
  );
}
