import { z } from 'zod';
import { AuditEventType } from '@prisma/client';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

// Sortable columns — kept narrow (only indexed/simple scalar columns on
// AuditLog, see prisma/schema.prisma's @@index list) so `sortBy` can be
// passed straight into a Prisma `orderBy: { [sortBy]: sortOrder }` without
// risking an arbitrary/unindexed column being requested.
export const AUDIT_LOG_SORT_FIELDS = ['createdAt', 'event'] as const;
export type AuditLogSortField = (typeof AUDIT_LOG_SORT_FIELDS)[number];

// AuditLog has a single actor column, `userId` — whoever the action is
// attributed to (see shared/utils/auditLog.ts). For ADMIN_* events this
// is the acting admin's id (adminService's call sites pass
// `admin.userId` in as `userId`); for auth events (LOGIN_*, REGISTER,
// etc.) it's the subject user themselves. There is no separate
// "adminUserId" column on the model, so the filter surface only exposes
// `userId` — a caller narrowing to "what did this admin do" and a
// caller narrowing to "what happened to this user" both use the same
// param against the same column.
export const getAuditLogsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    event: z.nativeEnum(AuditEventType).optional(),
    userId: z.string().trim().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sortBy: z.enum(AUDIT_LOG_SORT_FIELDS).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
    // A `from` after `to` can never match anything — reject rather than
    // silently returning an empty page, so a caller finds out immediately
    // instead of concluding the log is empty.
    .refine(data => !data.from || !data.to || data.from <= data.to, {
      message: '"from" must be before or equal to "to"',
      path: ['from'],
    }),
});

export type GetAuditLogsQuery = z.infer<typeof getAuditLogsSchema>['query'];
