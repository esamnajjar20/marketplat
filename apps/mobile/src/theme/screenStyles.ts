/**
 * أنماط شاشة مشتركة — لتقليل تكرار StyleSheet في الشاشات.
 */
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { radius, spacing, typography, type ColorPalette } from '@/theme/tokens';
import { useAppTheme } from './ThemeProvider';

function createScreenStyles(palette: ColorPalette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  sectionGap: { gap: spacing.md },
  rowReverse: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    color: palette.ink,
    textAlign: 'right',
  },
  body: {
    ...typography.body,
    color: palette.muted,
    textAlign: 'right',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
}


export function useScreenStyles() {
  const { colors: palette } = useAppTheme();
  return useMemo(() => createScreenStyles(palette), [palette]);
}
