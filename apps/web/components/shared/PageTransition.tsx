'use client';

/**
 * PageTransition — intentionally keeps route changes immediate.
 * Route-level loading indicators and decorative page fades are disabled
 * so navigation does not flash or suggest an extra loading phase.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
