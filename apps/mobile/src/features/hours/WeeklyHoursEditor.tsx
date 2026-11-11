import { View } from 'react-native';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppText as Text } from '@/components/ui/AppText';
import { Field, SectionCard } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { fontSizes, fontWeights, radius, sizes, spacing } from '@/theme/tokens';
import { WEEK_DAYS, setDayTime, toggleDay, type WeeklyHours } from './weekly-hours';

/** محرر ساعات العمل الأسبوعية: صف لكل يوم مع تبديل مفتوح/مغلق وحقلي الفتح والإغلاق. */
export function WeeklyHoursEditor({ hours, onChange }: { hours: WeeklyHours; onChange: (next: WeeklyHours) => void }) {
  const { colors } = useAppTheme();
  return (
    <>
      {WEEK_DAYS.map((day) => {
        const value = hours[day.key];
        return (
          <SectionCard key={day.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: fontSizes[16], fontWeight: fontWeights.bold, color: colors.ink }}>{day.label}</Text>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={`${day.label}: ${value ? 'مفتوح' : 'مغلق'}`}
                accessibilityState={{ checked: Boolean(value) }}
                onPress={() => onChange(toggleDay(hours, day.key))}
                style={{
                  minWidth: 82, minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: spacing.lg, borderRadius: radius.sm, borderWidth: 1,
                  backgroundColor: value ? colors.brandSoft : colors.surface, borderColor: colors.controlBorder,
                }}
              >
                <Text style={{ color: colors.brandOnSoft, fontWeight: fontWeights.bold }}>{value ? 'مفتوح' : 'مغلق'}</Text>
              </Pressable>
            </View>
            {value ? (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Field label="يفتح (HH:mm)" value={value.open} onChangeText={(v) => onChange(setDayTime(hours, day.key, 'open', v))} placeholder="09:00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="يغلق (HH:mm)" value={value.close} onChangeText={(v) => onChange(setDayTime(hours, day.key, 'close', v))} placeholder="17:00" />
                </View>
              </View>
            ) : null}
          </SectionCard>
        );
      })}
    </>
  );
}
