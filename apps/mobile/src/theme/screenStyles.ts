/**
 * أنماط شاشة مشتركة — لتقليل تكرار StyleSheet في الشاشات.
 */
import { StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export const screenStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  sectionGap: { gap: spacing.md },
  rowReverse: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.ink,
    textAlign: 'right',
  },
  body: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'right',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
