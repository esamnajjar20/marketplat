/** Returns the currently persisted authenticated user id for client-only offline stores. */
export function getCurrentOfflineUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('marketplace-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { user?: { id?: unknown } } };
    return typeof parsed?.state?.user?.id === 'string' ? parsed.state.user.id : null;
  } catch {
    return null;
  }
}
