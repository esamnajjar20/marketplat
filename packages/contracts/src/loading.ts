/**
 * Cross-platform loading contract.
 *
 * The contract owns loading phase names, Arabic copy and timing defaults.
 * Web and React Native keep their native presentation components, but they
 * must consume the same semantic values from this module.
 */
export const LOADING_COPY = {
  default: 'جارٍ التحميل…',
  processing: 'جارٍ التنفيذ…',
  page: 'جارٍ فتح الصفحة…',
  navigating: 'جارٍ الانتقال بين الصفحات',
  navigationStalled: 'تأخر فتح الصفحة. يمكنك إعادة المحاولة.',
  refreshing: 'جارٍ التحديث…',
  loadingMore: 'جارٍ تحميل المزيد…',
  saving: 'جارٍ الحفظ…',
  sending: 'جارٍ الإرسال…',
  deleting: 'جارٍ الحذف…',
  uploading: 'جارٍ الرفع…',
  searching: 'جارٍ البحث…',
} as const;

export type LoadingCopyKey = keyof typeof LOADING_COPY;

/** Semantic operation types shared by buttons, page states and native UI. */
export const LOADING_PHASES = [
  'initial',
  'processing',
  'refreshing',
  'loadingMore',
  'saving',
  'sending',
  'deleting',
  'uploading',
  'searching',
] as const;

export type LoadingPhase = (typeof LOADING_PHASES)[number];

const PHASE_COPY: Record<LoadingPhase, LoadingCopyKey> = {
  initial: 'default',
  processing: 'processing',
  refreshing: 'refreshing',
  loadingMore: 'loadingMore',
  saving: 'saving',
  sending: 'sending',
  deleting: 'deleting',
  uploading: 'uploading',
  searching: 'searching',
};

export function getLoadingLabel(phase: LoadingPhase = 'initial'): string {
  return LOADING_COPY[PHASE_COPY[phase]];
}

/**
 * Shared timing defaults. Presentation can opt into a different value for a
 * specific interaction, but defaults must not be redefined per application.
 */
export const LOADING_TIMING = {
  gateDelayMs: 500,
  minVisibleMs: 500,
  routeFallbackDelayMs: 200,
  navigationStartDelayMs: 120,
  navigationSafetyTimeoutMs: 12_000,
} as const;
