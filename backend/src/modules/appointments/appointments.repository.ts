import { prisma } from '../../config/prisma';
import { Appointment, Prisma } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

const appointmentPublicInclude = {
  request: {
    select: {
      id: true,
      customerId: true,
      listing: { select: { id: true, title: true, providerId: true } },
    },
  },
} as const;

export type AppointmentWithRequest = Appointment & {
  request: { id: string; customerId: string; listing: { id: string; title: string; providerId: string } } | null;
};

export const appointmentsRepository = {
  // services-design.md §8: classic interval-overlap query — two ranges
  // [start,end) overlap iff existingStart < newEnd AND existingEnd > newStart.
  findOverlapping: (providerId: string, start: Date, end: Date): Promise<Appointment | null> =>
    prisma.appointment.findFirst({
      where: {
        providerId,
        status: 'SCHEDULED',
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
    }),

  create: (
    providerId: string,
    data: { requestId?: string; scheduledStart: Date; scheduledEnd: Date; notes?: string }
  ): Promise<Appointment> =>
    prisma.appointment.create({
      data: {
        providerId,
        requestId: data.requestId,
        scheduledStart: data.scheduledStart,
        scheduledEnd: data.scheduledEnd,
        notes: data.notes,
      },
    }),

  findById: (id: string): Promise<Appointment | null> =>
    prisma.appointment.findUnique({ where: { id } }),

  updateStatus: (id: string, status: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'): Promise<Appointment> =>
    prisma.appointment.update({ where: { id }, data: { status } }),

  // Feeds the "available times" derivation (workingHours minus these).
  findManyInRange: (providerId: string, rangeStart: Date, rangeEnd: Date): Promise<Appointment[]> =>
    prisma.appointment.findMany({
      where: {
        providerId,
        status: 'SCHEDULED',
        scheduledStart: { lt: rangeEnd },
        scheduledEnd: { gt: rangeStart },
      },
      orderBy: { scheduledStart: 'asc' },
    }),

  // ANALYTICS: "what's still ahead of me" count for the provider
  // dashboard — SCHEDULED only (a COMPLETED/CANCELLED/NO_SHOW
  // appointment is no longer upcoming regardless of its date) and
  // strictly in the future.
  countUpcomingByProviderId: (providerId: string, now: Date = new Date()): Promise<number> =>
    prisma.appointment.count({
      where: { providerId, status: 'SCHEDULED', scheduledStart: { gte: now } },
    }),

  findManyByUserId: async (
    providerId: string | null,
    userId: string,
    query: { page?: number; limit?: number; from?: Date; to?: Date }
  ): Promise<{ appointments: AppointmentWithRequest[]; total: number }> => {
    const { page = 1, limit = 20, from, to } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.AppointmentWhereInput = {
      OR: [
        ...(providerId ? [{ providerId }] : []),
        { request: { customerId: userId } },
      ],
      ...((from || to) && {
        scheduledStart: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
    };

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({ where, include: appointmentPublicInclude, orderBy: { scheduledStart: 'asc' }, skip, take }),
      prisma.appointment.count({ where }),
    ]);
    return { appointments, total };
  },
};
