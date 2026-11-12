/**
 * Shape of the Google profile data the app cares about (extracted from
 * Passport's much larger Profile by identity/auth/google.strategy.ts).
 *
 * Lives in shared/ (not in the auth module) so that shared/types/express.d.ts
 * can reference it without shared/ depending on modules/.
 * google.strategy.ts re-exports it, so existing imports keep working.
 */
export interface GoogleProfileData {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}
