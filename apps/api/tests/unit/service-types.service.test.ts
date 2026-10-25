import { validateServiceTypeCapabilitiesDefinition, getServiceTypeCapabilities, validateServiceTypeCapabilities } from '../../src/modules/service-types/service-types.service';
import { validateServiceTypeFieldDefinition } from '../../src/modules/service-types/service-types.validation';
import { createServiceTypeSchema } from '../../src/modules/service-types/service-types.validation';

describe('service type capabilities', () => {
  it('normalizes configured allow-lists', () => {
    expect(getServiceTypeCapabilities({ atCustomer: true, allowedLocations: ['AT_CUSTOMER', 'BAD'] })).toMatchObject({
      atCustomer: true, allowedLocations: ['AT_CUSTOMER'],
    });
  });

  it('rejects unsupported location', () => {
    expect(() => validateServiceTypeCapabilities({ capabilities: { remote: false, atCustomer: true, atProvider: false } }, 'FIXED', 'REMOTE')).toThrow('Remote delivery is not supported');
  });

  it('rejects contradictory capability configuration', () => {
    expect(() => validateServiceTypeCapabilitiesDefinition({ remote: false, allowedLocations: ['REMOTE'] })).toThrow(
      'REMOTE cannot be allowed when remote is false'
    );
  });

  it('rejects unknown capability keys', () => {
    expect(() => validateServiceTypeCapabilitiesDefinition({ requestQuote: true, typo: true })).toThrow(
      'Unrecognized key'
    );
  });
});

describe('service type field definitions', () => {
  it('requires options for SELECT fields', () => {
    expect(() => validateServiceTypeFieldDefinition({ type: 'SELECT', options: null })).toThrow(
      'SELECT and MULTI_SELECT fields require at least one option'
    );
  });

  it('rejects options on non-select fields', () => {
    expect(() => validateServiceTypeFieldDefinition({ type: 'TEXT', options: [{ value: 'x', labelAr: 'X' }] })).toThrow(
      'Options are only valid for SELECT and MULTI_SELECT fields'
    );
  });

  it('rejects duplicate option values', () => {
    expect(() => validateServiceTypeFieldDefinition({
      type: 'SELECT',
      options: [{ value: 'car', labelAr: 'سيارة' }, { value: 'car', labelAr: 'سيارة ثانية' }],
    })).toThrow('Field option values must be unique');
  });

  it('rejects unknown capability fields at the HTTP schema boundary', () => {
    const result = createServiceTypeSchema.safeParse({
      body: { slug: 'test-type', name: 'Test', nameAr: 'اختبار', capabilities: { foo: true } },
    });
    expect(result.success).toBe(false);
  });
});
