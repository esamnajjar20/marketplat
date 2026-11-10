/**
 * MarketPlat Design Tokens
 * مصدر واحد للألوان، المسافات، الزوايا، الخطوط، والظلال.
 * لا تستخدم قيم hex أو أحجام خطوط مباشرة في الشاشات — مرّ من هنا.
 *
 * تحديث 2026-11: تخفيف أوزان الخط، تعزيز الظلال، مقياس تايبو أوضح
 * لرفع الإحساس الاحترافي على الموبايل دون كسر الهوية البصرية.
 */

export const colors = {
  // نص — متوافق مع هوية الويب (سوق غزة)
  ink: '#241E19',
  muted: '#6B635A',
  // علامة تجارية: زيتوني
  brand: '#397F56',
  brandDark: '#244A37',
  // Higher-contrast text for brandSoft backgrounds (WCAG AA for small text).
  brandOnSoft: '#244A37',
  brandSoft: '#E8F0EB',
  brandSoftActive: '#D5E5DB',
  // خلفيات: كريمي دافئ
  canvas: '#FDFCF9',
  surface: '#FFFFFF',
  // حدود
  border: '#E8E0D4',
  borderStrong: '#C9D6CE',
  // حدود أكثر وضوحًا لعناصر التحكم التي تعتمد على المحيط البصري.
  controlBorder: '#7C8A80',
  focus: '#397F56',
  // Overlays مصممة للمحتوى المتراكب فوق الصور/الفيديو
  mediaControlOverlay: 'rgba(255, 255, 255, 0.91)',
  mediaCounterOverlay: 'rgba(0, 0, 0, 0.55)',
  mediaCloseOverlay: 'rgba(0, 0, 0, 0.55)',
  fullscreenBackdrop: 'rgba(0, 0, 0, 0.95)',
  modalBackdrop: 'rgba(36, 30, 25, 0.42)',
  storyProgressTrack: 'rgba(255, 255, 255, 0.30)',
  storyNavigationOverlay: 'rgba(0, 0, 0, 0.26)',
  // تمييز: تيراكوتا
  accent: '#AD531F',
  accentSoft: '#F8EBE5',
  // حالات
  danger: '#B42318',
  dangerSoft: '#FCE8E6',
  dangerBorder: '#F5C2BE',
  success: '#397F56',
  successSoft: '#E8F0EB',
  successBorder: '#C9D6CE',
  info: '#1D4E89',
  infoSoft: '#EAF2FB',
  infoBorder: '#C6DAF1',
  warning: '#BE5A32',
  warningText: '#A34826',
  warningSoft: '#F8EBE5',
  warningBorder: '#E8C4B4',
  // ثابت
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  x4l: 48,
  x5l: 64,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
  control: 12,
  card: 16,
  modal: 20,
  shell: 20,
  hero: 24,
} as const;

/** أحجام الخط الموحدة */
export const fontSizes = {
  10: 10,
  11: 11,
  12: 12,
  13: 13,
  14: 14,
  15: 15,
  16: 16,
  17: 17,
  18: 18,
  19: 19,
  20: 20,
  21: 21,
  22: 22,
  23: 23,
  24: 24,
  25: 25,
  26: 26,
  28: 28,
  30: 30,
  32: 32,
  34: 34,
  40: 40,
} as const;

/**
 * مقياس تايبوغرافي أوضح وأكثر هدوءًا.
 * الأوزان خُففت لتجنب الإحساس «الصاخب» على الموبايل.
 */
export const typography = {
  display: {
    fontSize: 26,
    fontWeight: '800' as const,
    lineHeight: 34,
  },
  title: {
    fontSize: 18,
    fontWeight: '700' as const,
    lineHeight: 26,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  bodyStrong: {
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 18,
  },
  captionStrong: {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 18,
  },
  button: {
    fontSize: 15,
    fontWeight: '700' as const,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  overline: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 16,
  },
} as const;

/** ظلال متدرجة — البطاقات sm، العناصر المرتفعة md، النوافذ lg */
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#241E19',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#241E19',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: '#241E19',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

/** ارتفاعات تفاعلية موحّدة */
export const sizes = {
  touchTarget: 44,
  inputHeight: 52,
  buttonHeight: 52,
  headerHeight: 56,
  bottomNavHeight: 68,
  iconButton: 44,
  avatarSm: 36,
  avatarMd: 48,
  avatarLg: 64,
  chipHeight: 40,
  cardImageRow: 96,
  cardImageGrid: 140,
  adImageWidth: 120,
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;

/** ثوابت تجربة المستخدم */
export const ux = {
  minTouch: 44,
  pressedOpacity: 0.78,
  disabledOpacity: 0.45,
  durationFast: 120,
  durationNormal: 220,
  durationSlow: 320,
} as const;
