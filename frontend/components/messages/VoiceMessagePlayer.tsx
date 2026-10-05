'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { Play, Pause, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  src: string;
  /** 'mine' = on primary-colored bubble (light controls), 'theirs' = on card (dark controls). */
  variant?: 'mine' | 'theirs';
  className?: string;
  /** Called once when the source fails to load/decode (e.g. offline cache write). */
  onError?: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Compact voice-message player: play/pause, seekable progress bar, current /
 * total time, and a loading spinner. Deliberately replaces the native
 * <audio controls> element whose 60px minimum width and rounded grey chrome
 * looked out of place inside chat bubbles and collapsed on some Android
 * browsers.
 */
export function VoiceMessagePlayer({ src, variant = 'theirs', className, onError }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setCurrent(0);
    setLoading(true);
    setError(false);
  }, [src]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || error) return;
    if (playing) {
      el.pause();
    } else {
      void el.play().catch(() => {
        setError(true);
        onError?.();
      });
    }
  }, [playing, error, onError]);

  const seekAt = useCallback(
    (clientX: number, track: HTMLDivElement) => {
      const el = audioRef.current;
      if (!el || !duration || error) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      el.currentTime = ratio * duration;
      setCurrent(ratio * duration);
    },
    [duration, error],
  );

  const onClick = (e: MouseEvent<HTMLDivElement>) => seekAt(e.clientX, e.currentTarget);
  const onTouch = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (t) seekAt(t.clientX, e.currentTarget);
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const isMine = variant === 'mine';

  const buttonClass = isMine
    ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground'
    : 'bg-primary/10 hover:bg-primary/20 text-primary';
  const timeColor = isMine ? 'text-primary-foreground/75' : 'text-muted-foreground';
  const trackBg = isMine ? 'bg-primary-foreground/25' : 'bg-muted';
  const fillBg = isMine ? 'bg-primary-foreground' : 'bg-primary';

  return (
    <div className={cn('flex w-56 max-w-full items-center gap-2.5', className)} dir="ltr">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
          setLoading(false);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onError={() => {
          setLoading(false);
          setError(true);
          onError?.();
        }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
      />
      <button
        type="button"
        onClick={toggle}
        disabled={error}
        aria-label={playing ? 'إيقاف التسجيل' : 'تشغيل التسجيل'}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
          buttonClass,
          error && 'cursor-not-allowed opacity-50',
        )}
      >
        {error ? (
          <AlertTriangle className="h-4 w-4" />
        ) : loading && !playing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" fill="currentColor" />
        ) : (
          <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          aria-label="موضع التشغيل"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          tabIndex={0}
          onClick={onClick}
          onTouchStart={onTouch}
          onKeyDown={(e) => {
            const el = audioRef.current;
            if (!el || !duration) return;
            if (e.key === 'ArrowRight') {
              el.currentTime = Math.min(duration, el.currentTime + 2);
              setCurrent(el.currentTime);
            } else if (e.key === 'ArrowLeft') {
              el.currentTime = Math.max(0, el.currentTime - 2);
              setCurrent(el.currentTime);
            }
          }}
          className="cursor-pointer py-1.5 focus-visible:outline-none"
        >
          <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full', trackBg)}>
            <div
              className={cn('absolute inset-y-0 left-0 rounded-full', fillBg)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className={cn('flex items-center justify-between text-[10px] font-medium tabular-nums', timeColor)}>
          <span>{formatTime(current)}</span>
          <span>{error ? 'فشل التحميل' : formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
