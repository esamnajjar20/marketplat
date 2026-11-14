/**
 * Contact deep-link helpers — the single place that builds `tel:` and
 * `mailto:` URLs (WhatsApp lives in `lib/whatsapp.ts`; USSD dial codes in
 * `lib/paymentStorage.ts#ussdTelHref`). Do not hand-build `tel:`/`mailto:`
 * strings in components. Mirrors `apps/mobile/src/lib/contact-links.ts`.
 */

/**
 * `tel:` link for a phone number. Keeps only digits and a leading `+`
 * so spaces/dashes typed by users never reach the dialer.
 * @example buildTelUrl('059-912 3456') → 'tel:0599123456'
 */
export function buildTelUrl(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return `tel:${raw.startsWith('+') ? '+' : ''}${digits}`;
}

/**
 * `mailto:` link. The address is URI-encoded; an optional subject/body are
 * appended as query parameters.
 * @example buildMailtoUrl('a@b.co', { subject: 'مرحبا' })
 */
export function buildMailtoUrl(
  email: string | null | undefined,
  opts: { subject?: string; body?: string } = {},
): string {
  const address = (email ?? '').trim();
  if (!address) return '';
  const params = new URLSearchParams();
  if (opts.subject) params.set('subject', opts.subject);
  if (opts.body) params.set('body', opts.body);
  const query = params.toString().replace(/\+/g, '%20');
  return `mailto:${encodeURIComponent(address).replace(/%40/g, '@')}${query ? `?${query}` : ''}`;
}
