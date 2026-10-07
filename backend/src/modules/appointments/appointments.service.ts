import { Appointment } from '@prisma/client';
import { appointmentsRepository, AppointmentWithRequest } from './appointments.repository';
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
import { serviceTypesRepository } from '../service-types/service-types.repository';
import { getServiceTypeCapabilities } from '../service-types/service-types.service';
import {
  WorkingHoursMap,
  fitsWorkingHours,
  weekdayKeyForDateStr,
  workingWindowUtc,
} from '../../shared/utils/marketTime';

const requireOwnProvider = async (userId: string) => {
  const sellerProfile = await sellersRepository.findByUserId(userId);
  if (!sellerProfile) throw new BadRequestError('You need a seller profile first.');
  // this was the only requireOwnProvider
  // across the codebase missing the suspended-seller check —
  // service-listings.service.ts's own version (the this was
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
    let provider: Awaited<ReturnType<typeof requireOwnProvider>> | null = null;
    let linkedRequest: Awaited<ReturnType<typeof serviceRequestsRepository.findById>> = null;
    let actingAsCustomer = false;

    if (input.requestId) {
      const request = await serviceRequestsRepository.findById(input.requestId);
      linkedRequest = request;
      if (!request) throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      if (!['ACCEPTED', 'IN_PROGRESS'].includes(request.status)) {
        throw new BadRequestError('Can only schedule an appointment for an accepted request.');
      }

      const isCustomer = request.customerId === userId;
      if (isCustomer) {
        actingAsCustomer = true;
        provider = await serviceProvidersRepository.findById(request.listing.providerId);
        if (!provider) throw new NotFoundError('Service provider not found', 'SERVICE_PROVIDER_NOT_FOUND');
      } else {
        provider = await requireOwnProvider(userId);
        if (request.listing.providerId !== provider.id) {
          throw new ForbiddenError('This request does not belong to your listings.', 'NOT_YOUR_SERVICE_REQUEST');
        }
      }

      const serviceType = await serviceTypesRepository.findById(request.listing.serviceTypeId);
      if (!serviceType || !serviceType.isActive) {
        throw new BadRequestError('The service type is inactive and cannot be scheduled.', 'SERVICE_TYPE_INVALID');
      }
      if (getServiceTypeCapabilities(serviceType.capabilities).appointments === false) {
        throw new BadRequestError('This service type does not support appointments.', 'APPOINTMENTS_NOT_SUPPORTED');
      }
      const counterpartyUserId = isCustomer
        ? request.listing.provider.sellerProfile.userId
        : request.customerId;
      if (counterpartyUserId && await blockedUsersService.isBlockedEitherDirection(userId, counterpartyUserId)) {
        throw new ForbiddenError('You cannot schedule an appointment with this user.', 'USER_BLOCKED');
      }
    } else {
      // Standalone appointments remain provider-managed; without a request
      // there is no customer/provider pair to authorize for a customer.
      provider = await requireOwnProvider(userId);
    }

    if (!provider) throw new BadRequestError('A service provider is required to schedule an appointment.');

    if (provider.workingHours && typeof provider.workingHours === 'object' &&
      !fitsWorkingHours(provider.workingHours, input.scheduledStart, input.scheduledEnd)) {
      throw new BadRequestError('The appointment must be within your working hours.', 'OUTSIDE_WORKING_HOURS');
    }

    const conflict = await appointmentsRepository.findOverlapping(provider.id, input.scheduledStart, input.scheduledEnd);
    if (conflict) throw new ConflictError('This time slot is already booked', 'TIME_SLOT_ALREADY_BOOKED');

    return withProviderScheduleLock(provider.id, async () => {
      const stillConflict = await appointmentsRepository.findOverlapping(provider!.id, input.scheduledStart, input.scheduledEnd);
      if (stillConflict) throw new ConflictError('This time slot is already booked', 'TIME_SLOT_ALREADY_BOOKED');

      let appointment: Appointment;
      try {
        appointment = await appointmentsRepository.create(provider!.id, {
          requestId: input.requestId,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          notes: input.notes,
        });
      } catch (error: any) {
        if (error?.code === 'P2002' && input.requestId) {
          throw new ConflictError('This service request already has an appointment.', 'REQUEST_ALREADY_SCHEDULED');
        }
        throw error;
      }

      activityService.record({ userId, ...activityTemplates.appointmentBooked(appointment.id, appointment.scheduledStart) });

      if (linkedRequest) {
        const customerRecipient = linkedRequest.customerId;
        if (customerRecipient !== userId) {
          notificationEvents.onAppointmentChanged(
            customerRecipient, linkedRequest.id, linkedRequest.listing.title, 'booked', appointment.scheduledStart
          ).catch((err) => logger.error('Failed to create APPOINTMENT_UPDATE notification', { err, appointmentId: appointment.id }));
        }
        if (actingAsCustomer) {
          notificationEvents.onAppointmentChanged(
            linkedRequest.listing.provider.sellerProfile.userId, linkedRequest.id, linkedRequest.listing.title, 'booked', appointment.scheduledStart
          ).catch((err) => logger.error('Failed to notify provider of customer appointment booking', { err, appointmentId: appointment.id }));
        }
      }
      return appointment;
    });
  },

  getMyAppointments: async (
    userId: string,
    query: GetAppointmentsQuery
  ): Promise<PaginatedResult<AppointmentWithRequest>> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    const provider = sellerProfile ? await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id) : null;
    const { appointments, total } = await appointmentsRepository.findManyByUserId(provider?.id ?? null, userId, query);
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
    const appointment = await appointmentsRepository.findById(id);
    if (!appointment) throw new NotFoundError('Appointment not found', 'BOOKING_NOT_FOUND');
    const sellerProfile = await sellersRepository.findByUserId(userId);
    const provider = sellerProfile
      ? await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id)
      : null;
    const isProvider = provider?.id === appointment.providerId;
    let isCustomer = false;
    let linkedRequest: Awaited<ReturnType<typeof serviceRequestsRepository.findById>> = null;
    if (appointment.requestId) {
      linkedRequest = await serviceRequestsRepository.findById(appointment.requestId);
      isCustomer = linkedRequest?.customerId === userId;
    }
    if (!isProvider && !isCustomer) {
      throw new ForbiddenError('You do not own this appointment.', 'NOT_YOUR_APPOINTMENT');
    }
    if (isCustomer && status !== 'CANCELLED') {
      throw new ForbiddenError('Customers can only cancel their appointments.', 'CUSTOMER_APPOINTMENT_ACTION_NOT_ALLOWED');
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

      if (linkedRequest) {
        const recipient = isCustomer
          ? linkedRequest.listing.provider.sellerProfile.userId
          : linkedRequest.customerId;
        notificationEvents.onAppointmentChanged(
          recipient, linkedRequest.id, linkedRequest.listing.title, 'cancelled', updated.scheduledStart
        ).catch((err) => logger.error('Failed to create APPOINTMENT_UPDATE notification', { err, appointmentId: updated.id }));
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
    // same SEC-every other
    // public read path (getPublicServiceProvider, getPublicStore,
    // getProductById, getAdById). findById returns the bare row
    // without its sellerProfile, so load the owner once to check.
    const owner = await sellersRepository.findById(provider.sellerProfileId);
    if (owner?.suspended) {
      throw new NotFoundError('Service provider not found', 'SERVICE_PROVIDER_NOT_FOUND');
    }

    // (audit H2): working hours are market-local wall-clock
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
