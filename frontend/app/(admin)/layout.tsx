/**
 * Admin layout.
 *
 * FIX C-04 / T-08: Role check uses useAuthStore (client-side),
 *                   NOT the JWT payload (which doesn't contain role).
 *                   Middleware provides a first layer of protection via the
 *                   app_user_role cookie; this layout is the second layer.
 *
 * FIX AUTH-04: waits for isAuthResolving to settle (not just isHydrated)
 *              before making any redirect decision — see ProtectedLayout
 *              for the full explanation of the false-logout race this fixes.
 *
 * Non-admin authenticated users → redirect to /dashboard (not /login).
 */
'use client';

import { useEffect }    from 'react';
import { useRouter }    from 'next/navigation';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectIsAdmin,
  selectIsHydrated,
  selectIsAuthResolving,
} from '@/store/auth.store';

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminHeader }  from '@/components/admin/AdminHeader';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAdmin         = useAuthStore(selectIsAdmin);
  const isHydrated      = useAuthStore(selectIsHydrated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  const router          = useRouter();

  const isResolved = isHydrated && !isAuthResolving;

  useEffect(() => {
    if (!isResolved) return;
    if (!isAuthenticated) {
      router.replace('/login?from=/admin');
      return;
    }
    if (!isAdmin) {
      // Authenticated but not admin → silently redirect to dashboard.
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isAdmin, isResolved, router]);

  if (!isResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <div className="flex min-h-screen bg-muted/30">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
