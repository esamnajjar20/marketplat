/**
 * Root providers — wraps the entire application.
 *
 * FIX PERF-01: AuthHydrationProvider no longer blocks children.
 *              Public pages render immediately; only protected/admin
 *              layouts show a skeleton while auth resolves.
 */
'use client';

import { useState }        from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools }  from '@tanstack/react-query-devtools';
import { Toaster }             from 'sonner';
import { useTheme }            from 'next-themes';
import { makeQueryClient }     from '@/lib/queryClient';
import { AuthHydrationProvider } from './AuthHydrationProvider';
import { ThemeProvider }       from './ThemeProvider';
import { PwaBootstrap }        from '@/components/pwa/PwaBootstrap';
import { CapacitorBootstrap }  from '@/components/pwa/CapacitorBootstrap';
import { PageViewTracker }     from '@/components/shared/PageViewTracker';
import { PresenceHeartbeat }   from '@/components/shared/PresenceHeartbeat';
import { NetworkStatusBanner } from '@/components/shared/NetworkStatusBanner';
import { NotificationToasts }  from '@/components/notifications/NotificationToasts';
import { GlobalSearchShortcut } from '@/components/shared/GlobalSearchShortcut';
import { NavigationProgress } from '@/components/shared/NavigationProgress';
import { BackgroundRefetchIndicator } from '@/components/shared/BackgroundRefetchIndicator';

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
      position="bottom-center"
      dir="rtl"
      richColors
      duration={4000}
      closeButton
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      offset="max(1rem, env(safe-area-inset-bottom))"
    />
  );
}

export function AppProviders({ children, nonce }: AppProvidersProps) {
  // useState ensures QueryClient is not recreated on every render.
  const [queryClient] = useState(() => makeQueryClient());

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
        {/* NEW — no-op outside the Capacitor native shell, see its own header. */}
        <CapacitorBootstrap />

        {/* Gap #7 (product analytics): see PageViewTracker.tsx's own
            header for why this is mounted here rather than per-page. */}
        <PageViewTracker />

        {/* Chat presence heartbeat — see PresenceHeartbeat.tsx's own
            header; same mount-once, no-props posture as the two above. */}
        <PresenceHeartbeat />

        <NavigationProgress />
        <BackgroundRefetchIndicator />

        <NetworkStatusBanner />

        {/* Critical notification toasts — still poll-based, no WS. */}
        <NotificationToasts />

        {/* DESKTOP-AUDIT-03: Ctrl/Cmd+K quick-search — see the
            component's own header for the full rationale. No props,
            no visible output, same mount-once posture as the trackers
            above. */}
        <GlobalSearchShortcut />

        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
