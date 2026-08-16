import { BadgeCheck } from 'lucide-react';

/**
 * Shared "verified" badge overlay for profile/store/provider avatars.
 *
 * Uses `end-0` (CSS logical property), not `right-0`, so positioning
 * stays correct if this app ever supports LTR locales — same fix
 * class as UX-07 (MobileNav) and UX-09 (ProtectedSidebar).
 */
export function VerifiedBadge() {
  return (
    <div className="absolute bottom-0 end-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-background shadow-sm">
      <BadgeCheck className="h-3.5 w-3.5 text-primary-foreground" />
    </div>
  );
}
