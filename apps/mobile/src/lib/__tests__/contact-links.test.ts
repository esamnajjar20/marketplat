import { describe, expect, it } from 'vitest';
import { telUrl, whatsappUrl } from '../contact-links';

describe('contact links', () => {
  it('keeps phone calls on the supplied dial string', () => {
    expect(telUrl('+970599123456')).toBe('tel:+970599123456');
  });

  it.each([
    ['0599123456', 'https://wa.me/970599123456'],
    ['+970599123456', 'https://wa.me/970599123456'],
    ['970599123456', 'https://wa.me/970599123456'],
  ])('normalizes Palestinian WhatsApp numbers', (phone, expected) => {
    expect(whatsappUrl(phone)).toBe(expected);
  });
});
