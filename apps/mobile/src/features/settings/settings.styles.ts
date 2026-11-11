import { StyleSheet } from 'react-native';
import { fontSizes, fontWeights, radius, spacing, type ColorPalette } from '@/theme/tokens';

/** أنماط شاشة الإعدادات وأقسامها — كلها من tokens، وتتبع الثيم عبر `palette`. */
export function createSettingsStyles(palette: ColorPalette) {
  return StyleSheet.create({
    cardPad: { padding: spacing.md },
    group: { gap: spacing.md },
    groupHeader: { gap: spacing.xxs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      minHeight: 48,
    },
    rowText: { flex: 1, gap: spacing.xxs },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
    segment: { flexDirection: 'row', gap: spacing.sm },
    segmentItem: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      paddingHorizontal: spacing.sm,
    },
    segmentItemActive: { borderColor: palette.brand, backgroundColor: palette.brandSoft },
    segmentText: { color: palette.ink, fontSize: fontSizes[13], fontWeight: fontWeights.semibold },
    segmentTextActive: { color: palette.brandOnSoft },
    timeRow: { flexDirection: 'row', gap: spacing.md },
    timeField: { flex: 1 },
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 48,
    },
  });
}
