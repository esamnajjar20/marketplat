'use client';

import type { WorkingHours } from '@/types/service.types';
import { cn } from '@/lib/utils';

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

/** Working hours editor — toggle + time chips matching professional settings mockup. */
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
    <div className="mx-auto max-w-2xl space-y-0 divide-y divide-border/60 rounded-2xl border border-border/70 bg-card p-1 shadow-sm lg:max-w-3xl">
      {DAYS.map(({ key, label }) => {
        const schedule = value[key];
        const enabled = schedule !== null;
        return (
          <div key={key} className="flex items-center gap-3 px-3 py-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${label} — ${enabled ? 'مفتوح' : 'مغلق'}`}
              onClick={() => toggleDay(key, !enabled)}
              className={cn(
                'relative h-7 w-12 shrink-0 rounded-full transition-colors',
                enabled ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                  // logical start works in RTL; when enabled move toward end
                  enabled ? 'start-[calc(100%-1.625rem)]' : 'start-0.5',
                )}
              />
            </button>
            <span className="w-16 shrink-0 text-sm font-bold">{label}</span>
            {enabled && schedule ? (
              <div className="ms-auto flex items-center gap-1.5">
                <input
                  type="time"
                  value={schedule.open}
                  onChange={(e) => setTime(key, 'open', e.target.value)}
                  className="h-9 rounded-xl border border-border/80 bg-background px-2.5 text-sm font-semibold tabular-nums"
                  aria-label={`${label} — وقت الفتح`}
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="time"
                  value={schedule.close}
                  onChange={(e) => setTime(key, 'close', e.target.value)}
                  className="h-9 rounded-xl border border-border/80 bg-background px-2.5 text-sm font-semibold tabular-nums"
                  aria-label={`${label} — وقت الإغلاق`}
                />
              </div>
            ) : (
              <span className="ms-auto text-xs font-medium text-muted-foreground">مغلق</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
