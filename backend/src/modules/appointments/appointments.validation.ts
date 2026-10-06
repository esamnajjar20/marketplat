import { z } from 'zod';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

// (audit H3): nothing capped the length, so a 10-hour or
// multi-day "appointment" could block a provider's whole calendar.
export const MAX_APPOINTMENT_MINUTES = 8 * 60;

export const createAppointmentSchema = z.object({
  body: z
    .object({
      requestId: z.string().optional(),
      scheduledStart: z.coerce.date(),
      scheduledEnd: z.coerce.date(),
      notes: z.string().max(500).optional(),
    })
    .refine(data => data.scheduledEnd > data.scheduledStart, {
      message: 'scheduledEnd must be after scheduledStart',
      path: ['scheduledEnd'],
    })
    .refine(
      data => data.scheduledEnd.getTime() - data.scheduledStart.getTime() <= MAX_APPOINTMENT_MINUTES * 60_000,
      {
        message: `appointment cannot be longer than ${MAX_APPOINTMENT_MINUTES / 60} hours`,
        path: ['scheduledEnd'],
      }
    )
    .refine(data => data.scheduledStart.getTime() > Date.now(), {
      message: 'scheduledStart must be in the future',
      path: ['scheduledStart'],
    }),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>['body'];

export const updateAppointmentStatusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    status: z.enum(['COMPLETED', 'CANCELLED', 'NO_SHOW']),
  }),
});

export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>['body'];

export const appointmentIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Appointment ID is required') }),
});

// services-design.md §8: "show available times" — derived from
// workingHours minus existing SCHEDULED appointments in the requested
// range, for a single calendar day.
export const availabilitySchema = z.object({
  params: z.object({ providerId: z.string().min(1) }),
  query: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  }),
});

export const getAppointmentsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

export type GetAppointmentsQuery = z.infer<typeof getAppointmentsSchema>['query'];
