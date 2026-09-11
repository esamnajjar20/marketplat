import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

// FIX (audit #13): /settings had no page.tsx. It's already in
// middleware.ts's PROTECTED_PREFIXES and every in-app link goes straight
// to ROUTES.settings.profile, but a direct visit to the bare /settings
// URL (bookmark, typed address) 404'd instead of landing anywhere useful.
export default function SettingsRootPage() {
  redirect(ROUTES.settings.profile);
}
