import {
  createAppointmentSchema,
  updateAppointmentStatusSchema,
  availabilitySchema,
  getAppointmentsSchema,
  appointmentIdSchema,
} from '../../src/modules/appointments/appointments.validation';

describe('appointments.validation', () => {
  describe('createAppointmentSchema', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const futureEnd = new Date(future.getTime() + 60 * 60 * 1000);

    it('accepts a valid future appointment window', () => {
      const result = createAppointmentSchema.parse({
        body: { scheduledStart: future.toISOString(), scheduledEnd: futureEnd.toISOString() },
      });
      expect(result.body.scheduledStart).toBeInstanceOf(Date);
      expect(result.body.scheduledEnd).toBeInstanceOf(Date);
    });

    it('accepts an optional requestId and notes', () => {
      const result = createAppointmentSchema.parse({
        body: {
          requestId: 'req-1',
          scheduledStart: future.toISOString(),
          scheduledEnd: futureEnd.toISOString(),
          notes: 'Please call before arriving',
        },
      });
      expect(result.body.requestId).toBe('req-1');
      expect(result.body.notes).toBe('Please call before arriving');
    });

    it('rejects when scheduledEnd is before scheduledStart', () => {
      expect(() =>
        createAppointmentSchema.parse({
          body: { scheduledStart: futureEnd.toISOString(), scheduledEnd: future.toISOString() },
        })
      ).toThrow(/scheduledEnd must be after scheduledStart/);
    });

    it('rejects when scheduledEnd equals scheduledStart', () => {
      expect(() =>
        createAppointmentSchema.parse({
          body: { scheduledStart: future.toISOString(), scheduledEnd: future.toISOString() },
        })
      ).toThrow(/scheduledEnd must be after scheduledStart/);
    });

    it('rejects when scheduledStart is in the past', () => {
      const past = new Date(Date.now() - 60 * 60 * 1000);
      const pastEnd = new Date(Date.now() - 30 * 60 * 1000);
      expect(() =>
        createAppointmentSchema.parse({
          body: { scheduledStart: past.toISOString(), scheduledEnd: pastEnd.toISOString() },
        })
      ).toThrow(/scheduledStart must be in the future/);
    });

    it('rejects notes longer than 500 characters', () => {
      expect(() =>
        createAppointmentSchema.parse({
          body: {
            scheduledStart: future.toISOString(),
            scheduledEnd: futureEnd.toISOString(),
            notes: 'x'.repeat(501),
          },
        })
      ).toThrow();
    });

    it('accepts notes at exactly the 500 character boundary', () => {
      const result = createAppointmentSchema.parse({
        body: {
          scheduledStart: future.toISOString(),
          scheduledEnd: futureEnd.toISOString(),
          notes: 'x'.repeat(500),
        },
      });
      expect(result.body.notes).toHaveLength(500);
    });
  });

  describe('updateAppointmentStatusSchema', () => {
    it('accepts each valid status value', () => {
      for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW']) {
        const result = updateAppointmentStatusSchema.parse({
          params: { id: 'appt-1' },
          body: { status },
        });
        expect(result.body.status).toBe(status);
      }
    });

    it('rejects an invalid status value', () => {
      expect(() =>
        updateAppointmentStatusSchema.parse({ params: { id: 'appt-1' }, body: { status: 'SCHEDULED' } })
      ).toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() =>
        updateAppointmentStatusSchema.parse({ params: { id: '' }, body: { status: 'COMPLETED' } })
      ).toThrow();
    });
  });

  describe('appointmentIdSchema', () => {
    it('accepts a non-empty id', () => {
      const result = appointmentIdSchema.parse({ params: { id: 'appt-1' } });
      expect(result.params.id).toBe('appt-1');
    });

    it('rejects an empty id', () => {
      expect(() => appointmentIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });

  describe('availabilitySchema', () => {
    it('accepts a valid YYYY-MM-DD date', () => {
      const result = availabilitySchema.parse({
        params: { providerId: 'provider-1' },
        query: { date: '2026-08-03' },
      });
      expect(result.query.date).toBe('2026-08-03');
    });

    it('rejects a malformed date string', () => {
      expect(() =>
        availabilitySchema.parse({ params: { providerId: 'provider-1' }, query: { date: '08/03/2026' } })
      ).toThrow(/date must be YYYY-MM-DD/);
    });

    it('rejects a missing providerId', () => {
      expect(() =>
        availabilitySchema.parse({ params: {}, query: { date: '2026-08-03' } })
      ).toThrow();
    });
  });

  describe('getAppointmentsSchema', () => {
    it('parses with no query params at all', () => {
      const result = getAppointmentsSchema.parse({ query: {} });
      expect(result.query.page).toBeUndefined();
      expect(result.query.limit).toBeUndefined();
      expect(result.query.from).toBeUndefined();
      expect(result.query.to).toBeUndefined();
    });

    it('coerces string page/limit query params to numbers', () => {
      const result = getAppointmentsSchema.parse({ query: { page: '2', limit: '10' } });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
    });

    it('rejects a page below the minimum', () => {
      expect(() => getAppointmentsSchema.parse({ query: { page: '0' } })).toThrow();
    });

    it('rejects a limit above the maximum', () => {
      expect(() => getAppointmentsSchema.parse({ query: { limit: '101' } })).toThrow();
    });

    it('accepts from/to date range filters', () => {
      const result = getAppointmentsSchema.parse({
        query: { from: '2026-08-01', to: '2026-08-31' },
      });
      expect(result.query.from).toBeInstanceOf(Date);
      expect(result.query.to).toBeInstanceOf(Date);
    });
  });
});
