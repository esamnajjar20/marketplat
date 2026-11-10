/**
 * MarketPlat Design Tokens — UI/UX Refresh 2026-11
 * مصدر واحد للألوان، المسافات، الزوايا، الخطوط، والظلال.
 * لا تستخدم قيم hex أو أحجام خطوط مباشرة في الشاشات — مرّ من هنا.
 *
 * تحسين شامل:
 * - لوحة ألوان أدق مع تباين أفضل وعمق بصري
 * - مقياس تايبو أوضح وهدوء أوزان الخط
 * - مسافات أكثر تنفساً
 * - ظلال ناعمة متعددة المستويات
 * - أحجام تفاعلية موحّدة (touch targets)
 */

export const colors = {
  // نص — هوية سوق غزة الدافئة
  ink: '#1C1917',
  inkSecondary: '#292524',
  muted: '#78716C',
  mutedSoft: '#A8A29E',

  // علامة تجارية: زيتوني غني
  brand: '#2F6B4A',
  brandDark: '#1E4A33',
  brandLight: '#3D8B5E',
  // نص عالي التباين على brandSoft (WCAG AA)
  brandOnSoft: '#1E4A33',
  brandSoft: '#E6F2EB',
  brandSoftActive: '#D0E6D9',
  brandMuted: '#5A9B72',

  // خلفيات: كريمي دافئ نظيف
  canvas: '#FAF9F7',
  canvasElevated: '#F5F3F0',
  surface: '#FFFFFF',
  surfaceSecondary: '#F9F8F6',

  // حدود
  border: '#E7E2DA',
  borderStrong: '#D4CFC6',
  borderSubtle: '#F0EBE3',
  // حدود أوضح لعناصر التحكم
  controlBorder: '#8B9A90',
  focus: '#2F6B4A',
  focusRing: 'rgba(47, 107, 74, 0.28)',

  // Overlays للمحتوى فوق الوسائط
  mediaControlOverlay: 'rgba(255, 255, 255, 0.92)',
  mediaCounterOverlay: 'rgba(0, 0, 0, 0.58)',
  mediaCloseOverlay: 'rgba(0, 0, 0, 0.55)',
  fullscreenBackdrop: 'rgba(0, 0, 0, 0.96)',
  modalBackdrop: 'rgba(28, 25, 23, 0.48)',
  storyProgressTrack: 'rgba(255, 255, 255, 0.32)',
  storyNavigationOverlay: 'rgba(0, 0, 0, 0.28)',

  // تمييز: تيراكوتا دافئة
  accent: '#C45C28',
  accentSoft: '#FBF0EA',
  accentBorder: '#EDD0C0',

  // حالات دلالية
  danger: '#C53030',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerText: '#9B2C2C',

  success: '#2F6B4A',
  successSoft: '#E6F2EB',
  successBorder: '#B8D9C4',
  successText: '#1E4A33',

  info: '#1E4A7A',
  infoSoft: '#EBF3FB',
  infoBorder: '#BFD4ED',
  infoText: '#1A3A5C',

  warning: '#C05621',
  warningText: '#9C4221',
  warningSoft: '#FFFAF0',
  warningBorder: '#FBD38D',

  // ثابت
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  x4l: 48,
  x5l: 64,
  x6l: 80,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 32,
  pill: 999,
  control: 12,
  card: 16,
  modal: 20,
  shell: 20,
  hero: 24,
  button: 14,
  input: 12,
  chip: 20,
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
 * مقياس تايبوغرافي احترافي وهادئ.
 * أوزان مخفّفة لتجنب الإحساس «الصاخب» على الموبايل.
 */
export const typography = {
  display: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 23,
  },
  bodyStrong: {
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 23,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  captionStrong: {
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
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
    letterSpacing: 0.3,
  },
  price: {
    fontSize: 17,
    fontWeight: '700' as const,
    lineHeight: 24,
  },
} as const;

/** ظلال متدرجة ناعمة — بطاقات sm، عناصر مرتفعة md، نوافذ lg */
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  xl: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 28,
    elevation: 12,
  },
} as const;

/** ارتفاعات تفاعلية موحّدة */
export const sizes = {
  touchTarget: 44,
  touchTargetLg: 48,
  inputHeight: 52,
  buttonHeight: 52,
  buttonHeightSm: 40,
  headerHeight: 56,
  bottomNavHeight: 72,
  iconButton: 44,
  iconButtonSm: 36,
  avatarSm: 36,
  avatarMd: 48,
  avatarLg: 64,
  avatarXl: 88,
  chipHeight: 36,
  chipHeightLg: 40,
  cardImageRow: 100,
  cardImageGrid: 148,
  adImageWidth: 120,
  tabBarIcon: 24,
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;

/** ثوابت تجربة المستخدم */
export const ux = {
  minTouch: 44,
  pressedOpacity: 0.72,
  disabledOpacity: 0.42,
  durationFast: 100,
  durationNormal: 200,
  durationSlow: 300,
  durationSpring: 400,
} as const;
