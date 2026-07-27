'use client';

import type { WorkingHours } from '@/types/service.types';

interface Props {
  value: WorkingHours;
  onChange: (value: WorkingHours) => void;
}

const DAYS: { key: keyof WorkingHours; label: string }[] = [
  { key: 'sat', label: 'السبت' },
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
];

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';

/**
 * Edits the { sun: {open,close}|null, mon: ..., ... } shape the backend's
 * workingHoursSchema expects verbatim (services-providers.validation.ts) —
 * a day toggled off is sent as null, not omitted or an empty object.
 */
export function WorkingHoursEditor({ value, onChange }: Props) {
  function toggleDay(day: keyof WorkingHours, enabled: boolean) {
    onChange({
      ...value,
      [day]: enabled ? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE } : null,
    });
  }

  function setTime(day: keyof WorkingHours, field: 'open' | 'close', time: string) {
    const current = value[day];
    if (!current) return;
    onChange({ ...value, [day]: { ...current, [field]: time } });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      {DAYS.map(({ key, label }) => {
        const schedule = value[key];
        const enabled = schedule !== null;
        return (
          <div key={key} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex w-24 shrink-0 items-center gap-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => toggleDay(key, e.target.checked)}
              />
              {label}
            </label>
            {enabled ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={schedule.open}
                  onChange={(e) => setTime(key, 'open', e.target.value)}
                  className="rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                  aria-label={`${label} — وقت الفتح`}
                />
                <span className="text-muted-foreground">إلى</span>
                <input
                  type="time"
                  value={schedule.close}
                  onChange={(e) => setTime(key, 'close', e.target.value)}
                  className="rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                  aria-label={`${label} — وقت الإغلاق`}
                />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">مغلق</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
