'use client';

import { memo, useEffect, useState } from 'react';
import { Radio } from 'lucide-react';

interface Props {
  startedAt: number | null;
}

function formatRecordingTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Isolates the 1 Hz recording clock from MessageInput.
 *
 * The composer owns many states (body, uploads, drafts, errors, etc.). A timer
 * update must not re-render that entire tree every second.
 */
export const RecordingTimer = memo(function RecordingTimer({ startedAt }: Props) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (startedAt == null) {
      setSeconds(0);
      return;
    }

    const update = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <div
      className="flex min-h-10 items-center gap-2 rounded-2xl border border-destructive/15 bg-destructive/5 px-2.5 text-xs font-medium tabular-nums text-destructive"
      aria-live="polite"
    >
      <Radio className="h-3.5 w-3.5 animate-pulse" aria-hidden />
      <span className="flex items-end gap-0.5" aria-hidden>
        <i className="h-2 w-0.5 rounded-full bg-current animate-pulse" />
        <i className="h-3.5 w-0.5 rounded-full bg-current animate-pulse [animation-delay:120ms]" />
        <i className="h-2.5 w-0.5 rounded-full bg-current animate-pulse [animation-delay:240ms]" />
      </span>
      <span>{formatRecordingTime(seconds)}</span>
    </div>
  );
});
