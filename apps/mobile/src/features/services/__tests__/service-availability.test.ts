import { describe, expect, it } from 'vitest';
import { canRequestService, serviceAvailabilityLabel } from '../service-availability';

describe('service availability presentation', () => {
  it.each([
    ['AVAILABLE', 'متاح الآن'],
    ['BUSY', 'مشغول حاليًا'],
    ['UNAVAILABLE', 'غير متاح حاليًا'],
    [undefined, 'حالة التوفر غير محددة'],
  ] as const)('maps %s to an explicit label', (status, label) => {
    expect(serviceAvailabilityLabel(status)).toBe(label);
  });

  it('blocks new service requests only when the provider is explicitly unavailable', () => {
    expect(canRequestService('AVAILABLE')).toBe(true);
    expect(canRequestService('BUSY')).toBe(true);
    expect(canRequestService('UNAVAILABLE')).toBe(false);
    expect(canRequestService(undefined)).toBe(true);
  });
});
