/**
 * AuthDivider — the "──── أو ────" separator between the primary submit
 * button and GoogleAuthButton.
 *
 * AUDIT-FIX auth-duplication: LoginForm and RegisterForm each inlined
 * the exact same six lines (divider line + centered "أو" span) with
 * zero differences between them. Extracted once so any future visual
 * change to the separator doesn't need to be made in two places again.
 */
export function AuthDivider() {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-card px-2 text-muted-foreground">أو</span>
      </div>
    </div>
  );
}
