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
import { makeQueryClient }     from '@/lib/queryClient';
import { AuthHydrationProvider } from './AuthHydrationProvider';
import { PwaBootstrap }        from '@/components/pwa/PwaBootstrap';

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  // useState ensures QueryClient is not recreated on every render.
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {/* FIX PERF-01: does not block children — runs auth restore in background */}
      <AuthHydrationProvider>
        {children}
      </AuthHydrationProvider>

      <Toaster
        position="top-center"
        dir="rtl"
        richColors
        duration={4000}
        closeButton
      />

      <PwaBootstrap />

      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
