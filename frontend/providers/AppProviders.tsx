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

interface AppProvidersProps {
  children: React.ReactNode;
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
      position="top-center"
      dir="rtl"
      richColors
      duration={4000}
      closeButton
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
    />
  );
}

export function AppProviders({ children }: AppProvidersProps) {
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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {/* FIX PERF-01: does not block children — runs auth restore in background */}
        <AuthHydrationProvider>
          {children}
        </AuthHydrationProvider>

        <ThemedToaster />

        <PwaBootstrap />

        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
