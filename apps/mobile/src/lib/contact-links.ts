/** Single place that builds tel: / WhatsApp URLs (mirrors frontend/lib/whatsapp.ts). */
export function telUrl(phone: string): string {
  return `tel:${phone}`;
}

export function whatsappUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Match the web contract: Palestinian local mobile numbers (05...)
  // are normalized to the international 970 country code before wa.me.
  const international = digits.startsWith('970')
    ? digits
    : digits.startsWith('0')
      ? `970${digits.slice(1)}`
      : digits;
  return international ? `https://wa.me/${international}` : 'https://wa.me/';
}
