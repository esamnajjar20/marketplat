/**
 * Restrict post-auth navigation to a local app route. Deep links and externally
 * supplied redirect parameters must never be handed to the native router.
 */
export function getSafeAuthRedirect(
  value: string | string[] | undefined,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    typeof candidate !== 'string' ||
    candidate.length < 2 ||
    candidate.length > 2_048 ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001f\u007f<>]/.test(candidate)
  ) return null;

  const pathname = candidate.split(/[?#]/, 1)[0];
  if (pathname === '/login' || pathname === '/register' || pathname.startsWith('/login/') || pathname.startsWith('/register/')) {
    return null;
  }
  return candidate;
}
