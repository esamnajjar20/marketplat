import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontSizes, fontWeights, radius, spacing } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

const WEEKDAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? parsed
    : null;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function DatePickerField({ label, value, placeholder = 'اختر التاريخ', onChange }: Props) {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [cursor, setCursor] = useState(() => parseDate(value) ?? new Date());

  useEffect(() => {
    const selected = parseDate(value);
    if (selected) setCursor(selected);
  }, [value]);

  const calendarDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const dayCount = new Date(year, month + 1, 0).getDate();
    return [...Array(firstWeekday).fill(null), ...Array.from({ length: dayCount }, (_, index) => index + 1)];
  }, [cursor]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' }).format(cursor),
    [cursor],
  );

  const changeMonth = (delta: number) => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        onPress={() => setVisible(true)}
        style={[styles.field, { borderColor: colors.controlBorder, backgroundColor: colors.surface }]}
      >
        <Text style={{ color: value ? colors.ink : colors.muted, textAlign: 'right' }}>
          {value || placeholder}
        </Text>
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={[styles.backdrop, { backgroundColor: colors.modalBackdrop }]} >
          <Pressable accessibilityRole="button" accessibilityLabel="إغلاق منتقي التاريخ" onPress={() => setVisible(false)} style={StyleSheet.absoluteFill} />
          <View
            accessibilityViewIsModal
            style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.header}>
              <Pressable accessibilityRole="button" accessibilityLabel="الشهر التالي" onPress={() => changeMonth(1)} style={styles.monthButton}>
                <Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>‹</Text>
              </Pressable>
              <Text style={[styles.monthTitle, { color: colors.ink }]}>{monthLabel}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="الشهر السابق" onPress={() => changeMonth(-1)} style={styles.monthButton}>
                <Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>›</Text>
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {WEEKDAYS.map((day) => (
                <View key={day} style={styles.dayCell}>
                  <Text style={{ color: colors.muted, fontSize: fontSizes[11], textAlign: 'center' }}>{day}</Text>
                </View>
              ))}
              {calendarDays.map((day, index) => {
                if (day === null) return <View key={`empty-${index}`} style={styles.dayCell} />;
                const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
                const iso = toIsoDate(date);
                const selected = iso === value;
                return (
                  <View key={iso} style={styles.dayCell}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={iso}
                      onPress={() => { onChange(iso); setVisible(false); }}
                      style={[styles.dayButton, selected && { backgroundColor: colors.brand }]}
                    >
                      <Text style={{ color: selected ? colors.onBrand : colors.ink, fontWeight: selected ? fontWeights.bold : fontWeights.medium }}>
                        {day}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <View style={styles.footer}>
              <Pressable accessibilityRole="button" onPress={() => { onChange(''); setVisible(false); }}>
                <Text style={{ color: colors.danger, fontWeight: fontWeights.semibold }}>مسح التاريخ</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setVisible(false)}>
                <Text style={{ color: colors.brand, fontWeight: fontWeights.semibold }}>إغلاق</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontSize: fontSizes[12], fontWeight: fontWeights.bold, textAlign: 'right', marginTop: spacing.sm },
  field: { minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, justifyContent: 'center' },
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  dialog: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: fontSizes[16], fontWeight: fontWeights.bold },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  dayButton: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
});
