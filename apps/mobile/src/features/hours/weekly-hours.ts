/** منطق ساعات العمل الأسبوعية المشترك بين المتجر ومقدم الخدمة. */
export type Day = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export type Schedule = { open: string; close: string } | null;
export type WeeklyHours = Record<Day, Schedule>;

export const WEEK_DAYS: ReadonlyArray<{ key: Day; label: string }> = [
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
  { key: 'sat', label: 'السبت' },
];

export const DEFAULT_OPEN = '09:00';
export const DEFAULT_CLOSE = '17:00';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const emptyWeeklyHours = (): WeeklyHours => ({
  sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null,
});

/** يدمج بيانات الخادم (قد تكون ناقصة أو null) فوق أسبوع فارغ. */
export function normalizeWeeklyHours(raw: unknown): WeeklyHours {
  const base = emptyWeeklyHours();
  if (!raw || typeof raw !== 'object') return base;
  for (const { key } of WEEK_DAYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (value && typeof value === 'object') {
      const { open, close } = value as { open?: unknown; close?: unknown };
      if (typeof open === 'string' && typeof close === 'string') base[key] = { open, close };
    }
  }
  return base;
}

export function setDayTime(hours: WeeklyHours, day: Day, field: 'open' | 'close', value: string): WeeklyHours {
  const current = hours[day];
  return {
    ...hours,
    [day]: current
      ? { ...current, [field]: value }
      : { open: field === 'open' ? value : DEFAULT_OPEN, close: field === 'close' ? value : DEFAULT_CLOSE },
  };
}

export function toggleDay(hours: WeeklyHours, day: Day): WeeklyHours {
  return { ...hours, [day]: hours[day] ? null : { open: DEFAULT_OPEN, close: DEFAULT_CLOSE } };
}

/** يعيد رسالة الخطأ العربية الموحدة، أو null إذا كانت الساعات صحيحة. */
export function validateWeeklyHours(hours: WeeklyHours): string | null {
  for (const { key, label } of WEEK_DAYS) {
    const value = hours[key];
    if (value && (!TIME_PATTERN.test(value.open) || !TIME_PATTERN.test(value.close) || value.close <= value.open)) {
      return `تحقق من وقت الفتح والإغلاق ليوم ${label} (صيغة HH:mm).`;
    }
  }
  return null;
}
