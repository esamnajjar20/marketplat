/**
 * Root providers — wraps the entire application.
 *
 * FIX PERF-01: AuthHydrationProvider no longer blocks children.
 *              Public pages render immediately; only protected/admin
 *              layouts show a skeleton while auth resolves.
 */
'use client';

import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster }             from 'sonner';
import { useTheme }            from 'next-themes';
import { makeQueryClient }     from '@/lib/queryClient';
import { AuthHydrationProvider } from './AuthHydrationProvider';
import { ThemeProvider }       from './ThemeProvider';
import { PwaBootstrap }        from '@/components/pwa/PwaBootstrap';
import { OfflineBootstrap }    from '@/components/pwa/OfflineBootstrap';
import dynamic from 'next/dynamic';

// SLOW-NET phase3: Capacitor APIs stay out of the default web chunk
const CapacitorBootstrap = dynamic(
  () =>
    import('@/components/pwa/CapacitorBootstrap').then((m) => m.CapacitorBootstrap),
  { ssr: false },
);

// RQ-DEVTOOLS-DYNAMIC-01: ReactQueryDevtools used to be a top-level
// static import, guarded by `process.env.NODE_ENV === 'development'`
// at the JSX level. That guard runs at build time (the env var is
// replaced by the literal 'production'/'development' string), so the
// JSX block was correctly dead-code-eliminated in production — but
// the static IMPORT above it was not. @tanstack/react-query-devtools
// has side effects webpack can't safely tree-shake away, so ~150KB
// gzipped was shipped in every production bundle for a component that
// never rendered. On Gaza's mobile networks that's a real cost.
//
// A ternary keyed off the same NODE_ENV is what actually lets the
// bundler drop it: in production the expression evaluates to
// `false ? dynamic(...) : null` = `null`, the dynamic call is
// unreachable, and webpack omits the resulting chunk entirely.
const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () => import('@tanstack/react-query-devtools').then((m) => m.ReactQueryDevtools),
        { ssr: false },
      )
    : null;
import { PageViewTracker }     from '@/components/shared/PageViewTracker';
import { PresenceHeartbeat }   from '@/components/shared/PresenceHeartbeat';
import { ProfileCompletionGate } from '@/components/auth/ProfileCompletionGate';
import { NetworkStatusBanner } from '@/components/shared/NetworkStatusBanner';
import { NotificationToasts }  from '@/components/notifications/NotificationToasts';
import { GlobalSearchShortcut } from '@/components/shared/GlobalSearchShortcut';
import { AnalyticsConsentBanner } from '@/components/shared/AnalyticsConsentBanner';
import { NavigationProgress } from '@/components/shared/NavigationProgress';
import { installGlobalErrorHandlers } from '@/lib/globalErrorHandlers';
import { restoreOfflineQueryCache, subscribeOfflineQueryCache, persistOfflineQueryCache } from '@/lib/offlineQueryCache';

interface AppProvidersProps {
  children: React.ReactNode;
  // FIX CSP-02: forwarded from the root layout (which reads it back out
  // of the x-nonce request header middleware set) down to ThemeProvider,
  // so next-themes can nonce its pre-hydration inline theme script. See
  // app/layout.tsx's FIX CSP-02 comment for the full explanation.
  nonce?: string;
}

/**
 * FIX UX-03 (cont.): Toaster's `richColors` styling was always drawn
 * from sonner's light palette regardless of the app's own theme —
 * harmless while dark mode was unreachable, but now that it's a real
 * option, an unthemed Toaster is the one surface left that wouldn't
 * follow. Split into its own child of ThemeProvider (rather than
 * called directly inside AppProviders) purely so it can call
 * useTheme() — that hook only works below ThemeProvider in the tree.
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      // FIX NOTIF-TOAST-POSITION: was "bottom-center" with a
      // safe-area-inset-bottom offset, which is a mobile-friendly
      // choice for a generic toast but the wrong one for this app.
      // The push/SSE-driven "new message" / "new offer" notifications
      // land here (via NotificationToasts' toast() calls), and on a
      // phone they were appearing underneath whatever the user was
      // reading — frequently under the on-screen keyboard when a
      // chat input was open, so they were missed entirely. The
      // inline Toaster in components/shared/feedback/Toaster.tsx
      // already defaults to top-center; this override was silently
      // winning. Now top-center as well, with a top-safe-area-aware
      // offset so it clears the notch/status bar.
      position="top-center"
      dir="rtl"
      richColors
      duration={4000}
      closeButton
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      offset="max(1rem, env(safe-area-inset-top))"
    />
  );
}

export function AppProviders({ children, nonce }: AppProvidersProps) {
  // useState ensures QueryClient is not recreated on every render.
  const [queryClient] = useState(() => makeQueryClient());

  // FIX GLOBAL-ERROR-LISTENERS-01: install window.onerror +
  // window.onunhandledrejection handlers on first mount. Those catch
  // the error classes React error boundaries cannot — throws in event
  // handlers, timer callbacks, un-caught promise chains, and errors in
  // non-React modules — and route them through the same
  // reportClientError() pipeline the error.tsx boundaries already use.
  // The installer is idempotent, so React StrictMode's double-mount in
  // dev is a no-op on the second pass.
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  // Restore safe public query snapshots without blocking initial rendering.
  // Restore only fills missing/older entries, so it cannot overwrite fresher data.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void restoreOfflineQueryCache(queryClient).then(() => {
      if (cancelled) return;
      unsubscribe = subscribeOfflineQueryCache(queryClient);
      void persistOfflineQueryCache(queryClient);
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [queryClient]);

  return (
    // FIX UX-03: ThemeProvider existed as a standalone wrapper around
    // next-themes since early on, but was never actually mounted here
    // — the .dark CSS variables in globals.css, Tailwind's
    // darkMode: 'class' config, and the next-themes dependency itself
    // were all in place with no code path that ever added/removed the
    // .dark class. attribute="class" matches Tailwind's config;
    // defaultTheme="system" respects the OS/browser preference on
    // first visit rather than forcing light; enableSystem keeps that
    // preference live if the OS setting changes later.
    // FIX CSP-02: nonce forwarded to next-themes' pre-hydration inline
    // script (see AppProvidersProps.nonce doc comment above).
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
      <QueryClientProvider client={queryClient}>
        {/* FIX PERF-01: does not block children — runs auth restore in background */}
        <AuthHydrationProvider>
          {children}
        </AuthHydrationProvider>

        <ThemedToaster />

        <PwaBootstrap />
        {/* PLAN-runtime-separation (مرحلة 2/6): استُخرج من PwaBootstrap —
            نفس مكان التركيب، نفس السلوك، مكوّن منفصل. يُركَّب مباشرة بعد
            PwaBootstrap للحفاظ على نفس ترتيب التنفيذ التقريبي السابق
            (registerServiceWorker قبل بدء عمليات الـ warming). */}
        <OfflineBootstrap />
        {/* NEW — no-op outside the Capacitor native shell, see its own header. */}
        <CapacitorBootstrap />

        {/* Gap #7 (product analytics): see PageViewTracker.tsx's own
            header for why this is mounted here rather than per-page. */}
        <PageViewTracker />
        <AnalyticsConsentBanner />

        {/* Chat presence heartbeat — see PresenceHeartbeat.tsx's own
            header; same mount-once, no-props posture as the two above. */}
        <PresenceHeartbeat />

        {/* FEAT-GOOGLE-COMPLETE-PROFILE: see the component's own
            header for why this is a client-side redirect rather than
            an Edge middleware rule. */}
        <ProfileCompletionGate />

        <NavigationProgress />

        <NetworkStatusBanner />

        {/* Critical notification toasts — still poll-based, no WS. */}
        <NotificationToasts />

        {/* DESKTOP-AUDIT-03: Ctrl/Cmd+K quick-search — see the
            component's own header for the full rationale. No props,
            no visible output, same mount-once posture as the trackers
            above. */}
        <GlobalSearchShortcut />

        {/* RQ-DEVTOOLS-DYNAMIC-01: the const above is already null in
            production, so the guard lives in the declaration instead
            of being duplicated here. */}
        {ReactQueryDevtools && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
