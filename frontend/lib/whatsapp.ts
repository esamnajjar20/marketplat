/**
 * WhatsApp deep-link helpers — the single place that normalises Palestinian
 * phone numbers and builds wa.me URLs. Do not hand-build `https://wa.me/...`.
 */

/** Digits only, with the 970 country code (0599… → 970599…). */
export function toWaPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('970')) return digits;
  if (digits.startsWith('0')) return `970${digits.slice(1)}`;
  return digits;
}

/**
 * wa.me link. With no phone the user picks the recipient inside WhatsApp.
 * @example buildWhatsAppUrl({ phone: '0599123456', text: 'مرحبا' })
 */
export function buildWhatsAppUrl(opts: { phone?: string | null; text?: string } = {}): string {
  const phone = toWaPhone(opts.phone);
  const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  return opts.text ? `${base}?text=${encodeURIComponent(opts.text)}` : base;
}
