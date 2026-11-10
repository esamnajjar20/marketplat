/**
 * أنماط مشتركة لمكوّنات الواجهة — مصدر واحد بدل تكرار StyleSheet في كل ملف.
 * UI/UX Refresh 2026-11: مسافات أوضح، ظلال أنعم، تباين أفضل، لمسة احترافية.
 */
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { fontSizes, elevation, radius, sizes, spacing, typography, ux, type ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';

function createUIStyles(palette: ColorPalette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.headerHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
    gap: spacing.sm,
    ...elevation.xs,
  },
  back: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radius.md,
    backgroundColor: palette.brandSoft,
  },
  title: {
    flex: 1,
    textAlign: 'right',
    ...typography.title,
    color: palette.ink,
  },
  headerRight: { minWidth: sizes.iconButton, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: sizes.iconButton, height: sizes.iconButton },

  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.x5l + sizes.bottomNavHeight / 2,
  },
  detailContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  detailFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
    gap: spacing.sm,
    ...elevation.sm,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionHeaderText: { flex: 1, gap: 3 },
  sectionTitle: { textAlign: 'right', ...typography.subtitle, color: palette.ink },
  sectionSubtitle: { textAlign: 'right', ...typography.caption, color: palette.muted },
  sectionAction: {
    ...typography.captionStrong,
    color: palette.brand,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },

  card: {
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: spacing.md,
    ...elevation.sm,
  },
  cardElevated: {
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: palette.surface,
    gap: spacing.md,
    ...elevation.md,
  },
  cardPressable: {
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: spacing.md,
    ...elevation.sm,
  },

  listRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  listRowGlyph: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: palette.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowGlyphText: { color: palette.brandOnSoft, fontSize: fontSizes[18], fontWeight: '600' },
  listRowText: { flex: 1, gap: 3 },
  listRowTitle: { textAlign: 'right', ...typography.bodyStrong, color: palette.ink },
  listRowDescription: { textAlign: 'right', ...typography.caption, color: palette.muted },
  listRowChevron: { color: palette.mutedSoft, fontSize: fontSizes[16] },

  field: { gap: spacing.sm },
  label: { ...typography.label, color: palette.ink, textAlign: 'right' },
  input: {
    minHeight: sizes.inputHeight,
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    borderRadius: radius.input,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.lg,
    color: palette.ink,
    fontSize: typography.body.fontSize,
    textAlign: 'right',
  },
  textarea: { minHeight: 128, paddingVertical: spacing.md, textAlignVertical: 'top' },
  inputDisabled: { opacity: ux.disabledOpacity, backgroundColor: palette.surfaceSecondary },
  inputFocused: {
    borderColor: palette.focus,
    borderWidth: 2,
    paddingHorizontal: spacing.lg - 0.5,
    backgroundColor: palette.surface,
  },
  inputError: { borderColor: palette.danger, backgroundColor: palette.dangerSoft },
  fieldError: { textAlign: 'right', ...typography.caption, color: palette.dangerText },
  fieldHint: { textAlign: 'right', ...typography.caption, color: palette.muted },

  button: {
    minHeight: sizes.buttonHeight,
    borderRadius: radius.button,
    backgroundColor: palette.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    ...elevation.xs,
  },
  buttonText: { color: palette.onBrand, ...typography.button },
  secondary: {
    backgroundColor: palette.brandSoft,
    borderWidth: 1.5,
    borderColor: palette.brandSoftActive,
    ...elevation.none,
  },
  secondaryText: { color: palette.brandOnSoft },
  danger: { backgroundColor: palette.danger },
  dangerText: { color: palette.onDanger },
  ghost: {
    backgroundColor: palette.transparent,
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    ...elevation.none,
  },
  ghostText: { color: palette.ink },
  buttonDisabled: { opacity: ux.disabledOpacity },
  buttonSm: {
    minHeight: sizes.buttonHeightSm,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: ux.pressedOpacity, transform: [{ scale: 0.985 }] },

  notice: {
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: palette.dangerSoft,
    borderWidth: 1,
    borderColor: palette.dangerBorder,
  },
  success: { backgroundColor: palette.successSoft, borderColor: palette.successBorder },
  mutedBox: { backgroundColor: palette.surfaceSecondary, borderColor: palette.border },
  info: { backgroundColor: palette.infoSoft, borderColor: palette.infoBorder },
  warning: { backgroundColor: palette.warningSoft, borderColor: palette.warningBorder },
  noticeText: { color: palette.dangerText, textAlign: 'right', lineHeight: 22, fontSize: fontSizes[14] },
  successText: { color: palette.successText },
  infoText: { color: palette.infoText },
  warningText: { color: palette.warningText },
  mutedText: { color: palette.muted },

  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.brandSoft,
    alignSelf: 'flex-start',
  },
  badgeText: { ...typography.overline, color: palette.brandOnSoft },
  badgeAccent: { backgroundColor: palette.accentSoft },
  badgeAccentText: { color: palette.accent },
  badgeDanger: { backgroundColor: palette.dangerSoft },
  badgeDangerText: { color: palette.dangerText },
  badgeSuccess: { backgroundColor: palette.successSoft },
  badgeMuted: { backgroundColor: palette.canvasElevated },

  chip: {
    minHeight: sizes.chipHeight,
    minWidth: sizes.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chipActive: {
    backgroundColor: palette.brandSoft,
    borderColor: palette.brand,
  },
  chipSelected: {
    backgroundColor: palette.brandSoft,
    borderColor: palette.brand,
  },
  chipText: { ...typography.captionStrong, color: palette.muted },
  chipTextActive: { color: palette.brandOnSoft },
  chipTextSelected: { color: palette.brandOnSoft },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.x5l,
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.subtitle, color: palette.ink, textAlign: 'center' },
  emptyDescription: { ...typography.body, color: palette.muted, textAlign: 'center' },

  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.x5l,
    gap: spacing.md,
  },

  skeleton: {
    backgroundColor: palette.borderSubtle,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  skeletonCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginVertical: spacing.sm,
  },

  avatar: {
    width: sizes.avatarMd,
    height: sizes.avatarMd,
    borderRadius: sizes.avatarMd / 2,
    backgroundColor: palette.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.bodyStrong, color: palette.brandOnSoft },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.inputHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    backgroundColor: palette.surface,
    ...elevation.xs,
  },
  searchIcon: { color: palette.muted, fontSize: fontSizes[18], fontWeight: '600' },
  searchInput: {
    flex: 1,
    color: palette.ink,
    fontSize: typography.body.fontSize,
    paddingVertical: spacing.sm,
  },
  searchClearButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  searchClear: {
    color: palette.muted,
    fontSize: fontSizes[22],
    lineHeight: 28,
    paddingHorizontal: spacing.sm,
  },
  searchBtn: {
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.brandSoft,
  },
  searchBtnText: { color: palette.brandOnSoft, ...typography.captionStrong },

  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.x5l,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  stateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: palette.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  stateIconError: { backgroundColor: palette.dangerSoft },
  stateIcon: { fontSize: fontSizes[28], color: palette.brandOnSoft, fontWeight: '600' },
  stateTitle: { textAlign: 'center', ...typography.subtitle, color: palette.ink },
  stateMessage: { textAlign: 'center', ...typography.body, color: palette.muted },

  offlineBanner: {
    backgroundColor: palette.warningSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.warningBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  offlineBannerText: {
    fontSize: fontSizes[12],
    fontWeight: '600',
    lineHeight: 18,
    color: palette.warningText,
    textAlign: 'center',
  },
});
}


export function useUIStyles() {
  const { colors: palette } = useAppTheme();
  return useMemo(() => createUIStyles(palette), [palette]);
}
