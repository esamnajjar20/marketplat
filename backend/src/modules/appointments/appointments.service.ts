import { Appointment } from '@prisma/client';
import { appointmentsRepository } from './appointments.repository';
import { CreateAppointmentInput, GetAppointmentsQuery } from './appointments.validation';
import { ConflictError } from '../../shared/errors/ConflictError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { withProviderScheduleLock } from '../../shared/utils/providerScheduleLock';
import { sellersRepository } from '../sellers/sellers.repository';
import { serviceProvidersRepository } from '../service-providers/service-providers.repository';
import { serviceRequestsRepository } from '../service-requests/service-requests.repository';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type DaySchedule = { open: string; close: string } | null;
type WorkingHours = Record<(typeof DAY_KEYS)[number], DaySchedule>;

const requireOwnProvider = async (userId: string) => {
  const sellerProfile = await sellersRepository.findByUserId(userId);
  if (!sellerProfile) throw new BadRequestError('You need a seller profile first.');
  const provider = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
  if (!provider) {
    throw new BadRequestError('You need to create your service provider profile first.');
  }
  return provider;
};

export const appointmentsService = {
  // services-design.md §8: two-layer race protection — cheap pre-check
  // outside the lock (fast-fail with no lock contention cost), then a
  // decisive re-check inside the lock that actually closes the race
  // between two concurrent bookings for the same provider/time.
  createAppointment: async (
    userId: string,
    input: CreateAppointmentInput
  ): Promise<Appointment> => {
    const provider = await requireOwnProvider(userId);

    if (input.requestId) {
      const request = await serviceRequestsRepository.findById(input.requestId);
      if (!request) throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      if (request.listing.providerId !== provider.id) {
        throw new ForbiddenError('This request does not belong to your listings.', 'NOT_YOUR_SERVICE_REQUEST');
      }
      if (!['ACCEPTED', 'IN_PROGRESS'].includes(request.status)) {
        throw new BadRequestError('Can only schedule an appointment for an accepted request.');
      }
    }

    const conflict = await appointmentsRepository.findOverlapping(
      provider.id,
      input.scheduledStart,
      input.scheduledEnd
    );
    if (conflict) throw new ConflictError('This time slot is already booked', 'TIME_SLOT_ALREADY_BOOKED');

    return withProviderScheduleLock(provider.id, async () => {
      const stillConflict = await appointmentsRepository.findOverlapping(
        provider.id,
        input.scheduledStart,
        input.scheduledEnd
      );
      if (stillConflict) throw new ConflictError('This time slot is already booked', 'TIME_SLOT_ALREADY_BOOKED');

      return appointmentsRepository.create(provider.id, {
        requestId: input.requestId,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        notes: input.notes,
      });
    });
  },

  getMyAppointments: async (
    userId: string,
    query: GetAppointmentsQuery
  ): Promise<PaginatedResult<Appointment>> => {
    const provider = await requireOwnProvider(userId);
    const { appointments, total } = await appointmentsRepository.findManyByProviderId(
      provider.id,
      query
    );
    return {
      items: appointments,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  updateAppointmentStatus: async (
    userId: string,
    id: string,
    status: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
  ): Promise<Appointment> => {
    const provider = await requireOwnProvider(userId);
    const appointment = await appointmentsRepository.findById(id);
    if (!appointment) throw new NotFoundError('Appointment not found', 'BOOKING_NOT_FOUND');
    if (appointment.providerId !== provider.id) {
      throw new ForbiddenError('You do not own this appointment.', 'NOT_YOUR_APPOINTMENT');
    }
    if (appointment.status !== 'SCHEDULED') {
      throw new ConflictError('Only a scheduled appointment can change status.', 'APPOINTMENT_NOT_SCHEDULED');
    }
    return appointmentsRepository.updateStatus(id, status);
  },

  // services-design.md §8: derived (not a separately-maintained
  // "Slots" table) — workingHours for the requested weekday minus any
  // SCHEDULED appointments already in that window.
  getAvailability: async (
    providerId: string,
    dateStr: string
  ): Promise<{ date: string; available: boolean; freeRanges: { start: string; end: string }[] }> => {
    const provider = await serviceProvidersRepository.findById(providerId);
    if (!provider) throw new NotFoundError('Service provider not found', 'SERVICE_PROVIDER_NOT_FOUND');

    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const dayKey = DAY_KEYS[date.getUTCDay()];
    const workingHours = provider.workingHours as unknown as WorkingHours;
    const daySchedule = workingHours?.[dayKey];

    if (!daySchedule) {
      return { date: dateStr, available: false, freeRanges: [] };
    }

    const rangeStart = new Date(`${dateStr}T${daySchedule.open}:00.000Z`);
    const rangeEnd = new Date(`${dateStr}T${daySchedule.close}:00.000Z`);

    const booked = await appointmentsRepository.findManyInRange(providerId, rangeStart, rangeEnd);

    // Walk the working window, subtracting each booked interval in order.
    const freeRanges: { start: string; end: string }[] = [];
    let cursor = rangeStart;
    for (const appt of booked) {
      const apptStart = appt.scheduledStart < rangeStart ? rangeStart : appt.scheduledStart;
      if (apptStart > cursor) {
        freeRanges.push({ start: cursor.toISOString(), end: apptStart.toISOString() });
      }
      const apptEnd = appt.scheduledEnd > rangeEnd ? rangeEnd : appt.scheduledEnd;
      if (apptEnd > cursor) cursor = apptEnd;
    }
    if (cursor < rangeEnd) {
      freeRanges.push({ start: cursor.toISOString(), end: rangeEnd.toISOString() });
    }

    return { date: dateStr, available: freeRanges.length > 0, freeRanges };
  },
};
