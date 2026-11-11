'use client';

import { useEffect, useState } from 'react';
import {
  handleChunkLoadError,
  isChunkLoadError,
  isOfflineChunkLoadError,
  reportClientError,
} from '@/lib/errorReporter';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary — Next.js App Router special filename.
 *
 * `global-error.tsx` is the only boundary allowed (and required) to render its
 * own <html>/<body>: it replaces the root layout entirely when triggered. A
 * sibling `app/error.tsx` handles ordinary in-tree errors and intentionally
 * does NOT render <html>/<body>.
 *
 * Because this boundary fires when the root layout itself failed, the app's
 * stylesheet, fonts, theme provider and shared components may all be missing
 * (for example when a deploy rotated the CSS/JS chunks). So this screen is
 * deliberately self-contained: inline CSS only (light/dark via
 * prefers-color-scheme), a plain <button>, and no imports from the UI kit.
 *
 * SEC-06: error.message is never rendered — only the opaque digest, which is
 * safe to show as a support reference.
 */
const STYLES = `
  :root { color-scheme: light dark; }
  body.ge-body {
    margin: 0;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 2rem;
    text-align: center;
    font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif;
    background: #fafaf7;
    color: #1c1f1d;
  }
  .ge-icon { font-size: 3.5rem; line-height: 1; }
  .ge-title { margin: 0; font-size: 1.5rem; font-weight: 600; }
  .ge-text { margin: 0; max-width: 24rem; font-size: 0.9375rem; line-height: 1.7; color: #5b625e; }
  .ge-code {
    padding: 0.25rem 0.625rem;
    border-radius: 0.375rem;
    background: #ecece6;
    color: #5b625e;
    font-size: 0.8125rem;
  }
  .ge-btn {
    min-height: 2.75rem;
    padding: 0.5rem 1.5rem;
    border: 0;
    border-radius: 0.5rem;
    background: #2f5d45;
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .ge-btn:hover { background: #274d39; }
  .ge-btn:focus-visible { outline: 2px solid #56b381; outline-offset: 2px; }
  @media (prefers-color-scheme: dark) {
    body.ge-body { background: #121513; color: #eceee9; }
    .ge-text, .ge-code { color: #a9b0ab; }
    .ge-code { background: #222724; }
    .ge-btn { background: #56b381; color: #0e1411; }
    .ge-btn:hover { background: #6cc294; }
  }
`;

export default function GlobalError({ error, reset }: ErrorPageProps) {
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    // A stale chunk reference (cached HTML pointing at JS chunks that rotated
    // in a recent deploy) is auto-recovered with a single hard reload — the
    // same recovery app/error.tsx performs.
    if (handleChunkLoadError(error)) {
      setRecovering(true);
      return;
    }
    // error.digest lets this client-side report be correlated with the
    // server-side log entry for the same error.
    if (!isOfflineChunkLoadError(error)) {
      reportClientError(error, { boundary: 'GlobalError', digest: error.digest });
    }
  }, [error]);

  const chunkFailed = isChunkLoadError(error);

  return (
    <html lang="ar" dir="rtl">
      <head>
        <title>حدث خطأ غير متوقع</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body className="ge-body">
        {recovering ? (
          <p className="ge-text" role="status">جاري تحديث الصفحة…</p>
        ) : (
          <div role="alert" style={{ display: 'contents' }}>
            <span className="ge-icon" aria-hidden="true">⚠️</span>
            <h1 className="ge-title">حدث خطأ غير متوقع</h1>
            <p className="ge-text">
              {chunkFailed
                ? 'تعذّر تحميل ملفات هذه الصفحة. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.'
                : 'يرجى المحاولة مرة أخرى. إذا استمر الخطأ، تواصل مع الدعم الفني.'}
            </p>
            {error.digest && <code className="ge-code">رمز الخطأ: {error.digest}</code>}
            {/* reset() only re-renders and can keep hitting the same failed
                chunk; a full reload re-requests it. */}
            <button
              type="button"
              className="ge-btn"
              onClick={chunkFailed ? () => window.location.reload() : reset}
            >
              حاول مجدداً
            </button>
          </div>
        )}
      </body>
    </html>
  );
}
