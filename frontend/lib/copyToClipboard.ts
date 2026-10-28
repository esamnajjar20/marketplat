/** Copy text in secure and non-secure browser contexts with a legacy fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text || typeof text !== 'string') return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API may be denied by permissions or unavailable in a WebView.
    }
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  const previousFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.insetInlineStart = '-9999px';
  document.body.appendChild(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    try {
      previousFocus?.focus({ preventScroll: true });
    } catch {
      // Restoring focus is best-effort and must not change copy outcome.
    }
  }
}
