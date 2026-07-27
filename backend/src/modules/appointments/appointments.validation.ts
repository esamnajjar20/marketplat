import { z } from 'zod';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

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
