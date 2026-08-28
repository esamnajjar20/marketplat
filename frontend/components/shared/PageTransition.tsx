'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * PageTransition — a light CSS-only fade between route changes.
 *
 * FIX UX-20: navigation was Next.js's default instant swap with no
 * transition at all, unlike the doc's "page transition خفيف"
 * recommendation. Deliberately not framer-motion or any animation
 * library — matches the rest of the app's minimal-animation posture
 * (tailwindcss-animate + a couple of custom keyframes is the entire
 * existing animation surface, see tailwind.config.ts) and keeps this
 * near-zero bundle cost. A key change on pathname remounts the
 * wrapper, and the CSS animation (registered once in tailwind.config)
 * runs its short fade + slide-up on every mount — no JS-driven timing, no
 * exit animation to coordinate (an exit fade would need the old page
 * to stay mounted during navigation, which reintroduces real
 * complexity for a purely decorative effect).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Avoids the fade running on the very first paint (would show as a
  // flash-of-content on initial load, which isn't what "page
  // transition" is asking for — only actual navigations should fade).
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);

  return (
    <div key={pathname} className={hasMounted ? 'animate-page-fade' : undefined}>
      {children}
    </div>
  );
}
