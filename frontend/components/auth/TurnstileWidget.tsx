'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * TURNSTILE-01: Cloudflare Turnstile challenge for the sign-up form.
 * Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured, so it is
 * safe to ship before the key exists. Remount it (change `key`) to get a new
 * token after a failed submit, because tokens are single-use.
 *
 * The widget shows its own status line so the (disabled) submit button is never
 * unexplained: "verifying" while the script/challenge loads, and an error with a
 * retry button if the script fails, times out or the challenge errors.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// A <script> that exists but never fires load/error (blocked after insertion, stalled
// network) would otherwise leave the promise pending forever.
const SCRIPT_TIMEOUT_MS = 8_000;

export const isTurnstileEnabled = Boolean(SITE_KEY);

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

function getApi(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

function loadScript(): Promise<void> {
  if (getApi()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');

    const timer = setTimeout(() => {
      // Drop the stale tag so a retry inserts a fresh one instead of waiting on a dead element.
      script.remove();
      reject(new Error('turnstile script timed out'));
    }, SCRIPT_TIMEOUT_MS);

    script.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    script.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error('turnstile script failed'));
      },
      { once: true },
    );
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

type Status = 'loading' | 'ready' | 'error';

interface TurnstileWidgetProps {
  onToken: (token: string | null) => void;
}

export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!SITE_KEY) return;
    let widgetId: string | undefined;
    let cancelled = false;
    setStatus('loading');
    onTokenRef.current(null);

    const fail = () => {
      if (cancelled) return;
      onTokenRef.current(null);
      setStatus('error');
    };

    loadScript()
      .then(() => {
        const api = getApi();
        if (cancelled) return;
        if (!api || !containerRef.current) { fail(); return; }
        widgetId = api.render(containerRef.current, {
          sitekey: SITE_KEY,
          language: 'ar',
          callback: (token: string) => {
            if (cancelled) return;
            onTokenRef.current(token);
            setStatus('ready');
          },
          // Turnstile refreshes expired tokens itself; until it does, the form must not submit.
          'expired-callback': () => {
            if (cancelled) return;
            onTokenRef.current(null);
            setStatus('loading');
          },
          'error-callback': () => { fail(); },
        });
      })
      .catch(fail);

    return () => {
      cancelled = true;
      if (widgetId) getApi()?.remove(widgetId);
    };
  }, [attempt]);

  if (!SITE_KEY) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={containerRef} className="flex justify-center" />
      {status === 'loading' && (
        <p className="text-sm text-muted-foreground" role="status">
          جارٍ التحقق من المتصفح…
        </p>
      )}
      {status === 'error' && (
        <p className="text-sm text-destructive" role="alert">
          تعذّر تحميل التحقق الأمني.{' '}
          <button
            type="button"
            className="font-bold underline"
            onClick={() => setAttempt((a) => a + 1)}
          >
            إعادة المحاولة
          </button>
        </p>
      )}
    </div>
  );
}
