'use client';

import { useAuthStore, selectUser } from '@/store/auth.store';
import { useMounted } from '@/hooks/useMounted';

/**
 * True when the signed-in user is `userId`.
 * Gated on `mounted` so the first client render matches the server HTML
 * (the persisted auth store is already filled on the first client render).
 * Used to avoid rendering owner-less "contact" UI (e.g. the mobile sticky bar)
 * when the viewer is the owner — MessageUserButtonGate returns null in that
 * case, which used to leave an empty white bar pinned above the bottom nav.
 */
export function useIsSelf(userId: string | null | undefined): boolean {
  const mounted = useMounted();
  const currentUser = useAuthStore(selectUser);
  return Boolean(mounted && userId && currentUser?.id === userId);
}
