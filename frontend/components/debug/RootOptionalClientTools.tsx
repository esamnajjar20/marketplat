'use client';

import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/auth.store';

// Keep developer/debug surfaces out of the shared application entry chunk.
// Each module is requested only after its corresponding gate becomes true.
const AdminScriptConsole = dynamic(
  () => import('./AdminScriptConsole').then((module) => module.AdminScriptConsole),
  { ssr: false, loading: () => null },
);

const FloatingDebugConsole = dynamic(
  () => import('@/components/shared/FloatingDebugConsole'),
  { ssr: false, loading: () => null },
);

const ErudaDebug =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () => import('./ErudaDebug').then((module) => module.ErudaDebug),
        { ssr: false, loading: () => null },
      )
    : null;

interface RootOptionalClientToolsProps {
  floatingConsoleEnabled?: boolean;
}

/**
 * Root-level lazy gate. Admin tooling is not downloaded for guest/member
 * sessions; the floating console is downloaded only when middleware enables
 * the explicit debug header; Eruda exists only in development builds.
 */
export function RootOptionalClientTools({
  floatingConsoleEnabled = false,
}: RootOptionalClientToolsProps) {
  const isAdmin = useAuthStore((state) =>
    state.isHydrated &&
    !state.isAuthResolving &&
    state.isAuthenticated &&
    (state.user?.role === 'ADMIN' || state.user?.role === 'SUPER_ADMIN'),
  );

  return (
    <>
      {isAdmin ? <AdminScriptConsole /> : null}
      {floatingConsoleEnabled ? <FloatingDebugConsole /> : null}
      {ErudaDebug ? <ErudaDebug /> : null}
    </>
  );
}
