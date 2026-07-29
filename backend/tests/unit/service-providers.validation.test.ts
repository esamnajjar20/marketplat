import {
  createServiceProviderSchema,
  updateServiceProviderSchema,
  serviceProviderIdSchema,
  nearbyServiceProvidersSchema,
  workingHoursSchema,
} from '../../src/modules/service-providers/service-providers.validation';

const validWorkingHours = {
  sun: { open: '09:00', close: '18:00' },
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
  sat: null,
};

describe('service-providers.validation', () => {
  describe('workingHoursSchema', () => {
    it('accepts a mix of open days and null (closed) days', () => {
      expect(() => workingHoursSchema.parse(validWorkingHours)).not.toThrow();
    });

    it('rejects an open time not in HH:mm format', () => {
      expect(() =>
        workingHoursSchema.parse({ ...validWorkingHours, sun: { open: '9:00', close: '18:00' } })
      ).toThrow();
    });

    it('rejects an hour above 23', () => {
      expect(() =>
        workingHoursSchema.parse({ ...validWorkingHours, sun: { open: '25:00', close: '18:00' } })
      ).toThrow();
    });

    it('requires all seven days to be present', () => {
      const { sat, ...missingSat } = validWorkingHours;
      expect(() => workingHoursSchema.parse(missingSat)).toThrow();
    });
  });

  describe('createServiceProviderSchema', () => {
    const valid = {
      businessName: 'Acme Repairs',
      description: 'We fix things really well',
      serviceAreaCities: ['Gaza'],
      workingHours: validWorkingHours,
      contactPhone: '0599123456',
    };

    it('defaults businessType to INDIVIDUAL when omitted', () => {
      const result = createServiceProviderSchema.parse({ body: valid });
      expect(result.body.businessType).toBe('INDIVIDUAL');
    });

    it('accepts an explicit businessType', () => {
      const result = createServiceProviderSchema.parse({
        body: { ...valid, businessType: 'SMALL_BUSINESS' },
      });
      expect(result.body.businessType).toBe('SMALL_BUSINESS');
    });

    it('rejects an invalid businessType enum value', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, businessType: 'CORPORATION' } })
      ).toThrow();
    });

    it('rejects a businessName shorter than 2 characters', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, businessName: 'A' } })
      ).toThrow();
    });

    it('rejects a businessName longer than 100 characters', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, businessName: 'A'.repeat(101) } })
      ).toThrow();
    });

    it('rejects a description shorter than 10 characters', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, description: 'short' } })
      ).toThrow();
    });

    it('rejects a description longer than 1000 characters', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, description: 'A'.repeat(1001) } })
      ).toThrow();
    });

    it('rejects an empty serviceAreaCities array', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, serviceAreaCities: [] } })
      ).toThrow();
    });

    it('rejects more than 30 serviceAreaCities', () => {
      expect(() =>
        createServiceProviderSchema.parse({
          body: { ...valid, serviceAreaCities: Array.from({ length: 31 }, (_, i) => `City${i}`) },
        })
      ).toThrow();
    });

    it('accepts exactly 30 serviceAreaCities (boundary)', () => {
      expect(() =>
        createServiceProviderSchema.parse({
          body: { ...valid, serviceAreaCities: Array.from({ length: 30 }, (_, i) => `City${i}`) },
        })
      ).not.toThrow();
    });

    it('rejects an invalid logoUrl', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, logoUrl: 'not-a-url' } })
      ).toThrow();
    });

    it('accepts a valid logoUrl', () => {
      const result = createServiceProviderSchema.parse({
        body: { ...valid, logoUrl: 'https://example.com/logo.png' },
      });
      expect(result.body.logoUrl).toBe('https://example.com/logo.png');
    });

    it('rejects a contactPhone shorter than 6 characters', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, contactPhone: '123' } })
      ).toThrow();
    });

    it('rejects latitude out of range', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, latitude: 91 } })
      ).toThrow();
    });

    it('rejects longitude out of range', () => {
      expect(() =>
        createServiceProviderSchema.parse({ body: { ...valid, longitude: -181 } })
      ).toThrow();
    });

    it('accepts valid latitude/longitude', () => {
      const result = createServiceProviderSchema.parse({
        body: { ...valid, latitude: 31.5, longitude: 34.45 },
      });
      expect(result.body.latitude).toBe(31.5);
      expect(result.body.longitude).toBe(34.45);
    });
  });

  describe('updateServiceProviderSchema', () => {
    it('accepts an empty body (all fields optional)', () => {
      expect(() => updateServiceProviderSchema.parse({ body: {} })).not.toThrow();
    });

    it('accepts a partial update of a single field', () => {
      const result = updateServiceProviderSchema.parse({ body: { businessName: 'New Name' } });
      expect(result.body).toEqual({ businessName: 'New Name' });
    });

    it('accepts a valid availabilityStatus', () => {
      const result = updateServiceProviderSchema.parse({ body: { availabilityStatus: 'BUSY' } });
      expect(result.body.availabilityStatus).toBe('BUSY');
    });

    it('rejects an invalid availabilityStatus', () => {
      expect(() =>
        updateServiceProviderSchema.parse({ body: { availabilityStatus: 'ON_BREAK' } })
      ).toThrow();
    });

    it('allows latitude/longitude to be explicitly nulled', () => {
      const result = updateServiceProviderSchema.parse({ body: { latitude: null, longitude: null } });
      expect(result.body.latitude).toBeNull();
      expect(result.body.longitude).toBeNull();
    });

    it('rejects an out-of-range latitude even when optional', () => {
      expect(() => updateServiceProviderSchema.parse({ body: { latitude: 200 } })).toThrow();
    });
  });

  describe('serviceProviderIdSchema', () => {
    it('accepts a non-empty id param', () => {
      expect(() => serviceProviderIdSchema.parse({ params: { id: 'provider-1' } })).not.toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() => serviceProviderIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });

  describe('nearbyServiceProvidersSchema', () => {
    it('requires lat and lng', () => {
      expect(() => nearbyServiceProvidersSchema.parse({ query: {} })).toThrow();
    });

    it('defaults radius to 10 when omitted', () => {
      const result = nearbyServiceProvidersSchema.parse({ query: { lat: '31.5', lng: '34.45' } });
      expect(result.query.radius).toBe(10);
    });

    it('coerces string lat/lng/radius query params to numbers', () => {
      const result = nearbyServiceProvidersSchema.parse({
        query: { lat: '31.5', lng: '34.45', radius: '25' },
      });
      expect(result.query.lat).toBe(31.5);
      expect(result.query.lng).toBe(34.45);
      expect(result.query.radius).toBe(25);
    });

    it('rejects a radius below the 0.5 minimum', () => {
      expect(() =>
        nearbyServiceProvidersSchema.parse({ query: { lat: '31.5', lng: '34.45', radius: '0.1' } })
      ).toThrow();
    });

    it('rejects a radius above the 100 maximum', () => {
      expect(() =>
        nearbyServiceProvidersSchema.parse({ query: { lat: '31.5', lng: '34.45', radius: '101' } })
      ).toThrow();
    });

    it('rejects an out-of-range lat', () => {
      expect(() =>
        nearbyServiceProvidersSchema.parse({ query: { lat: '91', lng: '34.45' } })
      ).toThrow();
    });

    it('rejects an out-of-range lng', () => {
      expect(() =>
        nearbyServiceProvidersSchema.parse({ query: { lat: '31.5', lng: '181' } })
      ).toThrow();
    });

    it('accepts optional page and limit', () => {
      const result = nearbyServiceProvidersSchema.parse({
        query: { lat: '31.5', lng: '34.45', page: '2', limit: '50' },
      });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(50);
    });
  });
});
