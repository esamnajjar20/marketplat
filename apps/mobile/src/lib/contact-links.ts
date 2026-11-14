/** Single place that builds tel: / WhatsApp URLs (mirrors frontend/lib/whatsapp.ts). */
export function telUrl(phone: string): string {
  return `tel:${phone}`;
}

export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/^\+/, '')}`;
}
