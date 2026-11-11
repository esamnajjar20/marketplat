/**
 * MarketPlat Design Tokens — UI/UX Refresh 2026-11
 * مصدر واحد للألوان، المسافات، الزوايا، الخطوط، والظلال.
 * لا تستخدم قيم hex أو أحجام خطوط مباشرة في الشاشات — مرّ من هنا.
 *
 * تحسين شامل:
 * - لوحة ألوان أدق مع تباين أفضل وعمق بصري
 * - مقياس تايبو أوضح وهدوء أوزان الخط
 * - مسافات أكثر تنفسًا
 * - ظلال ناعمة متعددة المستويات
 * - أحجام تفاعلية موحّدة (touch targets)
 */

export const colors = {
  // نص — هوية سوق غزة الدافئة
  ink: '#241E19',
  inkSecondary: '#4A433A',
  muted: '#6B6459',
  mutedSoft: '#A39E94',

  // علامة تجارية: زيتوني غني
  brand: '#397F56',
  brandDark: '#1F4D33',
  brandLight: '#5E9C73',
  // نص عالي التباين على brandSoft (WCAG AA)
  brandOnSoft: '#1F4D33',
  brandSoft: '#E8F1EC',
  brandSoftActive: '#CFE0D5',
  brandMuted: '#5E9C73',

  // خلفيات: كريمي دافئ نظيف
  canvas: '#FDFCF9',
  canvasElevated: '#FBF9F4',
  surface: '#FFFFFF',
  surfaceSecondary: '#F6F1E7',

  // حدود
  border: '#E7E2DA',
  borderStrong: '#D4CFC6',
  borderSubtle: '#F0EBE3',
  // حدود أوضح لعناصر التحكم
  // 3:1 contrast against white/canvas surfaces for non-text controls.
  controlBorder: '#7E8C82',
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
  accent: '#AD531F',
  accentSoft: '#FBEEE6',
  accentBorder: '#F1D3C0',

  // حالات دلالية
  danger: '#C53030',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerText: '#9B2C2C',

  success: '#397F56',
  successSoft: '#E8F1EC',
  successBorder: '#B8D9C4',
  successText: '#1F4D33',

  info: '#1E4A7A',
  infoSoft: '#EBF3FB',
  infoBorder: '#BFD4ED',
  infoText: '#1A3A5C',

  warning: '#C05621',
  warningText: '#9C4221',
  warningSoft: '#FFFAF0',
  warningBorder: '#FBD38D',

  onBrand: '#FFFFFF',
  onDanger: '#FFFFFF',

  // ثابت
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

/** لوحة ألوان داكنة متوافقة مع مفاتيح الألوان الفاتحة. */
export const darkColors: ColorPalette = {
  ink: '#F3F0EA',
  inkSecondary: '#E4DED4',
  muted: '#B8B0A5',
  mutedSoft: '#91897F',
  brand: '#79BD92',
  brandDark: '#B2DFC0',
  brandLight: '#91CFA6',
  brandOnSoft: '#C6E9D2',
  brandSoft: '#203A2B',
  brandSoftActive: '#2B4B37',
  brandMuted: '#78B78E',
  canvas: '#101512',
  canvasElevated: '#171F1A',
  surface: '#1B241E',
  surfaceSecondary: '#222D26',
  border: '#39463D',
  borderStrong: '#536257',
  borderSubtle: '#2B372F',
  controlBorder: '#829B89',
  focus: '#8ACAA0',
  focusRing: 'rgba(138, 202, 160, 0.30)',
  mediaControlOverlay: 'rgba(25, 31, 27, 0.94)',
  mediaCounterOverlay: 'rgba(0, 0, 0, 0.68)',
  mediaCloseOverlay: 'rgba(0, 0, 0, 0.62)',
  fullscreenBackdrop: 'rgba(0, 0, 0, 0.98)',
  modalBackdrop: 'rgba(0, 0, 0, 0.68)',
  storyProgressTrack: 'rgba(255, 255, 255, 0.32)',
  storyNavigationOverlay: 'rgba(0, 0, 0, 0.36)',
  accent: '#F0A47A',
  accentSoft: '#3B291F',
  accentBorder: '#714B35',
  danger: '#F27676',
  dangerSoft: '#3A2223',
  dangerBorder: '#744143',
  dangerText: '#FFC0C0',
  success: '#86C99A',
  successSoft: '#203A2B',
  successBorder: '#426B4F',
  successText: '#C1E8CC',
  info: '#8CB9E8',
  infoSoft: '#1E3042',
  infoBorder: '#3B5C7A',
  infoText: '#C0DDF8',
  warning: '#F0B36B',
  warningText: '#FFD19A',
  warningSoft: '#3C2D1C',
  warningBorder: '#76572E',
  onBrand: '#173323',
  onDanger: '#2A1212',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
};

export type ColorPalette = { readonly [K in keyof typeof colors]: string };

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

/** أوزان الخط الموحّدة — لا تكتب '600'/'700' حرفيًا في الشاشات. */
export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
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
  20: 20,
  22: 22,
  24: 24,
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
  // Product language aliases for screens that want explicit hierarchy names.
  screenTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 23,
  },
  supporting: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
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
  textareaMinHeight: 128,
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
  // Interactive chips must meet the same 44dp minimum as other controls.
  chipHeight: 44,
  chipHeightLg: 48,
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
