import { appointmentsService } from '../../src/modules/appointments/appointments.service';
import { appointmentsRepository } from '../../src/modules/appointments/appointments.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { serviceRequestsRepository } from '../../src/modules/service-requests/service-requests.repository';
import { redis } from '../../src/config/redis';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { ConflictError } from '../../src/shared/errors/ConflictError';

jest.mock('../../src/modules/appointments/appointments.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/service-requests/service-requests.repository');

const userId = 'user-1';
const sellerProfile = { id: 'seller-1', userId } as any;
const provider = { id: 'provider-1', sellerProfileId: 'seller-1' } as any;

const mockAppointment = {
  id: 'appt-1',
  providerId: provider.id,
  requestId: null,
  scheduledStart: new Date('2026-08-01T10:00:00.000Z'),
  scheduledEnd: new Date('2026-08-01T11:00:00.000Z'),
  status: 'SCHEDULED',
  notes: null,
} as any;

describe('appointmentsService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (redis as any).__clear();
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(sellerProfile);
    (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(provider);
  });

  describe('createAppointment', () => {
    const input = {
      scheduledStart: new Date('2099-08-01T10:00:00.000Z'),
      scheduledEnd: new Date('2099-08-01T11:00:00.000Z'),
    } as any;

    it('throws BadRequestError when the caller has no seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);

      await expect(appointmentsService.createAppointment(userId, input)).rejects.toThrow(
        BadRequestError
      );
      expect(serviceProvidersRepository.findBySellerProfileId).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when the caller has no service provider profile', async () => {
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);

      await expect(appointmentsService.createAppointment(userId, input)).rejects.toThrow(
        BadRequestError
      );
    });

    it('throws NotFoundError when requestId is given but the request does not exist', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        appointmentsService.createAppointment(userId, { ...input, requestId: 'req-1' })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the request belongs to a different provider', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue({
        status: 'ACCEPTED',
        listing: { providerId: 'someone-elses-provider' },
      });

      await expect(
        appointmentsService.createAppointment(userId, { ...input, requestId: 'req-1' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws BadRequestError when the request is not ACCEPTED or IN_PROGRESS', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue({
        status: 'PENDING',
        listing: { providerId: provider.id },
      });

      await expect(
        appointmentsService.createAppointment(userId, { ...input, requestId: 'req-1' })
      ).rejects.toThrow(BadRequestError);
    });

    it('allows an IN_PROGRESS request to be scheduled (not just ACCEPTED)', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue({
        status: 'IN_PROGRESS',
        listing: { providerId: provider.id },
      });
      (appointmentsRepository.findOverlapping as jest.Mock).mockResolvedValue(null);
      (appointmentsRepository.create as jest.Mock).mockResolvedValue(mockAppointment);

      const result = await appointmentsService.createAppointment(userId, {
        ...input,
        requestId: 'req-1',
      });

      expect(result).toEqual(mockAppointment);
    });

    it('creates an appointment with no requestId (direct booking)', async () => {
      (appointmentsRepository.findOverlapping as jest.Mock).mockResolvedValue(null);
      (appointmentsRepository.create as jest.Mock).mockResolvedValue(mockAppointment);

      const result = await appointmentsService.createAppointment(userId, input);

      expect(result).toEqual(mockAppointment);
      expect(serviceRequestsRepository.findById).not.toHaveBeenCalled();
      expect(appointmentsRepository.create).toHaveBeenCalledWith(provider.id, {
        requestId: undefined,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        notes: undefined,
      });
    });

    it('throws ConflictError when the pre-lock overlap check finds a conflict', async () => {
      (appointmentsRepository.findOverlapping as jest.Mock).mockResolvedValue(mockAppointment);

      await expect(appointmentsService.createAppointment(userId, input)).rejects.toThrow(
        ConflictError
      );
      expect(appointmentsRepository.create).not.toHaveBeenCalled();
    });

    // services-design.md §8: the decisive check happens again inside the
    // lock — this proves the second check is actually reached and can
    // independently reject even when the first (pre-lock) check passed,
    // simulating a conflict that appeared between the two checks.
    it('throws ConflictError when the in-lock re-check finds a conflict even though the pre-check passed', async () => {
      (appointmentsRepository.findOverlapping as jest.Mock)
        .mockResolvedValueOnce(null) // pre-lock check: clear
        .mockResolvedValueOnce(mockAppointment); // in-lock re-check: now conflicting

      await expect(appointmentsService.createAppointment(userId, input)).rejects.toThrow(
        ConflictError
      );
      expect(appointmentsRepository.create).not.toHaveBeenCalled();
      expect(appointmentsRepository.findOverlapping).toHaveBeenCalledTimes(2);
    });

    it('passes notes through to the repository when provided', async () => {
      (appointmentsRepository.findOverlapping as jest.Mock).mockResolvedValue(null);
      (appointmentsRepository.create as jest.Mock).mockResolvedValue(mockAppointment);

      await appointmentsService.createAppointment(userId, { ...input, notes: 'Bring the car in early' });

      expect(appointmentsRepository.create).toHaveBeenCalledWith(
        provider.id,
        expect.objectContaining({ notes: 'Bring the car in early' })
      );
    });

    it('serializes two concurrent createAppointment calls for the same provider so only one can win the slot', async () => {
      // The loser can be rejected via two different internal paths
      // depending on exact timing — either withProviderScheduleLock
      // itself (if it arrives after the winner already holds the Redis
      // lock) or the in-lock overlap re-check (if it arrives before the
      // winner but after the winner's create() has committed). Both
      // surface as ConflictError, which is the behavior that actually
      // matters here: exactly one caller gets the slot.
      let created = false;
      (appointmentsRepository.findOverlapping as jest.Mock).mockImplementation(async () =>
        created ? mockAppointment : null
      );
      (appointmentsRepository.create as jest.Mock).mockImplementation(async () => {
        created = true;
        return mockAppointment;
      });

      const firstPromise = appointmentsService.createAppointment(userId, input);
      const secondPromise = appointmentsService.createAppointment(userId, input);
      const results = await Promise.allSettled([firstPromise, secondPromise]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    });
  });

  describe('getMyAppointments', () => {
    it('throws BadRequestError when the caller has no provider profile', async () => {
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);

      await expect(appointmentsService.getMyAppointments(userId, {})).rejects.toThrow(
        BadRequestError
      );
    });

    it('returns paginated appointments for the caller’s provider profile', async () => {
      (appointmentsRepository.findManyByProviderId as jest.Mock).mockResolvedValue({
        appointments: [mockAppointment],
        total: 1,
      });

      const result = await appointmentsService.getMyAppointments(userId, { page: 1, limit: 20 });

      expect(result.items).toEqual([mockAppointment]);
      expect(result.meta.total).toBe(1);
      expect(appointmentsRepository.findManyByProviderId).toHaveBeenCalledWith(
        provider.id,
        { page: 1, limit: 20 }
      );
    });

    it('defaults page/limit in pagination meta when the query omits them', async () => {
      (appointmentsRepository.findManyByProviderId as jest.Mock).mockResolvedValue({
        appointments: [],
        total: 0,
      });

      const result = await appointmentsService.getMyAppointments(userId, {});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.items).toEqual([]);
    });
  });

  describe('updateAppointmentStatus', () => {
    it('throws BadRequestError when the caller has no provider profile', async () => {
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);

      await expect(
        appointmentsService.updateAppointmentStatus(userId, 'appt-1', 'COMPLETED')
      ).rejects.toThrow(BadRequestError);
    });

    it('throws NotFoundError when the appointment does not exist', async () => {
      (appointmentsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        appointmentsService.updateAppointmentStatus(userId, 'appt-1', 'COMPLETED')
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the appointment belongs to a different provider', async () => {
      (appointmentsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockAppointment,
        providerId: 'someone-elses-provider',
      });

      await expect(
        appointmentsService.updateAppointmentStatus(userId, 'appt-1', 'COMPLETED')
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws ConflictError when the appointment is not currently SCHEDULED', async () => {
      (appointmentsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
      });

      await expect(
        appointmentsService.updateAppointmentStatus(userId, 'appt-1', 'CANCELLED')
      ).rejects.toThrow(ConflictError);
    });

    it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)(
      'updates status to %s when the appointment is owned and SCHEDULED',
      async status => {
        (appointmentsRepository.findById as jest.Mock).mockResolvedValue(mockAppointment);
        (appointmentsRepository.updateStatus as jest.Mock).mockResolvedValue({
          ...mockAppointment,
          status,
        });

        const result = await appointmentsService.updateAppointmentStatus(userId, 'appt-1', status);

        expect(result.status).toBe(status);
        expect(appointmentsRepository.updateStatus).toHaveBeenCalledWith('appt-1', status);
      }
    );
  });

  describe('getAvailability', () => {
    const providerId = 'provider-1';

    it('throws NotFoundError when the provider does not exist', async () => {
      (serviceProvidersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(appointmentsService.getAvailability(providerId, '2026-08-03')).rejects.toThrow(
        NotFoundError
      );
    });

    it('returns unavailable with no free ranges when the provider is closed that weekday', async () => {
      // 2026-08-03 is a Monday (UTC) — closed if workingHours.mon is null.
      (serviceProvidersRepository.findById as jest.Mock).mockResolvedValue({
        workingHours: { sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null },
      });

      const result = await appointmentsService.getAvailability(providerId, '2026-08-03');

      expect(result).toEqual({ date: '2026-08-03', available: false, freeRanges: [] });
      expect(appointmentsRepository.findManyInRange).not.toHaveBeenCalled();
    });

    it('returns the full working window as free when there are no bookings', async () => {
      (serviceProvidersRepository.findById as jest.Mock).mockResolvedValue({
        workingHours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      });
      (appointmentsRepository.findManyInRange as jest.Mock).mockResolvedValue([]);

      const result = await appointmentsService.getAvailability(providerId, '2026-08-03');

      expect(result.available).toBe(true);
      expect(result.freeRanges).toEqual([
        { start: '2026-08-03T09:00:00.000Z', end: '2026-08-03T17:00:00.000Z' },
      ]);
    });

    it('subtracts a single booking from the middle of the working window', async () => {
      (serviceProvidersRepository.findById as jest.Mock).mockResolvedValue({
        workingHours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      });
      (appointmentsRepository.findManyInRange as jest.Mock).mockResolvedValue([
        {
          scheduledStart: new Date('2026-08-03T12:00:00.000Z'),
          scheduledEnd: new Date('2026-08-03T13:00:00.000Z'),
        },
      ]);

      const result = await appointmentsService.getAvailability(providerId, '2026-08-03');

      expect(result.available).toBe(true);
      expect(result.freeRanges).toEqual([
        { start: '2026-08-03T09:00:00.000Z', end: '2026-08-03T12:00:00.000Z' },
        { start: '2026-08-03T13:00:00.000Z', end: '2026-08-03T17:00:00.000Z' },
      ]);
    });

    it('returns unavailable with no free ranges when a booking covers the entire working window', async () => {
      (serviceProvidersRepository.findById as jest.Mock).mockResolvedValue({
        workingHours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      });
      (appointmentsRepository.findManyInRange as jest.Mock).mockResolvedValue([
        {
          scheduledStart: new Date('2026-08-03T09:00:00.000Z'),
          scheduledEnd: new Date('2026-08-03T17:00:00.000Z'),
        },
      ]);

      const result = await appointmentsService.getAvailability(providerId, '2026-08-03');

      expect(result.available).toBe(false);
      expect(result.freeRanges).toEqual([]);
    });

    it('clamps a booking that starts before the working window to the window start', async () => {
      (serviceProvidersRepository.findById as jest.Mock).mockResolvedValue({
        workingHours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      });
      (appointmentsRepository.findManyInRange as jest.Mock).mockResolvedValue([
        {
          // Starts before the window opens (e.g. spilled over from a
          // previous day's overlapping range query).
          scheduledStart: new Date('2026-08-03T07:00:00.000Z'),
          scheduledEnd: new Date('2026-08-03T10:00:00.000Z'),
        },
      ]);

      const result = await appointmentsService.getAvailability(providerId, '2026-08-03');

      expect(result.freeRanges).toEqual([
        { start: '2026-08-03T10:00:00.000Z', end: '2026-08-03T17:00:00.000Z' },
      ]);
    });

    it('clamps a booking that ends after the working window to the window end', async () => {
      (serviceProvidersRepository.findById as jest.Mock).mockResolvedValue({
        workingHours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      });
      (appointmentsRepository.findManyInRange as jest.Mock).mockResolvedValue([
        {
          scheduledStart: new Date('2026-08-03T16:00:00.000Z'),
          // Ends after the window closes.
          scheduledEnd: new Date('2026-08-03T19:00:00.000Z'),
        },
      ]);

      const result = await appointmentsService.getAvailability(providerId, '2026-08-03');

      expect(result.freeRanges).toEqual([
        { start: '2026-08-03T09:00:00.000Z', end: '2026-08-03T16:00:00.000Z' },
      ]);
    });

    it('handles multiple bookings with a gap between them', async () => {
      (serviceProvidersRepository.findById as jest.Mock).mockResolvedValue({
        workingHours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      });
      (appointmentsRepository.findManyInRange as jest.Mock).mockResolvedValue([
        {
          scheduledStart: new Date('2026-08-03T09:00:00.000Z'),
          scheduledEnd: new Date('2026-08-03T10:00:00.000Z'),
        },
        {
          scheduledStart: new Date('2026-08-03T14:00:00.000Z'),
          scheduledEnd: new Date('2026-08-03T15:00:00.000Z'),
        },
      ]);

      const result = await appointmentsService.getAvailability(providerId, '2026-08-03');

      expect(result.freeRanges).toEqual([
        { start: '2026-08-03T10:00:00.000Z', end: '2026-08-03T14:00:00.000Z' },
        { start: '2026-08-03T15:00:00.000Z', end: '2026-08-03T17:00:00.000Z' },
      ]);
    });

    it('handles back-to-back bookings with no gap between them (cursor exactly meets the next appt start)', async () => {
      (serviceProvidersRepository.findById as jest.Mock).mockResolvedValue({
        workingHours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      });
      (appointmentsRepository.findManyInRange as jest.Mock).mockResolvedValue([
        {
          scheduledStart: new Date('2026-08-03T09:00:00.000Z'),
          scheduledEnd: new Date('2026-08-03T12:00:00.000Z'),
        },
        {
          // Starts exactly where the previous one ends — no gap, so no
          // free range should be emitted between them.
          scheduledStart: new Date('2026-08-03T12:00:00.000Z'),
          scheduledEnd: new Date('2026-08-03T13:00:00.000Z'),
        },
      ]);

      const result = await appointmentsService.getAvailability(providerId, '2026-08-03');

      expect(result.freeRanges).toEqual([
        { start: '2026-08-03T13:00:00.000Z', end: '2026-08-03T17:00:00.000Z' },
      ]);
    });
  });
});
