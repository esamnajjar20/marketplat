import { describe, expect, it } from 'vitest';
import { formatPrice, formatServicePrice } from '../homeFormatters';
import type { ServiceListing } from '@/features/services/services.api';

describe('home listing price formatters', () => {
  it('uses the contact label for missing ad prices', () => {
    expect(formatPrice(null)).toBe('السعر عند التواصل');
    expect(formatPrice('')).toBe('السعر عند التواصل');
  });

  it('preserves non-numeric ad price labels rather than rendering NaN', () => {
    expect(formatPrice('Call for price')).toBe('Call for price');
  });

  it('formats numeric ad prices as localized currency', () => {
    const formatted = formatPrice('125.5');
    expect(formatted).toContain('125');
    expect(formatted).not.toContain('NaN');
  });

  it('uses negotiated pricing text for negotiable or unpriced services', () => {
    const base = { pricingType: 'NEGOTIABLE', price: 100 } as ServiceListing;
    expect(formatServicePrice(base)).toBe('السعر عند الاتفاق');
    expect(formatServicePrice({ ...base, pricingType: 'FIXED', price: null })).toBe('السعر عند الاتفاق');
  });

  it('adds the starting-from suffix only for STARTING_FROM pricing', () => {
    const base = { pricingType: 'STARTING_FROM', price: 75 } as ServiceListing;
    expect(formatServicePrice(base)).toContain('وما فوق');
    expect(formatServicePrice({ ...base, pricingType: 'FIXED' })).not.toContain('وما فوق');
  });

  it('falls back for malformed service prices', () => {
    const service = { pricingType: 'FIXED', price: 'not-a-number' } as unknown as ServiceListing;
    expect(formatServicePrice(service)).toBe('السعر عند الاتفاق');
  });
});
