import { getServiceTypeCapabilities, validateServiceTypeCapabilities } from '../../src/modules/service-types/service-types.service';

describe('service type capabilities', () => {
  it('normalizes configured allow-lists', () => {
    expect(getServiceTypeCapabilities({ atCustomer: true, allowedLocations: ['AT_CUSTOMER', 'BAD'] })).toMatchObject({
      atCustomer: true, allowedLocations: ['AT_CUSTOMER'],
    });
  });

  it('rejects unsupported location', () => {
    expect(() => validateServiceTypeCapabilities({ capabilities: { remote: false, atCustomer: true, atProvider: false } }, 'FIXED', 'REMOTE')).toThrow('Remote delivery is not supported');
  });
});
