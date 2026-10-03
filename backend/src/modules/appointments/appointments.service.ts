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
import { activityService, activityTemplates } from '../activity';
import { blockedUsersService } from '../blocked-users';
import { notificationEvents } from '../notifications/notifications.service';
import { logger } from '../../shared/utils/logger';
import {
  WorkingHoursMap,
  fitsWorkingHours,
  weekdayKeyForDateStr,
  workingWindowUtc,
} from '../../shared/utils/marketTime';

const requireOwnProvider = async (userId: string) => {
  const sellerProfile = await sellersRepository.findByUserId(userId);
  if (!sellerProfile) throw new BadRequestError('You need a seller profile first.');
  // FIX APPT-SUSPENDED-GUARD: this was the only requireOwnProvider
  // across the codebase missing the suspended-seller check —
  // service-listings.service.ts's own version (the template this was
  // copied from) has it, as do the ads/sellers/store gates. Without
  // it an admin-suspended seller could still create, reschedule, or
  // cancel appointments. Same SELLER_SUSPENDED code as those gates.
  if (sellerProfile.suspended) {
    throw new ForbiddenError('Your seller account has been suspended.', 'SELLER_SUSPENDED');
  }
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

    let linkedRequest: Awaited<ReturnType<typeof serviceRequestsRepository.findById>> = null;
    if (input.requestId) {
      const request = await serviceRequestsRepository.findById(input.requestId);
      linkedRequest = request;
      if (!request) throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      if (request.listing.providerId !== provider.id) {
        throw new ForbiddenError('This request does not belong to your listings.', 'NOT_YOUR_SERVICE_REQUEST');
      }
      if (!['ACCEPTED', 'IN_PROGRESS'].includes(request.status)) {
        throw new BadRequestError('Can only schedule an appointment for an accepted request.');
      }
      // SECURITY FIX (blocked-user coverage gap): same gap closed in
      // service-requests.service.ts's createRequest — isBlockedEitherDirection
      // was never checked here either. Appointments in this project are
      // always provider-initiated (see requireOwnProvider above; there's
      // no separate customer-booking path), so the relevant pair to
      // check is the provider (userId, already resolved to `provider`
      // above) against the request's customer — a provider should not
      // be able to schedule an appointment tied to a customer either
      // side has blocked, even though the provider is the one clicking
      // the button.
      if (await blockedUsersService.isBlockedEitherDirection(userId, request.customerId)) {
        throw new ForbiddenError('You cannot schedule an appointment with this user.', 'USER_BLOCKED');
      }
    }

    // FIX APPT-WORKING-HOURS (audit H3): the slot must sit fully inside one
    // of the provider's working windows, evaluated in market time
    // (Asia/Gaza) — not UTC, not the server's zone. Providers with no
    // hours configured at all (legacy rows) are not blocked.
    if (
      provider.workingHours &&
      typeof provider.workingHours === 'object' &&
      !fitsWorkingHours(provider.workingHours, input.scheduledStart, input.scheduledEnd)
    ) {
      throw new BadRequestError(
        'The appointment must be within your working hours.',
        'OUTSIDE_WORKING_HOURS'
      );
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

      const appointment = await appointmentsRepository.create(provider.id, {
        requestId: input.requestId,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        notes: input.notes,
      });

      // Gap #10: fire-and-forget, see activityService.record()'s own
      // doc comment. Logged for `userId` (the provider) — appointments
      // in this project are always provider-managed (see this
      // function's own requireOwnProvider call above), there is no
      // separate customer-initiated booking path.
      activityService.record({
        userId,
        ...activityTemplates.appointmentBooked(appointment.id, appointment.scheduledStart),
      });

      if (linkedRequest) {
        notificationEvents
          .onAppointmentChanged(
            linkedRequest.customerId,
            linkedRequest.id,
            linkedRequest.listing.title,
            'booked',
            appointment.scheduledStart
          )
          .catch((err) =>
            logger.error('Failed to create APPOINTMENT_UPDATE notification', { err, appointmentId: appointment.id })
          );
      }

      return appointment;
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
    const updated = await appointmentsRepository.updateStatus(id, status);

    // Gap #10: only CANCELLED maps onto an activity type — COMPLETED/
    // NO_SHOW aren't in the task's 22-type list, so they're left
    // unlogged here rather than inventing types beyond what was asked
    // for. Fire-and-forget, see createAppointment's own comment above.
    if (status === 'CANCELLED') {
      activityService.record({
        userId,
        ...activityTemplates.appointmentCancelled(updated.id, updated.scheduledStart),
      });

      if (updated.requestId) {
        const linkedRequestId = updated.requestId;
        // Fire-and-forget: the lookup AND the notification both live
        // inside the try so neither can fail an already-saved cancel.
        void (async () => {
          try {
            const linked = await serviceRequestsRepository.findById(linkedRequestId);
            if (!linked) return;
            await notificationEvents.onAppointmentChanged(
              linked.customerId,
              linked.id,
              linked.listing.title,
              'cancelled',
              updated.scheduledStart
            );
          } catch (err) {
            logger.error('Failed to create APPOINTMENT_UPDATE notification', { err, appointmentId: updated.id });
          }
        })();
      }
    }

    return updated;
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
    // FIX APPT-AVAILABILITY-SUSPENDED: same SEC-FIX as every other
    // public read path (getPublicServiceProvider, getPublicStore,
    // getProductById, getAdById). findById returns the bare row
    // without its sellerProfile, so load the owner once to check.
    const owner = await sellersRepository.findById(provider.sellerProfileId);
    if (owner?.suspended) {
      throw new NotFoundError('Service provider not found', 'SERVICE_PROVIDER_NOT_FOUND');
    }

    // FIX APPT-TZ (audit H2): working hours are market-local wall-clock
    // times. They used to be glued to a literal `Z`, which shifted every
    // free slot by the market's UTC offset (2–3h) and picked the weekday in
    // UTC. The window is now built in Asia/Gaza and converted to UTC.
    const calendarDate = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== dateStr) {
      return { date: dateStr, available: false, freeRanges: [] };
    }
    const workingHours = provider.workingHours as unknown as WorkingHoursMap | null;
    const daySchedule = workingHours?.[weekdayKeyForDateStr(dateStr)];

    if (!daySchedule) {
      return { date: dateStr, available: false, freeRanges: [] };
    }

    const { start: rangeStart, end: rangeEnd } = workingWindowUtc(dateStr, daySchedule);

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
