/**
 * MarketPlat Design Tokens
 * مصدر واحد للألوان، المسافات، الزوايا، الخطوط، والظلال.
 * لا تستخدم قيم hex أو أحجام خطوط مباشرة في الشاشات — مرّ من هنا.
 */

export const colors = {
  // نص
  ink: '#172033',
  muted: '#6B7280',
  // علامة تجارية
  brand: '#176B5B',
  brandDark: '#105447',
  brandSoft: '#E7F4F0',
  brandSoftActive: '#D4EDE5',
  // خلفيات
  canvas: '#F5F7F8',
  surface: '#FFFFFF',
  // حدود
  border: '#E4E8EC',
  borderStrong: '#C8E2DA',
  // تمييز
  accent: '#F4B942',
  // حالات
  danger: '#B42318',
  dangerSoft: '#FCE8E6',
  dangerBorder: '#F5C2BE',
  success: '#176B5B',
  successSoft: '#E7F4F0',
  successBorder: '#C8E2DA',
  info: '#1D4E89',
  infoSoft: '#EAF2FB',
  infoBorder: '#C6DAF1',
  warning: '#B54708',
  warningSoft: '#FEF4E6',
  warningBorder: '#F7D9A8',
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
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

/** أحجام وأوزان الخط — RTL-first (textAlign يُضبط في المكوّنات) */
export const typography = {
  display: {
    fontSize: 28,
    fontWeight: '900' as const,
    lineHeight: 36,
  },
  title: {
    fontSize: 19,
    fontWeight: '800' as const,
    lineHeight: 26,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '800' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  bodyStrong: {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  captionStrong: {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 18,
  },
  button: {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
  },
  overline: {
    fontSize: 11,
    fontWeight: '700' as const,
    lineHeight: 16,
  },
} as const;

/** ظلال خفيفة للبطاقات والعناصر المرتفعة */
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#172033',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#172033',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

/** ارتفاعات تفاعلية موحّدة */
export const sizes = {
  touchTarget: 44,
  inputHeight: 54,
  buttonHeight: 54,
  headerHeight: 56,
  bottomNavHeight: 64,
  iconButton: 44,
  avatarSm: 36,
  avatarMd: 48,
  avatarLg: 64,
  chipHeight: 32,
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;

/** ثوابت تجربة المستخدم — أهداف لمس، شفافية الضغط، مدد الحركة */
export const ux = {
  /** الحد الأدنى الموصى به لمنطقة اللمس (إرشادات Apple/Material) */
  minTouch: 44,
  pressedOpacity: 0.72,
  disabledOpacity: 0.45,
  /** مدد تقريبية للتوثيق / Animated لاحقاً */
  durationFast: 120,
  durationNormal: 220,
  durationSlow: 320,
} as const;
