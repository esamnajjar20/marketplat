/**
 * فاصل «أو» بين زر الإرسال وزر Google.
 */
export function AuthDivider() {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-[var(--legacy-border)]" />
      </div>
      <div className="relative flex justify-center text-[12px]">
        <span className="bg-card px-3 text-[var(--legacy-muted-soft)]">أو</span>
      </div>
    </div>
  );
}
