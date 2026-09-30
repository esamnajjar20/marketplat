import { redirect } from 'next/navigation';

/**
 * OFFLINE-HUB-01: /settings/sync is now a tab of the merged offline hub.
 * Kept as a thin redirect so bookmarks, push-notification links and old
 * in-flight navigations still land in the right place. Do NOT add this path
 * back to the warming lists: a redirecting route always fails atomic warming
 * (`html-…-redirected`).
 */
export default function LegacyOfflineRoute(): never {
  redirect('/offline?tab=sync');
}
