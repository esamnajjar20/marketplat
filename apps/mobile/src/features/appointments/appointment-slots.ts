export type AppointmentAvailabilityRange = { start: string; end: string };
export type AppointmentSlot = { start: string; end: string; label: string };

const MARKET_TIME_ZONE = 'Asia/Gaza';
const marketDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MARKET_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const marketTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MARKET_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function marketDateKey(value: Date): string {
  const parts = Object.fromEntries(marketDateFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function marketTimeLabel(value: Date): string {
  return marketTimeFormatter.format(value);
}

/** Build selectable one-hour appointments from server-confirmed free ranges.
 * Slots start every 30 minutes and never extend beyond a free range. */
export function buildAppointmentSlots(
  ranges: readonly AppointmentAvailabilityRange[],
  date: string,
  now = Date.now(),
): AppointmentSlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const [year, month, day] = date.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.toISOString().slice(0, 10) !== date) return [];
  const durationMs = 60 * 60 * 1000;
  const stepMs = 30 * 60 * 1000;
  const slots: AppointmentSlot[] = [];
  const seen = new Set<string>();

  for (const range of ranges) {
    const rangeStart = new Date(range.start).getTime();
    const rangeEnd = new Date(range.end).getTime();
    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) continue;

    const firstAlignedStart = Math.ceil(rangeStart / stepMs) * stepMs;
    for (let start = firstAlignedStart; start + durationMs <= rangeEnd && slots.length < 48; start += stepMs) {
      if (start <= now) continue;
      const startDate = new Date(start);
      if (marketDateKey(startDate) !== date) continue;
      const endDate = new Date(start + durationMs);
      if (marketDateKey(endDate) !== date) continue;
      const startIso = startDate.toISOString();
      if (seen.has(startIso)) continue;
      seen.add(startIso);
      slots.push({ start: startIso, end: endDate.toISOString(), label: `${marketTimeLabel(startDate)} – ${marketTimeLabel(endDate)}` });
    }
  }

  return slots.sort((a, b) => a.start.localeCompare(b.start));
}
